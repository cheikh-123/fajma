"""
Veille épidémiologique anonymisée : consultations regroupées par grand syndrome (fièvre / paludisme, diarrhée,
toux et infections respiratoires, éruption, dengue, conjonctivite…), par ville et par semaine, à partir du
motif de rendez-vous et du diagnostic du médecin. Aucune donnée personnelle ne sort : seulement des comptes,
et les cases de moins de 5 consultations sont masquées (« <5 ») pour qu'on ne puisse reconnaître personne.

Signal : semaine en cours nettement au-dessus de l'habitude (moyenne + 2 écarts-types des 8 semaines
précédentes, et au moins 5 cas) — à vérifier par les autorités sanitaires, jamais un diagnostic.
Accès : administration ; partage avec le ministère après accord de la CDP.
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

MIN_CELL = 5

SYNDROMES: list[tuple[str, str, list[str]]] = [
    ("paludisme", "Fièvre / paludisme", ["palu", "paludisme", "malaria", "fievre", "feebar", "tdr positif"]),
    ("dengue", "Dengue (suspicion)", ["dengue"]),
    ("diarrhee", "Diarrhée / gastro-entérite", ["diarrhee", "gastro", "vomissement", "cholera", "biir"]),
    ("respiratoire", "Toux / infection respiratoire", ["toux", "grippe", "rhume", "bronchite", "pneumonie", "angine", "covid", "respir"]),
    ("eruption", "Éruption (rougeole, varicelle…)", ["rougeole", "varicelle", "eruption", "boutons", "mpox", "variole"]),
    ("conjonctivite", "Conjonctivite", ["conjonctivite", "yeux rouges", "oeil rouge"]),
    ("meningite", "Méningite (suspicion)", ["meningite", "raideur de nuque"]),
]


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", (text or "").lower())
    return "".join(c for c in text if not unicodedata.combining(c))


def classify(text: str) -> str | None:
    t = _norm(text)
    for code, _, words in SYNDROMES:
        if any(re.search(rf"\b{re.escape(w)}", t) for w in words):
            return code
    return None


def weekly_counts(weeks: int = 12) -> tuple[list[str], dict]:
    """{(syndrome, ville): {semaine: nombre}} sur les consultations réalisées ou confirmées."""
    today = timezone.localdate()
    start = today - timedelta(days=today.weekday()) - timedelta(weeks=weeks - 1)
    labels = [(start + timedelta(weeks=i)).isoformat() for i in range(weeks)]
    rows = (
        Appointment.objects.filter(scheduled_at__date__gte=start, status__in=["confirmed", "completed"])
        .select_related("doctor")
        .values_list("scheduled_at", "doctor__city", "reason", "record__diagnosis")
    )
    counts: dict = {}
    for at, city, reason, diagnosis in rows:
        code = classify(f"{diagnosis or ''} {reason or ''}")
        if not code:
            continue
        d = timezone.localtime(at).date()
        week = (d - timedelta(days=d.weekday())).isoformat()
        key = (code, city or "—")
        counts.setdefault(key, {}).setdefault(week, 0)
        counts[key][week] += 1
    return labels, counts


def signals(labels: list[str], counts: dict) -> list[dict]:
    out = []
    names = {c: n for c, n, _ in SYNDROMES}
    for (code, city), series in counts.items():
        values = [series.get(w, 0) for w in labels]
        current, history = values[-1], values[-9:-1]
        if current < MIN_CELL or len(history) < 4:
            continue
        mean = statistics.mean(history)
        sd = statistics.pstdev(history)
        if current > mean + 2 * sd and current >= mean * 1.5:
            out.append({"syndrome": names[code], "city": city, "current": current, "usual": round(mean, 1)})
    return sorted(out, key=lambda s: -s["current"])


def _cell(n: int) -> int | str:
    return n if n == 0 or n >= MIN_CELL else f"<{MIN_CELL}"


@api_view(["GET"])
def epidemio(request):
    require_admin(request)
    weeks = min(max(int(request.query_params.get("weeks", 12) or 12), 4), 52)
    labels, counts = weekly_counts(weeks)
    names = {c: n for c, n, _ in SYNDROMES}
    audit.log(request, "data_export", kind="veille_epidemiologique", weeks=weeks)
    if request.query_params.get("export") == "csv":
        buf = io.StringIO()
        w = csv.writer(buf, delimiter=";")
        w.writerow(["Syndrome", "Ville", *labels])
        for (code, city), series in sorted(counts.items()):
            w.writerow([names[code], city, *[_cell(series.get(x, 0)) for x in labels]])
        res = HttpResponse("﻿" + buf.getvalue(), content_type="text/csv; charset=utf-8")
        res["Content-Disposition"] = 'attachment; filename="fajma-veille-epidemiologique.csv"'
        return res
    return Response({
        "weeks": labels,
        "rows": [
            {"syndrome": names[code], "city": city, "counts": [_cell(series.get(x, 0)) for x in labels],
             "total": _cell(sum(series.values()))}
            for (code, city), series in sorted(counts.items(), key=lambda kv: -sum(kv[1].values()))
        ],
        "signals": signals(labels, counts),
        "min_cell": MIN_CELL,
    })
