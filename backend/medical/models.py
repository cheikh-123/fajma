import secrets

from django.conf import settings
from django.db import models

from sunusante.models import BaseModel


class MedicalRecord(BaseModel):
    """Compte-rendu de consultation rédigé par le médecin (un par rendez-vous)."""

    appointment = models.OneToOneField("appointments.Appointment", on_delete=models.PROTECT, related_name="record")
    patient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="medical_records")
    doctor = models.ForeignKey("directory.Doctor", on_delete=models.PROTECT, related_name="medical_records")
    summary = models.TextField(max_length=3000)
    diagnosis = models.TextField(blank=True, max_length=2000)
    treatment = models.TextField(blank=True, max_length=3000)
    private_notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]


def new_prescription_reference() -> str:
    # 10 caractères hexadécimaux aléatoires : non devinable, facile à saisir.
    return f"ORD-{secrets.token_hex(5).upper()}"


class Prescription(BaseModel):
    """
    Ordonnance électronique. Les mentions du médecin (issuer) et du patient (patient_info) sont figées à
    l'émission : un changement d'adresse ou de signature ultérieur ne modifie pas une ordonnance déjà remise.
    """

    appointment = models.ForeignKey("appointments.Appointment", on_delete=models.PROTECT, related_name="prescriptions")
    # Titulaire du compte (accès au dossier) ; relative = l'enfant ou le proche réellement soigné.
    patient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="prescriptions")
    relative = models.ForeignKey("accounts.Relative", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    doctor = models.ForeignKey("directory.Doctor", on_delete=models.PROTECT, related_name="prescriptions")
    # Texte lisible de la prescription (généré depuis items ; saisi librement pour les anciennes ordonnances).
    content = models.TextField(max_length=4000)
    # Médicaments : [{name, dosage, posology, duration, quantity, non_substitutable}]
    items = models.JSONField(default=list, blank=True)
    renewals = models.PositiveSmallIntegerField(default=0)  # nombre de renouvellements autorisés
    instructions = models.TextField(blank=True, max_length=2000)
    valid_until = models.DateField(null=True, blank=True)
    reference = models.CharField(max_length=20, unique=True, default=new_prescription_reference)
    patient_info = models.JSONField(default=dict, blank=True)  # {name, birth_date, sex, weight_kg}
    issuer = models.JSONField(default=dict, blank=True)  # voir medical.issuer.issuer_snapshot
    renewal_reminded_at = models.DateTimeField(null=True, blank=True)  # rappel « demandez le renouvellement »

    class Meta:
        ordering = ["-created_at"]


class MedicalDocument(BaseModel):
    """Fichier déposé par le patient. Stocké hors du dossier public, servi après contrôle des droits."""

    CATEGORIES = [("analyse", "Analyse"), ("imagerie", "Imagerie"), ("ordonnance", "Ordonnance"), ("autre", "Autre")]

    patient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="documents")
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    appointment = models.ForeignKey("appointments.Appointment", null=True, blank=True, on_delete=models.SET_NULL)
    title = models.CharField(max_length=160)
    category = models.CharField(max_length=12, choices=CATEGORIES, default="autre")
    file_path = models.CharField(max_length=300)
    mime_type = models.CharField(max_length=120, blank=True)
    size_bytes = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]


class HealthProfile(BaseModel):
    """Profil de santé du patient, visible par les médecins avec qui il a un RDV confirmé ou terminé."""

    BLOOD_GROUPS = [(g, g) for g in ("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-")]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="health_profile")
    blood_group = models.CharField(max_length=3, choices=BLOOD_GROUPS, blank=True)
    allergies = models.TextField(blank=True, max_length=2000)
    conditions = models.TextField(blank=True, max_length=2000, help_text="Antécédents, maladies chroniques")
    treatments = models.TextField(blank=True, max_length=2000, help_text="Traitements en cours")
    vaccinations = models.TextField(blank=True, max_length=2000)
    emergency_contact = models.CharField(max_length=160, blank=True)
    # Fiche d'urgence publique (QR code) : activée par le patient, qui choisit les informations visibles.
    EMERGENCY_FIELDS = ["blood_group", "allergies", "treatments", "conditions", "emergency_contact"]
    emergency_enabled = models.BooleanField(default=False)
    emergency_token = models.CharField(max_length=64, null=True, blank=True, unique=True)
    emergency_fields = models.JSONField(default=list, blank=True)
    # Mesure à domicile dangereuse : les médecins qui suivent le patient sont prévenus (désactivable).
    alert_doctors = models.BooleanField(default=True)


class PatientNote(BaseModel):
    """Note privée d'un médecin sur un patient (jamais visible par le patient)."""

    doctor = models.ForeignKey("directory.Doctor", on_delete=models.PROTECT, related_name="patient_notes")
    patient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    content = models.TextField(max_length=4000)

    class Meta:
        ordering = ["-created_at"]


class DocumentShare(BaseModel):
    """Document que le patient a choisi de partager avec un médecin précis."""

    document = models.ForeignKey(MedicalDocument, on_delete=models.CASCADE, related_name="shares")
    doctor = models.ForeignKey("directory.Doctor", on_delete=models.CASCADE, related_name="shared_documents")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["document", "doctor"], name="unique_document_share")]


class PatientRecall(BaseModel):
    """Rappel programmé par un médecin (vaccin, contrôle annuel, suivi) : le patient est prévenu à la date prévue."""

    doctor = models.ForeignKey("directory.Doctor", on_delete=models.CASCADE, related_name="recalls")
    patient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="recalls")
    due_date = models.DateField()
    message = models.CharField(max_length=300)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["due_date"]


def new_document_reference() -> str:
    return f"DOC-{secrets.token_hex(5).upper()}"


class IssuedDocument(BaseModel):
    """Certificat, arrêt de travail ou courrier rédigé par le médecin à l'issue d'un rendez-vous."""

    KINDS = [
        ("certificat", "Certificat médical"),
        ("arret_travail", "Avis d'arrêt de travail"),
        ("aptitude", "Certificat d'aptitude au sport"),
        ("courrier", "Courrier à un confrère"),
    ]

    appointment = models.ForeignKey("appointments.Appointment", on_delete=models.PROTECT, related_name="issued_documents")
    patient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="issued_documents")
    relative = models.ForeignKey("accounts.Relative", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    doctor = models.ForeignKey("directory.Doctor", on_delete=models.PROTECT, related_name="issued_documents")
    kind = models.CharField(max_length=15, choices=KINDS)
    body = models.TextField(max_length=4000, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    recipient = models.CharField(max_length=120, blank=True)
    reference = models.CharField(max_length=20, unique=True, default=new_document_reference)
    issuer = models.JSONField(default=dict, blank=True)  # en-tête du médecin figé à l'émission

    class Meta:
        ordering = ["-created_at"]

    @property
    def subject_name(self) -> str:
        return self.relative.full_name if self.relative else self.patient.full_name


class PrescriptionRenewal(BaseModel):
    """Demande de renouvellement d'une ordonnance par le patient, acceptée ou refusée par le médecin."""

    STATUSES = [("pending", "En attente"), ("accepted", "Renouvelée"), ("refused", "Refusée"), ("cancelled", "Annulée")]

    prescription = models.ForeignKey(Prescription, on_delete=models.CASCADE, related_name="renewal_requests")
    patient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="renewal_requests")
    doctor = models.ForeignKey("directory.Doctor", on_delete=models.CASCADE, related_name="renewal_requests")
    status = models.CharField(max_length=10, choices=STATUSES, default="pending")
    patient_note = models.CharField(max_length=500, blank=True)
    doctor_reply = models.CharField(max_length=500, blank=True)
    new_prescription = models.ForeignKey(Prescription, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["prescription"], condition=models.Q(status="pending"), name="one_pending_renewal"),
        ]
