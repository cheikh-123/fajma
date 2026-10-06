"""
Veille épidémiologique anonymisée, pour aider l'État (Direction de la Prévention, districts sanitaires) :

- source : le diagnostic codé choisi par le médecin dans son compte-rendu (medical/conditions.py, codes CIM-10),
  sinon, en secours, des mots-clés du motif et du diagnostic écrit ;
- comptes par maladie, par région (ville du médecin) et par semaine, suspects et confirmés distingués ;
- tableau de bord : cases de moins de 5 masquées (« <5 ») pour qu'on ne puisse reconnaître personne ;
- signal : semaine en cours nettement au-dessus de l'habitude (moyenne + 2 écarts-types des 8 semaines
  précédentes, au moins 5 cas et une fois et demie l'habitude) ; un seul cas de maladie à déclaration
  immédiate est toujours signalé ;
- rapport hebdomadaire au format SIMR (région × maladie, suspects / confirmés, codes CIM-10), comptes exacts,
  destiné aux autorités sanitaires dans le cadre d'une convention et après accord de la CDP ;
- déclarations des maladies à déclaration immédiate : liste, déclarées ou non au district.
Jamais d'identité de patient, ni de texte médical.
"""

from __future__ import annotations

import csv
import io
import re
import statistics
import unicodedata
from datetime import timedelta

from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts.views import require_admin
from appointments.models import Appointment
from audit import log as audit
from medical.conditions import BY_CODE, STATUSES

MIN_CELL = 5

# Secours, pour les comptes-rendus sans diagnostic codé : mots-clés → maladie du catalogue.
KEYWORDS: list[tuple[str, list[str]]] = [
    ("cholera", ["cholera"]),
    ("rougeole", ["rougeole"]),
    ("meningite", ["meningite", "raideur de nuque"]),
    ("dengue", ["dengue"]),
    ("fievre_jaune", ["fievre jaune"]),
    ("mpox", ["mpox", "variole du singe"]),
    ("paludisme", ["palu", "paludisme", "malaria", "fievre", "feebar", "tdr positif"]),
    ("typhoide", ["typhoide"]),
    ("diarrhee_sanglante", ["dysenterie", "diarrhee sanglante"]),
    ("diarrhee", ["diarrhee", "gastro", "vomissement", "biir"]),
    ("tuberculose", ["tuberculose"]),
    ("hepatite_b", ["hepatite b", "aghbs"]),
    ("hepatite_c", ["hepatite c"]),
    ("hepatite_a_e", ["hepatite", "ictere", "jaunisse"]),
    ("covid", ["covid"]),
    ("ira_pneumonie", ["pneumonie", "bronchite", "toux", "respir", "angine"]),
    ("grippe", ["grippe", "rhume"]),
    ("varicelle", ["varicelle"]),
    ("conjonctivite", ["conjonctivite", "yeux rouges", "oeil rouge"]),
    ("hypertension", ["hypertension", "hta"]),
    ("diabete", ["diabete"]),
]


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", (text or "").lower())
    return "".join(c for c in text if not unicodedata.combining(c))


def classify(text: str) -> str | None:
    """Maladie du catalogue devinée dans un texte libre (secours)."""
    t = _norm(text)
    for code, words in KEYWORDS:
        if any(re.search(rf"\b{re.escape(w)}", t) for w in words):
            return code
    return None


def _region_of(city: str, cache: dict) -> str:
    if city not in cache:
        from directory import localities

        loc = localities.find(city) if city else None
        cache[city] = loc.region if loc and loc.region else (city or "—")
    return cache[city]


def collect(weeks: int) -> tuple[list[str], list[dict]]:
    """Consultations des `weeks` dernières semaines, réduites à (semaine, région, maladie, confirmé)."""
    today = timezone.localdate()
    start = today - timedelta(days=today.weekday()) - timedelta(weeks=weeks - 1)
    labels = [(start + timedelta(weeks=i)).isoformat() for i in range(weeks)]
    rows = Appointment.objects.filter(scheduled_at__date__gte=start, status__in=["confirmed", "completed"]).values_list(
        "scheduled_at", "doctor__city", "reason", "record__diagnosis", "record__condition_code",
        "record__condition_status", "record__test_result",
    )
    cache: dict = {}
    out = []
    for at, city, reason, diagnosis, code, status, test in rows:
        coded = bool(code)
        code = code or classify(f"{diagnosis or ''} {reason or ''}")
        if not code or code == "autre" or test == "negative":
            continue
        d = timezone.localtime(at).date()
        out.append({
            "week": (d - timedelta(days=d.weekday())).isoformat(), "region": _region_of(city or "", cache), "code": code,
            "confirmed": status == "confirmed" or test == "positive", "coded": coded,
        })
    return labels, out


def table(cases: list[dict]) -> dict:
    counts: dict = {}
    for c in cases:
        counts.setdefault((c["code"], c["region"]), {}).setdefault(c["week"], 0)
        counts[(c["code"], c["region"])][c["week"]] += 1
    return counts


def signals(labels: list[str], counts: dict) -> list[dict]:
    out = []
    for (code, region), series in counts.items():
        cond = BY_CODE[code]
        values = [series.get(w, 0) for w in labels]
        current, history = values[-1], values[-9:-1]
        usual = round(statistics.mean(history), 1) if history else 0
        if cond.notify == "immediate" and current >= 1:
            out.append({"syndrome": cond.label, "city": region, "current": current, "usual": usual, "immediate": True})
            continue
        if current < MIN_CELL or len(history) < 4:
            continue
        mean, sd = statistics.mean(history), statistics.pstdev(history)
        if current > mean + 2 * sd and current >= mean * 1.5:
            out.append({"syndrome": cond.label, "city": region, "current": current, "usual": round(mean, 1), "immediate": False})
    return sorted(out, key=lambda s: (not s["immediate"], -s["current"]))


def _cell(n: int) -> int | str:
    return n if n == 0 or n >= MIN_CELL else f"<{MIN_CELL}"


def declarations() -> tuple[list[dict], int]:
    from medical.models import DiseaseNotification

    rows = DiseaseNotification.objects.select_related("record__doctor").order_by("-created_at")[:50]
    data = [
        {"id": str(n.id), "condition": BY_CODE[n.condition_code].label if n.condition_code in BY_CODE else n.condition_code,
         "status": STATUSES.get(n.condition_status, "Suspect"), "city": n.city, "region": n.region,
         "date": n.created_at.date().isoformat(), "doctor": n.record.doctor.full_name,
         "doctor_phone": n.record.doctor.practice_phone or None,
         "declared_at": n.declared_at.isoformat() if n.declared_at else None, "reference": n.reference or None}
        for n in rows
    ]
    return data, DiseaseNotification.objects.filter(declared_at__isnull=True).count()


def _csv(buf: io.StringIO, name: str) -> HttpResponse:
    res = HttpResponse("﻿" + buf.getvalue(), content_type="text/csv; charset=utf-8")
    res["Content-Disposition"] = f'attachment; filename="{name}"'
    return res


@api_view(["GET"])
def epidemio(request):
    require_admin(request)
    weeks = min(max(int(request.query_params.get("weeks", 12) or 12), 4), 52)
    labels, cases = collect(weeks)
    counts = table(cases)
    export = request.query_params.get("export")
    audit.log(request, "data_export", kind="veille_epidemiologique", weeks=weeks, export=export or "écran")
    if export == "csv":
        buf = io.StringIO()
        w = csv.writer(buf, delimiter=";")
        w.writerow(["Maladie", "CIM-10", "Région", *labels])
        for (code, region), series in sorted(counts.items()):
            w.writerow([BY_CODE[code].label, BY_CODE[code].icd10, region, *[_cell(series.get(x, 0)) for x in labels]])
        return _csv(buf, "fajma-veille-epidemiologique.csv")
    if export == "simr":
        # Rapport hebdomadaire SIMR : dernière semaine complète, maladies sous surveillance, comptes exacts.
        week = labels[-2]
        agg: dict = {}
        for c in cases:
            cond = BY_CODE[c["code"]]
            if c["week"] != week or not cond.notify:
                continue
            row = agg.setdefault((c["region"], c["code"]), {"suspects": 0, "confirmes": 0})
            row["confirmes" if c["confirmed"] else "suspects"] += 1
        buf = io.StringIO()
        w = csv.writer(buf, delimiter=";")
        w.writerow(["Semaine du", "Région", "Maladie", "CIM-10", "Déclaration", "Cas suspects", "Cas confirmés", "Total"])
        for (region, code), v in sorted(agg.items()):
            cond = BY_CODE[code]
            w.writerow([week, region, cond.label, cond.icd10, "immédiate" if cond.notify == "immediate" else "hebdomadaire",
                        v["suspects"], v["confirmes"], v["suspects"] + v["confirmes"]])
        return _csv(buf, f"fajma-rapport-simr-{week}.csv")
    decl, to_declare = declarations()
    return Response({
        "weeks": labels,
        "rows": [
            {"syndrome": BY_CODE[code].label, "icd10": BY_CODE[code].icd10, "group": BY_CODE[code].group, "city": region,
             "counts": [_cell(series.get(x, 0)) for x in labels], "total": _cell(sum(series.values()))}
            for (code, region), series in sorted(counts.items(), key=lambda kv: -sum(kv[1].values()))
        ],
        "signals": signals(labels, counts),
        "declarations": decl,
        "to_declare": to_declare,
        "coded_share": round(100 * sum(c["coded"] for c in cases) / len(cases)) if cases else None,
        "min_cell": MIN_CELL,
    })


# ── Médecin : catalogue et déclarations ──────────────────────────────


@api_view(["GET"])
def conditions_catalog(request):
    from backoffice.settings_registry import get_setting

    from medical.conditions import TEST_RESULTS, catalog
    from sunusante.api import require_user

    require_user(request)
    return Response({"conditions": catalog(), "statuses": STATUSES, "test_results": TEST_RESULTS,
                     "hotline": get_setting("epidemic_hotline") or None})


@api_view(["GET"])
def my_declarations(request):
    """Médecin : ses cas de maladies à déclaration immédiate, à déclarer au district."""
    from appointments.views import my_doctor
    from medical.models import DiseaseNotification
    from sunusante.api import require_user

    doctor = my_doctor(require_user(request))
    rows = DiseaseNotification.objects.filter(record__doctor=doctor).order_by("declared_at", "-created_at")[:50]
    return Response([
        {"id": str(n.id), "condition": BY_CODE[n.condition_code].label, "status": STATUSES.get(n.condition_status, "Suspect"),
         "date": n.created_at.date().isoformat(), "declared_at": n.declared_at.isoformat() if n.declared_at else None,
         "reference": n.reference or None}
        for n in rows
    ])


@api_view(["POST"])
def mark_declared(request, notification_id):
    """{reference} : le médecin (ou l'administration) indique que le cas a été déclaré au district."""
    from medical.models import DiseaseNotification
    from sunusante.api import ApiError, body, get_str, not_found, require_user

    user = require_user(request)
    n = DiseaseNotification.objects.filter(id=notification_id).select_related("record__doctor").first()
    if not n or not (user.is_staff or n.record.doctor.user_id == user.id):
        raise not_found("Déclaration introuvable")
    if n.declared_at:
        raise ApiError("Déjà déclarée")
    n.declared_at, n.declared_by = timezone.now(), user
    n.reference = get_str(body(request), "reference", max_len=80) or ""
    n.save(update_fields=["declared_at", "declared_by", "reference", "updated_at"])
    audit.log(request, "mdo_declared", notification=str(n.id), condition=n.condition_code)
    return Response({"ok": True})
