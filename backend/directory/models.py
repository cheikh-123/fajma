from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from sunusante.models import BaseModel


class Specialty(BaseModel):
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=80)
    icon = models.CharField(max_length=40, default="Stethoscope")
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "specialties"

    def __str__(self):
        return self.name


class Doctor(BaseModel):
    """Fiche professionnelle. Invisible dans l'annuaire tant qu'un administrateur ne l'a pas vérifiée."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="doctor"
    )
    full_name = models.CharField(max_length=120)
    specialty = models.ForeignKey(Specialty, null=True, on_delete=models.SET_NULL, related_name="doctors")
    city = models.CharField(max_length=80)
    address = models.CharField(max_length=200, blank=True)
    bio = models.TextField(blank=True, max_length=1000)
    years_experience = models.PositiveSmallIntegerField(default=0, validators=[MaxValueValidator(70)])
    consultation_price = models.PositiveIntegerField(default=15000)
    currency = models.CharField(max_length=3, default="XOF")
    teleconsultation = models.BooleanField(default=False)
    languages = models.JSONField(default=list)
    # Note et nombre d'avis : recalculés à chaque avis, jamais saisis par le médecin.
    rating = models.DecimalField(max_digits=2, decimal_places=1, default=0)
    reviews_count = models.PositiveIntegerField(default=0)
    avatar_url = models.URLField(blank=True)
    photo_path = models.CharField(max_length=300, blank=True)  # photo déposée par le médecin (publique)
    is_verified = models.BooleanField(default=False)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    # ── Règles de réservation (réglées par le médecin) ──
    auto_confirm = models.BooleanField(default=False, help_text="Confirme automatiquement les RDV pris en ligne")
    min_notice_hours = models.PositiveSmallIntegerField(default=1, validators=[MaxValueValidator(168)])
    booking_horizon_days = models.PositiveSmallIntegerField(default=60, validators=[MinValueValidator(1), MaxValueValidator(180)])
    accepts_new_patients = models.BooleanField(default=True)
    cancellation_deadline_hours = models.PositiveSmallIntegerField(
        default=24, validators=[MaxValueValidator(168)], help_text="0 = annulation en ligne possible jusqu'au dernier moment"
    )
    booking_instructions = models.TextField(blank=True, max_length=1000, help_text="Consignes affichées au patient avant le RDV")
    teleconsultation_prepayment = models.BooleanField(default=False, help_text="Paiement en ligne exigé avant une téléconsultation")
    questionnaire = models.JSONField(default=list, blank=True, help_text="Questions posées au patient avant la consultation")
    # ── Visites à domicile ──
    home_visits = models.BooleanField(default=False, help_text="Accepte les demandes de consultation à domicile")
    home_visit_fee = models.PositiveIntegerField(default=0, help_text="Supplément de déplacement ajouté au tarif")
    home_visit_area = models.CharField(max_length=300, blank=True, help_text="Quartiers ou communes desservis")
    # En-tête des ordonnances et certificats
    order_number = models.CharField(max_length=40, blank=True, help_text="N° d'inscription à l'Ordre national des médecins du Sénégal")
    professional_title = models.CharField(max_length=160, blank=True, help_text="Titres et qualifications (ex. Ancien interne des hôpitaux)")
    practice_name = models.CharField(max_length=160, blank=True, help_text="Cabinet, clinique ou hôpital d'exercice")
    practice_phone = models.CharField(max_length=30, blank=True)
    signature_path = models.CharField(max_length=300, blank=True)  # image privée (PNG/JPEG)
    stamp_path = models.CharField(max_length=300, blank=True)  # cachet, image privée

    class Meta:
        ordering = ["-rating", "full_name"]

    def __str__(self):
        return self.full_name


class DoctorLocation(BaseModel):
    """Lieu de consultation supplémentaire (cabinet secondaire, clinique, dispensaire)."""

    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name="locations")
    name = models.CharField(max_length=120)
    address = models.CharField(max_length=200)
    city = models.CharField(max_length=80)
    phone = models.CharField(max_length=30, blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    class Meta:
        ordering = ["name"]


class DoctorAvailability(BaseModel):
    """Plage horaire hebdomadaire. weekday : 0 = dimanche … 6 = samedi (comme JavaScript)."""

    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name="availability")
    # Vide = cabinet principal (adresse de la fiche).
    location = models.ForeignKey(DoctorLocation, null=True, blank=True, on_delete=models.CASCADE, related_name="availability")
    weekday = models.PositiveSmallIntegerField(validators=[MaxValueValidator(6)])
    start_time = models.TimeField()
    end_time = models.TimeField()
    slot_minutes = models.PositiveSmallIntegerField(default=30, validators=[MinValueValidator(10), MaxValueValidator(240)])
    # Une plage « domicile » n'accueille que des visites à domicile (déplacement compris dans la durée du créneau).
    KINDS = [("office", "Cabinet et vidéo"), ("home_visit", "Visites à domicile")]
    kind = models.CharField(max_length=10, choices=KINDS, default="office")

    class Meta:
        ordering = ["weekday", "start_time"]
        constraints = [
            models.CheckConstraint(condition=models.Q(end_time__gt=models.F("start_time")), name="availability_end_after_start"),
        ]


class TimeOff(BaseModel):
    """Absence du médecin (congés, formation, garde) : aucun créneau n'est proposé pendant cette période."""

    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name="time_off")
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    reason = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ["starts_at"]
        constraints = [models.CheckConstraint(condition=models.Q(ends_at__gt=models.F("starts_at")), name="time_off_end_after_start")]


class ConsultationType(BaseModel):
    """Motif de consultation avec sa durée et son tarif propres."""

    MODES = [("in_person", "Cabinet"), ("teleconsultation", "Vidéo"), ("both", "Cabinet et vidéo"), ("home_visit", "À domicile")]

    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name="consultation_types")
    name = models.CharField(max_length=120)
    duration_minutes = models.PositiveSmallIntegerField(default=30, validators=[MinValueValidator(5), MaxValueValidator(240)])
    price = models.PositiveIntegerField()
    mode = models.CharField(max_length=20, choices=MODES, default="both")
    is_active = models.BooleanField(default=True)
    position = models.IntegerField(default=0)
    questionnaire = models.JSONField(default=list, blank=True, help_text="Remplace le questionnaire par défaut du médecin")
    # Série de séances (kinésithérapie, pansements, rééducation…) : nombre maximal réservable en une fois, 0 = non.
    series_max = models.PositiveSmallIntegerField(default=0, validators=[MaxValueValidator(20)])

    class Meta:
        ordering = ["position", "name"]

    def allows(self, mode: str) -> bool:
        """Un motif « cabinet » ou « cabinet et vidéo » peut aussi se faire à domicile ; un motif « domicile » seulement là."""
        if mode == "home_visit":
            return self.mode in {"home_visit", "in_person", "both"}
        return self.mode in {"both", mode}


class Replacement(BaseModel):
    """
    Remplacement : pendant la période, l'agenda du titulaire reste ouvert et ses patients sont reçus par
    le remplaçant (un autre médecin vérifié), qui consulte, rédige les comptes-rendus et signe ses ordonnances.
    Les paiements restent versés au titulaire (la rétrocession se règle entre eux).
    """

    STATUSES = [("pending", "Proposé"), ("accepted", "Accepté"), ("declined", "Refusé"), ("cancelled", "Annulé")]

    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name="replacements")
    replacement = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name="replacing")
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    status = models.CharField(max_length=10, choices=STATUSES, default="pending", db_index=True)
    note = models.CharField(max_length=300, blank=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["starts_at"]
        constraints = [
            models.CheckConstraint(condition=models.Q(ends_at__gt=models.F("starts_at")), name="replacement_end_after_start"),
            models.CheckConstraint(condition=~models.Q(doctor=models.F("replacement")), name="replacement_not_self"),
        ]


class Pharmacy(BaseModel):
    name = models.CharField(max_length=120)
    city = models.CharField(max_length=80)
    district = models.CharField(max_length=80, blank=True)
    address = models.CharField(max_length=200)
    phone = models.CharField(max_length=30, blank=True)
    is_on_duty = models.BooleanField(default=False)
    on_duty_until = models.DateTimeField(null=True, blank=True, help_text="Fin de la garde (vide = jusqu'à nouvel ordre)")
    opens_at = models.TimeField(default="08:00")
    closes_at = models.TimeField(default="20:00")
    # Jours d'ouverture : 0 = dimanche … 6 = samedi (comme JavaScript).
    open_days = models.JSONField(default=list, blank=True)
    latitude = models.FloatField()
    longitude = models.FloatField()

    class Meta:
        ordering = ["city", "name"]
        verbose_name_plural = "pharmacies"

    @property
    def on_duty_now(self) -> bool:
        from django.utils import timezone

        return self.is_on_duty and (self.on_duty_until is None or self.on_duty_until > timezone.now())


class Review(BaseModel):
    """Avis laissé après un rendez-vous terminé (un seul par rendez-vous)."""

    appointment = models.OneToOneField("appointments.Appointment", on_delete=models.CASCADE, related_name="review")
    patient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews")
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name="reviews")
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.TextField(blank=True, max_length=1200)

    # Modération : un avis signalé reste visible jusqu'à la décision de l'administration ; un avis masqué
    # n'est plus affiché ni compté dans la note.
    STATUSES = [("published", "Publié"), ("reported", "Signalé"), ("hidden", "Masqué")]
    status = models.CharField(max_length=10, choices=STATUSES, default="published")
    report_reason = models.CharField(max_length=300, blank=True)
    reported_at = models.DateTimeField(null=True, blank=True)
    moderated_at = models.DateTimeField(null=True, blank=True)
    doctor_reply = models.TextField(blank=True, max_length=1000)
    replied_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        refresh_doctor_rating(self.doctor)

    def delete(self, *args, **kwargs):
        doctor = self.doctor
        result = super().delete(*args, **kwargs)
        refresh_doctor_rating(doctor)
        return result


def refresh_doctor_rating(doctor: Doctor) -> None:
    agg = doctor.reviews.exclude(status="hidden").aggregate(avg=models.Avg("rating"), n=models.Count("id"))
    Doctor.objects.filter(pk=doctor.pk).update(
        rating=round(agg["avg"] or 0, 1), reviews_count=agg["n"] or 0
    )


class DoctorCredential(BaseModel):
    """Justificatif déposé par le médecin (diplôme, inscription à l'Ordre, pièce d'identité), contrôlé par l'administration."""

    KINDS = [
        ("ordre", "Inscription à l'Ordre des médecins"),
        ("diplome", "Diplôme de médecine / spécialité"),
        ("identite", "Pièce d'identité"),
        ("autre", "Autre justificatif"),
    ]
    STATUSES = [("pending", "En cours de vérification"), ("accepted", "Accepté"), ("rejected", "Refusé")]

    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name="credentials")
    kind = models.CharField(max_length=10, choices=KINDS)
    title = models.CharField(max_length=160, blank=True)
    file_path = models.CharField(max_length=300)
    mime_type = models.CharField(max_length=60)
    size_bytes = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=10, choices=STATUSES, default="pending")
    review_note = models.CharField(max_length=300, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


def new_feed_token() -> str:
    import secrets

    return secrets.token_urlsafe(32)


class CalendarLink(BaseModel):
    """
    Synchronisation avec l'agenda personnel du médecin (Google Agenda, Outlook, iPhone) :
    - export : lien d'abonnement privé (feed_token) listant ses RDV Fajma ;
    - import : adresse iCal secrète de son agenda, dont les événements bloquent les créneaux Fajma.
    """

    doctor = models.OneToOneField(Doctor, on_delete=models.CASCADE, related_name="calendar_link")
    feed_token = models.CharField(max_length=64, unique=True, default=new_feed_token)
    import_url = models.URLField(max_length=1000, blank=True)
    last_import_at = models.DateTimeField(null=True, blank=True)
    last_import_error = models.CharField(max_length=300, blank=True)
    imported_count = models.PositiveIntegerField(default=0)


class ExternalBusy(BaseModel):
    """Période occupée importée de l'agenda personnel du médecin (sans titre ni détail : seulement l'horaire)."""

    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name="external_busy")
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()

    class Meta:
        indexes = [models.Index(fields=["doctor", "ends_at"])]
