import uuid

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models

from sunusante.models import BaseModel


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email and not extra.get("phone"):
            raise ValueError("Un email ou un numéro de téléphone est obligatoire")
        user = self.model(email=self.normalize_email(email).lower() if email else None, **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra["is_staff"] = True
        extra["is_superuser"] = True
        return self._create_user(email, password, **extra)


class User(AbstractUser):
    """
    Compte utilisateur, identifié par son email.
    Rôles : patient (par défaut), médecin (fiche Doctor liée), responsable ou secrétaire de clinique,
    administrateur (is_staff, attribué uniquement via `createsuperuser` ou l'admin Django).
    """

    CHANNELS = [("sms", "SMS"), ("whatsapp", "WhatsApp")]
    LANGUAGES = [("fr", "Français"), ("wo", "Wolof"), ("en", "English")]
    SEXES = [("F", "Féminin"), ("M", "Masculin")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = None
    # Facultatif : on peut créer un compte avec son seul numéro de téléphone (code SMS).
    email = models.EmailField("email", unique=True, null=True, blank=True)
    full_name = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    phone_verified = models.BooleanField(default=False)
    city = models.CharField(max_length=80, blank=True)
    # Âge et sexe figurent sur les ordonnances (posologie adaptée).
    birth_date = models.DateField(null=True, blank=True)
    sex = models.CharField(max_length=1, choices=SEXES, blank=True)
    avatar_url = models.URLField(blank=True)
    notification_channel = models.CharField(max_length=10, choices=CHANNELS, default="sms")
    preferred_language = models.CharField(max_length=2, choices=LANGUAGES, default="fr")

    USERNAME_FIELD = "email"
    # Demandé par « createsuperuser » : le nom de l'administrateur apparaît dans le journal des actions.
    REQUIRED_FIELDS: list[str] = ["full_name"]

    objects = UserManager()

    class Meta:
        constraints = [
            # Un numéro vérifié n'appartient qu'à un seul compte.
            models.UniqueConstraint(fields=["phone"], condition=models.Q(phone_verified=True), name="unique_verified_phone"),
        ]

    def __str__(self):
        return self.full_name or self.email or self.phone


class Relative(BaseModel):
    """Proche d'un patient (enfant, conjoint, parent) pour qui il peut prendre rendez-vous."""

    RELATIONSHIPS = [("enfant", "Enfant"), ("conjoint", "Conjoint(e)"), ("parent", "Parent"), ("autre", "Autre")]

    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="relatives")
    full_name = models.CharField(max_length=120)
    relationship = models.CharField(max_length=10, choices=RELATIONSHIPS, default="enfant")
    birth_date = models.DateField(null=True, blank=True)
    sex = models.CharField(max_length=1, choices=User.SEXES, blank=True)
    phone = models.CharField(max_length=30, blank=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return self.full_name


class TwoFactor(BaseModel):
    """Double authentification par application (Google Authenticator, Authy…), codes de secours hachés."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="two_factor")
    secret = models.CharField(max_length=64)
    enabled = models.BooleanField(default=False)
    recovery_codes = models.JSONField(default=list)
    last_used_step = models.BigIntegerField(default=0)


class OtpCode(BaseModel):
    """Code à usage unique envoyé par SMS (connexion, inscription, vérification du numéro)."""

    phone = models.CharField(max_length=20, db_index=True)
    code_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class KnownDevice(BaseModel):
    """Navigateur déjà utilisé pour se connecter (jeton de cookie haché) : une connexion ailleurs déclenche une alerte."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="known_devices")
    token_hash = models.CharField(max_length=64)
    label = models.CharField(max_length=120, blank=True)
    last_seen_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "token_hash"], name="unique_known_device")]
