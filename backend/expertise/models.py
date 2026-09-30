from django.db import models

from sunusante.models import BaseModel


class ExpertiseRequest(BaseModel):
    """
    Demande d'avis d'un médecin (requérant) à un confrère (expert). Peut concerner un patient suivi par le
    requérant : il doit alors l'avoir informé, et seuls les documents que le patient lui a partagés sont joints.
    Sans patient, c'est un échange professionnel simple (question générale, cas anonymisé).
    """

    STATUSES = [("open", "En attente de réponse"), ("answered", "Répondu"), ("closed", "Clôturé")]

    requester = models.ForeignKey("directory.Doctor", on_delete=models.CASCADE, related_name="expertise_sent")
    expert = models.ForeignKey("directory.Doctor", on_delete=models.CASCADE, related_name="expertise_received")
    patient = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    subject = models.CharField(max_length=160)
    status = models.CharField(max_length=10, choices=STATUSES, default="open")
    documents = models.ManyToManyField("medical.MedicalDocument", blank=True, related_name="expertise_requests")
    patient_informed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-updated_at"]


class ExpertiseMessage(BaseModel):
    request = models.ForeignKey(ExpertiseRequest, on_delete=models.CASCADE, related_name="messages")
    author = models.ForeignKey("directory.Doctor", on_delete=models.CASCADE, related_name="+")
    body = models.TextField(max_length=5000)

    class Meta:
        ordering = ["created_at"]
