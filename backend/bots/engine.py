"""
Menu de réservation commun à WhatsApp et à l'USSD (#…# sur tout téléphone, sans internet),
en français, wolof ou anglais.

Le moteur rejoue toutes les réponses de la session depuis le menu principal : une réponse invalide
est ignorée (avec un message « Choix invalide »), « 00 » ramène au menu principal. Les listes
affichées sont mémorisées dans la session (memo) pour rester identiques jusqu'à la fin.
Langue : celle du compte du numéro, modifiable par l'option « Làkk / Langue / Language ».
"""

from __future__ import annotations

from dataclasses import dataclass

from django.db import IntegrityError
from django.db.models import Count, Q
from django.utils import timezone

from accounts.models import User
from appointments.models import ACTIVE_STATUSES, Appointment
from appointments.scheduling import compute_slots, parse_datetime, slot_label
from directory.models import Doctor, Pharmacy, Specialty
from sunusante.api import ApiError

from .texts import LANG_OPTIONS, TEXTS

HOME = "00"
MORE = "9"  # page suivante d'une liste (les pages font au plus 8 choix)
MAX_LIST = 40


@dataclass
class Reply:
    text: str
    end: bool


class _Prompt(Exception):
    def __init__(self, text: str):
        self.text = text


class Flow:
    def __init__(self, phone: str, inputs: list[str], memo: dict, *, compact: bool):
        # « 00 » : on repart du menu principal avec les réponses qui suivent.
        if HOME in inputs:
            inputs = inputs[len(inputs) - inputs[::-1].index(HOME) :]
        self.phone = phone
        self.queue = [i.strip() for i in inputs]
        self.memo = memo
        self.compact = compact
        self.max_options = 5 if compact else 8
        self.step = 0
        self.path: list[str] = []
        self.invalid = False
        self._user = None
        self._user_loaded = False
        user = self.user()
        self.lang = memo.get("_lang") or (user.preferred_language if user else "fr")
        if self.lang not in TEXTS:
            self.lang = "fr"

    def tr(self, key: str, **kwargs) -> str:
        text = TEXTS[self.lang][key]
        return text.format(**kwargs) if kwargs else text

    # ── Primitives ──
    def choose(self, title: str, options, *, key: str, page_size: int | None = None) -> str:
        """Question à choix numérotés. options : liste (valeur, libellé), ou fonction qui la calcule."""
        self.step += 1
        # Clé = chemin des choix précédents : une autre spécialité donne une autre liste de médecins.
        memo_key = "/".join([*self.path, key])
        if memo_key not in self.memo:
            opts = options() if callable(options) else options
            self.memo[memo_key] = [[v, label] for v, label in opts[:MAX_LIST]]
        all_opts = self.memo[memo_key]
        size, page = page_size or self.max_options, 0
        while self.queue:
            raw = self.queue.pop(0)
            opts = all_opts[page * size : (page + 1) * size]
            if raw == MORE and (page + 1) * size < len(all_opts):
                page += 1
                continue
            if raw.isdigit() and 1 <= int(raw) <= len(opts):
                self.invalid = False
                self.path.append(opts[int(raw) - 1][0])
                return opts[int(raw) - 1][0]
            self.invalid = True
        opts = all_opts[page * size : (page + 1) * size]
        lines = [f"{i}. {label}" for i, (_, label) in enumerate(opts, 1)]
        if (page + 1) * size < len(all_opts):
            lines.append(f"{MORE}. {self.tr('more')}")
        raise _Prompt("\n".join([title, *lines]))

    def ask_text(self, title: str, *, min_len: int, max_len: int) -> str:
        self.step += 1
        while self.queue:
            raw = " ".join(self.queue.pop(0).split())
            if min_len <= len(raw) <= max_len:
                self.invalid = False
                return raw
            self.invalid = True
        raise _Prompt(title)

    def user(self) -> User | None:
        if not self._user_loaded:
            self._user = User.objects.filter(phone=self.phone, phone_verified=True, is_active=True).first()
            self._user_loaded = True
        return self._user

    # ── Menus ──
    def home_options(self):
        return [
            ("book", self.tr("book")),
            ("mine", self.tr("mine")),
            ("cancel", self.tr("cancel")),
            ("pharma", self.tr("pharma")),
            ("lang", self.tr("lang")),
        ]

    def run(self) -> Reply:
        try:
            while True:
                # Libellés du menu mémorisés par langue : le changement de langue réaffiche le menu traduit.
                choice = self.choose(self.tr("home"), self.home_options(), key=f"home-{self.lang}")
                if choice != "lang":
                    break
                self.choose_language()
            return {"book": self.book, "mine": self.mine, "cancel": self.cancel, "pharma": self.pharmacies}[choice]()
        except _Prompt as p:
            prefix = self.tr("invalid") if self.invalid else ""
            suffix = "" if self.step <= 1 else "\n" + self.tr("home_opt")
            return Reply(prefix + p.text + suffix, end=False)

    def choose_language(self) -> None:
        lang = self.choose(self.tr("choose_lang"), LANG_OPTIONS, key="lang")
        self.lang = lang
        self.memo["_lang"] = lang
        user = self.user()
        if user and user.preferred_language != lang:
            # La langue choisie devient aussi celle des SMS de rappel.
            User.objects.filter(id=user.id).update(preferred_language=lang)

    def book(self) -> Reply:
        doctors = Doctor.objects.filter(is_verified=True, availability__isnull=False).distinct()
        # Spécialité et ville devinées dans un message libre (« un pédiatre à Thiès », message vocal) : sautées.
        spec_id = self.memo.get("_spec") or self.choose(
            self.tr("specialty"),
            lambda: [
                (str(s.id), s.name)
                for s in Specialty.objects.annotate(n=Count("doctors", filter=Q(doctors__in=doctors))).filter(n__gt=0).order_by("-n", "name")
            ],
            key="spec",
        )
        prefilled_city = self.memo.get("_city")
        if prefilled_city and not doctors.filter(specialty_id=spec_id, city=prefilled_city).exists():
            prefilled_city = None
        city = prefilled_city or self.choose(
            self.tr("city"),
            lambda: [(c, c) for c in doctors.filter(specialty_id=spec_id).values_list("city", flat=True).distinct().order_by("city")],
            key="city",
        )

        def doctor_options():
            opts = []
            for d in doctors.filter(specialty_id=spec_id, city=city).order_by("-rating", "full_name")[:10]:
                slots = compute_slots(d.id, 14)["slots"]
                if slots:
                    opts.append((str(d.id), f"{d.full_name} {d.consultation_price}F ({slots[0]['label']})"))
            return opts

        doctor_id = self.choose(self.tr("doctor"), doctor_options, key="doctor")
        doctor = Doctor.objects.get(id=doctor_id)
        slot = self.choose(
            self.tr("slot", doctor=doctor.full_name),
            lambda: [(s["iso"], s["label"]) for s in compute_slots(doctor.id, 14)["slots"]],
            key="slot",
        )
        user = self.user()
        name = None if user else self.ask_text(self.tr("name"), min_len=3, max_len=80)
        when = parse_datetime(slot)
        confirm = self.choose(
            self.tr("confirm_q", doctor=doctor.full_name, when=slot_label(when), price=doctor.consultation_price),
            [("yes", self.tr("confirm")), ("no", self.tr("abort"))],
            key="confirm",
        )
        if confirm == "no":
            return Reply(self.tr("aborted"), end=True)

        from appointments.views import book_for_patient

        if not user:
            # Numéro déjà vérifié par l'opérateur (USSD) ou par WhatsApp : pas de code SMS à saisir.
            user = User(phone=self.phone, phone_verified=True, full_name=name, preferred_language=self.lang)
            user.set_unusable_password()
            user.save()
        try:
            appt = book_for_patient(
                user,
                doctor,
                when,
                reason="Réservé par " + ("USSD" if self.compact else "WhatsApp"),
                channel="ussd" if self.compact else "whatsapp",
            )
        except ApiError as err:
            return Reply(self.tr("sorry", error=err.detail), end=True)
        except IntegrityError:  # contrainte anti-chevauchement PostgreSQL : créneau pris entre-temps
            return Reply(self.tr("taken"), end=True)
        key = "booked_ok" if appt.status == "confirmed" else "booked_pending"
        return Reply(self.tr(key, doctor=doctor.full_name, when=slot_label(when)), end=True)

    def _upcoming(self, user: User):
        return (
            Appointment.objects.filter(patient=user, status__in=ACTIVE_STATUSES, scheduled_at__gt=timezone.now())
            .select_related("doctor")
            .order_by("scheduled_at")
        )

    def mine(self) -> Reply:
        user = self.user()
        appts = list(self._upcoming(user)[:4]) if user else []
        if not appts:
            return Reply(self.tr("none_upcoming"), end=True)
        lines = [
            f"- {slot_label(a.scheduled_at)} {a.doctor.full_name}" + ("" if a.status == "confirmed" else self.tr("pending")) for a in appts
        ]
        return Reply(self.tr("your_appts") + "\n".join(lines), end=True)

    def cancel(self) -> Reply:
        from appointments.views import cancel, cancellation_open

        user = self.user()
        appts = list(self._upcoming(user)) if user else []
        if not appts:
            return Reply(self.tr("none_cancel"), end=True)
        appt_id = self.choose(
            self.tr("which_cancel"), [(str(a.id), f"{slot_label(a.scheduled_at)} {a.doctor.full_name}") for a in appts], key="appt"
        )
        confirm = self.choose(self.tr("cancel_q"), [("yes", self.tr("yes_cancel")), ("no", self.tr("no"))], key="confirm")
        if confirm == "no":
            return Reply(self.tr("kept"), end=True)
        appt = Appointment.objects.filter(id=appt_id, patient=user, status__in=ACTIVE_STATUSES).select_related("doctor").first()
        if not appt:
            return Reply(self.tr("already"), end=True)
        if not cancellation_open(appt):
            return Reply(self.tr("too_late", h=appt.doctor.cancellation_deadline_hours), end=True)
        cancel(appt, "patient", "Annulé par " + ("USSD" if self.compact else "WhatsApp"))
        return Reply(self.tr("cancelled"), end=True)

    def pharmacies(self) -> Reply:
        city = self.choose(
            self.tr("city"), lambda: [(c, c) for c in Pharmacy.objects.values_list("city", flat=True).distinct().order_by("city")], key="pcity"
        )
        items = Pharmacy.objects.filter(city=city).order_by("-is_on_duty", "name")[: 3 if self.compact else 6]
        lines = [f"- {p.name}{self.tr('on_duty') if p.is_on_duty else ''} {p.phone}".rstrip() for p in items]
        return Reply(self.tr("pharmacies", city=city) + "\n".join(lines), end=True)


def handle(phone: str, inputs: list[str], memo: dict, *, compact: bool = False) -> Reply:
    return Flow(phone, inputs, memo, compact=compact).run()
