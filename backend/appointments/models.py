import secrets
from datetime import timedelta

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from sunusante.models import BaseModel

ACTIVE_STATUSES = ("pending", "confirmed")


class Appointment(BaseModel):
    STATUSES = [
        ("pending", "En attente"),
        ("confirmed", "Confirmé"),
        ("cancelled", "Annulé"),
        ("completed", "Terminé"),
        ("no_show", "Absent"),
    ]
    CANCELLED_BY = [("patient", "Patient"), ("doctor", "Médecin"), ("clinic", "Secrétariat")]
    MODES = [("in_person", "Cabinet"), ("teleconsultation", "Téléconsultation"), ("home_visit", "À domicile")]

    # Patient inscrit, ou patient sans compte saisi par le secrétariat (external_*).
    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="appointments"
    )
    doctor = models.ForeignKey("directory.Doctor", on_delete=models.CASCADE, related_name="appointments")
    scheduled_at = models.DateTimeField(db_index=True)
    duration_minutes = models.PositiveSmallIntegerField(default=30, validators=[MinValueValidator(5), MaxValueValidator(480)])
    ends_at = models.DateTimeField(db_index=True)
    mode = models.CharField(max_length=20, choices=MODES, default="in_person")
    reason = models.TextField(blank=True, max_length=500)
    status = models.CharField(max_length=10, choices=STATUSES, default="pending", db_index=True)
    notes = models.TextField(blank=True)
    teleconsultation_room = models.CharField(max_length=80, blank=True)
    external_patient_name = models.CharField(max_length=120, blank=True)
    external_patient_phone = models.CharField(max_length=30, blank=True)
    booked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    relative = models.ForeignKey("accounts.Relative", null=True, blank=True, on_delete=models.SET_NULL, related_name="appointments")
    consultation_type = models.ForeignKey(
        "directory.ConsultationType", null=True, blank=True, on_delete=models.SET_NULL, related_name="appointments"
    )
    price = models.PositiveIntegerField(null=True, blank=True)
    arrived_at = models.DateTimeField(null=True, blank=True, help_text="Patient arrivé en salle d'attente")
    location = models.ForeignKey("directory.DoctorLocation", null=True, blank=True, on_delete=models.SET_NULL, related_name="appointments")
    video_started_at = models.DateTimeField(null=True, blank=True, help_text="Le médecin a ouvert la téléconsultation")
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.CharField(max_length=10, choices=CANCELLED_BY, blank=True)
    cancel_reason = models.CharField(max_length=300, blank=True)
    # Assurance choisie à la réservation (valeurs figées : un changement de taux ne modifie pas un RDV déjà pris).
    insurer = models.ForeignKey("insurance.Insurer", null=True, blank=True, on_delete=models.SET_NULL, related_name="appointments")
    insurance_member_number = models.CharField(max_length=40, blank=True)
    coverage_percent = models.PositiveSmallIntegerField(null=True, blank=True)
    tiers_payant = models.BooleanField(default=False)
    patient_share = models.PositiveIntegerField(null=True, blank=True, help_text="Tiers payant : montant réglé par le patient")
    CHANNELS = [("web", "Site / application"), ("whatsapp", "WhatsApp"), ("ussd", "USSD"), ("clinic", "Secrétariat")]
    channel = models.CharField(max_length=10, choices=CHANNELS, default="web")
    # Questionnaire avant consultation : questions figées à la réservation, réponses du patient.
    questionnaire = models.JSONField(default=list, blank=True)
    answers = models.JSONField(default=dict, blank=True)
    answered_at = models.DateTimeField(null=True, blank=True)
    # Visite à domicile : adresse et repère donnés par le patient (visibles du seul médecin et de son secrétariat).
    visit_address = models.CharField(max_length=300, blank=True)
    visit_landmark = models.CharField(max_length=200, blank=True, help_text="Repère : « derrière la mosquée », « portail bleu »…")
    visit_latitude = models.FloatField(null=True, blank=True)
    visit_longitude = models.FloatField(null=True, blank=True)
    # Médecin remplaçant qui assure la consultation à la place du titulaire (doctor).
    practitioner = models.ForeignKey(
        "directory.Doctor", null=True, blank=True, on_delete=models.SET_NULL, related_name="replacement_appointments"
    )
    # Série de séances réservées ensemble (rang dans la série, à partir de 1).
    series = models.ForeignKey("AppointmentSeries", null=True, blank=True, on_delete=models.SET_NULL, related_name="appointments")
    series_index = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["scheduled_at"]
        indexes = [models.Index(fields=["doctor", "scheduled_at", "status"])]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(patient__isnull=False) | ~models.Q(external_patient_name=""),
                name="appointment_patient_present",
            ),
        ]

    def save(self, *args, **kwargs):
        self.ends_at = self.scheduled_at + timedelta(minutes=self.duration_minutes)
        if self.mode == "teleconsultation" and not self.teleconsultation_room:
            # Nom de salle aléatoire, sans lien avec l'identifiant du rendez-vous.
            self.teleconsultation_room = f"fajma-{secrets.token_hex(12)}"
        if "update_fields" in kwargs and kwargs["update_fields"] is not None:
            kwargs["update_fields"] = set(kwargs["update_fields"]) | {"ends_at", "teleconsultation_room", "updated_at"}
        super().save(*args, **kwargs)

    @property
    def is_active(self) -> bool:
        return self.status in ACTIVE_STATUSES

    @property
    def amount_due(self) -> int:
        """Montant réglé par le patient : sa part en tiers payant, sinon le prix complet."""
        if self.patient_share is not None:
            return self.patient_share
        return self.price if self.price is not None else self.doctor.consultation_price


class AppointmentSeries(BaseModel):
    """Plusieurs séances réservées d'un coup, à intervalle régulier (ex. 10 séances de kiné, une par semaine)."""

    INTERVALS = [1, 2, 3, 7, 14]

    doctor = models.ForeignKey("directory.Doctor", on_delete=models.CASCADE, related_name="appointment_series")
    patient = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="appointment_series")
    interval_days = models.PositiveSmallIntegerField(default=7)
    requested_count = models.PositiveSmallIntegerField()
    booked_count = models.PositiveSmallIntegerField(default=0)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")


class WaitlistEntry(BaseModel):
    STATUSES = [("active", "Active"), ("notified", "Prévenu"), ("closed", "Close")]

    patient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="waitlist_entries")
    doctor = models.ForeignKey("directory.Doctor", on_delete=models.CASCADE, related_name="waitlist_entries")
    status = models.CharField(max_length=10, choices=STATUSES, default="active")
    notified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [models.UniqueConstraint(fields=["patient", "doctor"], name="unique_waitlist_entry")]
