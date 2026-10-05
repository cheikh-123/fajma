"""
Configuration Django de Fajma.

Toutes les valeurs sensibles viennent des variables d'environnement (fichier backend/.env en local,
voir .env.example). En local : SQLite ; en production au Sénégal : PostgreSQL via DATABASE_URL.
"""

import os
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).lower() in {"1", "true", "yes", "on"}


# Sans variable DJANGO_DEBUG, le mode développement n'est actif que pour les commandes « manage.py » lancées sur
# un poste (runserver, test, migrate…) : un serveur de production (gunicorn, uvicorn) démarre toujours en mode
# sécurisé, même si la variable a été oubliée. docker-compose fixe de toute façon DJANGO_DEBUG=false.
DEBUG = env_bool("DJANGO_DEBUG", Path(sys.argv[0]).name == "manage.py")
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY") or (
    "dev-only-insecure-key-change-me" if DEBUG else None
)
if not SECRET_KEY:
    raise RuntimeError("DJANGO_SECRET_KEY est obligatoire en production")

# Accès démo sans identification (boutons « Entrer en tant que… » sur /auth, comptes créés par seed_demo).
# Uniquement en développement : jamais activable en production, où il ouvrirait les dossiers à tous.
DEMO_LOGIN = DEBUG and env_bool("DEMO_LOGIN", True)
def env_int(name: str, default: int) -> int:
    return int(os.environ.get(name) or default)


# Durées de conservation (jours) des données techniques, purgées chaque nuit par « purge_data ».
# Les données médicales (dossiers, ordonnances, documents) ne sont JAMAIS purgées automatiquement :
# leur durée légale doit être fixée avec un juriste et la CDP avant d'automatiser quoi que ce soit.
RETENTION_DAYS = {
    "otp_codes": env_int("RETENTION_OTP_DAYS", 1),  # codes SMS de connexion
    "bot_sessions": env_int("RETENTION_BOT_DAYS", 30),  # conversations WhatsApp / USSD en cours
    "sms_reminders": env_int("RETENTION_SMS_DAYS", 365),  # SMS envoyés (numéro + texte)
    "notifications": env_int("RETENTION_NOTIFICATIONS_DAYS", 365),  # cloche de l'application
    "external_busy": env_int("RETENTION_EXTERNAL_BUSY_DAYS", 7),  # créneaux importés des agendas personnels
    "walk_in_identity": env_int("RETENTION_WALK_IN_DAYS", 1825),  # nom/tél. des patients sans compte (RDV passés)
    "known_devices": env_int("RETENTION_DEVICES_DAYS", 730),
    "support_requests": env_int("RETENTION_SUPPORT_DAYS", 730),  # demandes d'aide traitées  # navigateurs connus (alerte nouvelle connexion)
    "audit_events": env_int("RETENTION_AUDIT_DAYS", 1825),  # journal des accès (à valider : preuve en cas de litige)
    # Comptes patients sans connexion ni rendez-vous : préavis par email puis anonymisation 30 jours après.
    # 0 = désactivé tant que la durée n'est pas fixée avec un juriste et la CDP (ex. 1095 = 3 ans).
    "inactive_accounts": env_int("RETENTION_INACTIVE_ACCOUNT_DAYS", 0),
}

# Supervision (commande « monitor », toutes les 10 minutes) : alertes par email.
ALERT_EMAILS = [e.strip() for e in os.environ.get("ALERT_EMAILS", "").split(",") if e.strip()]
BACKUP_DIR = os.environ.get("BACKUP_DIR", "/backups")  # vide = pas de contrôle des sauvegardes
BACKUP_MAX_AGE_HOURS = env_int("BACKUP_MAX_AGE_HOURS", 26)
# Jeton de la supervision externe pour obtenir le détail de /api/health (vide = équipe Fajma connectée seulement).
HEALTH_TOKEN = os.environ.get("HEALTH_TOKEN", "")

# Double authentification obligatoire pour médecins, pharmaciens, cliniques et administrateurs.
MFA_REQUIRED_FOR_PROS = env_bool("MFA_REQUIRED_FOR_PROS", True)

ALLOWED_HOSTS = [h.strip() for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h.strip()]
CSRF_TRUSTED_ORIGINS = [
    o.strip()
    for o in os.environ.get("DJANGO_CSRF_TRUSTED_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080").split(",")
    if o.strip()
]
# URL publique du site (liens dans les SMS, QR codes, retours de paiement).
PUBLIC_SITE_URL = os.environ.get("PUBLIC_SITE_URL", "http://localhost:8080").rstrip("/")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "django_tasks_db",
    "accounts",
    "directory",
    "clinics",
    "appointments",
    "payments",
    "medical",
    "messaging",
    "notifications",
    "audit",
    "bots",
    "pharmacy",
    "insurance",
    "carnet",
    "expertise",
    "care",
    "labs",
    "support",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "appointments.history.CurrentRequestMiddleware",
    "accounts.security.IdleTimeoutMiddleware",
    "accounts.security.MfaRequiredMiddleware",
    "accounts.devices.KnownDeviceMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "sunusante.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "sunusante.wsgi.application"

# ── Base de données ──────────────────────────────────────────────────
# "IMMEDIATE" : chaque transaction verrouille la base en écriture dès son début, ce qui rend
# atomique la vérification « créneau libre ? » + la création du rendez-vous.
def database_from_url(url: str) -> dict:
    """DATABASE_URL=postgres://utilisateur:motdepasse@hote:5432/base (production)."""
    u = urlparse(url)
    if u.scheme not in {"postgres", "postgresql"}:
        raise RuntimeError("DATABASE_URL : seul PostgreSQL est pris en charge")
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": u.path.lstrip("/"),
        "USER": unquote(u.username or ""),
        "PASSWORD": unquote(u.password or ""),
        "HOST": u.hostname or "localhost",
        "PORT": str(u.port or 5432),
        "CONN_MAX_AGE": 60,
        "CONN_HEALTH_CHECKS": True,
        "OPTIONS": {"sslmode": os.environ.get("DATABASE_SSLMODE", "prefer")},
    }


if os.environ.get("DATABASE_URL"):
    DATABASES = {"default": database_from_url(os.environ["DATABASE_URL"])}
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": os.environ.get("SQLITE_PATH", BASE_DIR / "db.sqlite3"),
            "OPTIONS": {"transaction_mode": "IMMEDIATE", "timeout": 20},
        }
    }

# ── Tâches en arrière-plan (SMS, emails, notifications) ──────────────
# « database » : file persistante traitée par `python manage.py db_worker` (production).
# « immediate » : exécution directe, sans worker (développement local).
TASK_BACKEND = os.environ.get("TASK_BACKEND", "immediate" if DEBUG else "database")
TASKS = {
    "default": {
        "BACKEND": "django_tasks_db.DatabaseBackend"
        if TASK_BACKEND == "database"
        else "django.tasks.backends.immediate.ImmediateBackend",
    }
}

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "fr-fr"
TIME_ZONE = "Africa/Dakar"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# Fichiers déposés par les patients : jamais servis directement, uniquement via une vue
# qui vérifie les droits (voir medical.views.download_document).
PRIVATE_MEDIA_ROOT = Path(os.environ.get("PRIVATE_MEDIA_ROOT", BASE_DIR / "private_media"))
MAX_UPLOAD_BYTES = 6 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_BYTES + 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_BYTES

# Chiffrement des fichiers sur le disque (clés Fernet séparées par des virgules : la première chiffre,
# les suivantes servent à relire après une rotation). Obligatoire en production ; à conserver HORS des
# sauvegardes. Générer : python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
FILE_ENCRYPTION_KEYS = [k.strip() for k in os.environ.get("FILE_ENCRYPTION_KEYS", "").split(",") if k.strip()]
if not FILE_ENCRYPTION_KEYS:
    if not DEBUG:
        raise RuntimeError("FILE_ENCRYPTION_KEYS est obligatoire en production (chiffrement des documents)")
    import base64 as _b64
    import hashlib as _hashlib

    FILE_ENCRYPTION_KEYS = [_b64.urlsafe_b64encode(_hashlib.sha256(f"files:{SECRET_KEY}".encode()).digest()).decode()]

# Antivirus : adresse du service clamd (« hôte:port »). Vide = pas d'analyse (développement).
CLAMAV_ADDRESS = os.environ.get("CLAMAV_ADDRESS", "")
CLAMAV_TIMEOUT = env_int("CLAMAV_TIMEOUT", 30)

# Comptes professionnels : déconnexion automatique après ce délai sans activité (ordinateurs partagés).
PRO_IDLE_MINUTES = env_int("PRO_IDLE_MINUTES", 30)

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ── Sessions et cookies ──────────────────────────────────────────────
# Session dans un cookie HttpOnly (inaccessible au JavaScript) : pas de jeton dans le navigateur.
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 60 * 60 * 24 * 14
CSRF_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG

# ── En-têtes de sécurité (production) ────────────────────────────────
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
if not DEBUG:
    SECURE_SSL_REDIRECT = env_bool("DJANGO_SSL_REDIRECT", True)
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 365
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True

# ── API ──────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
        "rest_framework.parsers.FormParser",
    ],
    "EXCEPTION_HANDLER": "sunusante.api.exception_handler",
    "DEFAULT_THROTTLE_RATES": {
        "auth": "10/min",
        "assistant": "15/min",
        "public_lookup": "30/min",
        "suggest": "120/min",
        "booking": "20/hour",
        "otp": "10/hour",
        "client_errors": "30/min",
        "support": "5/hour",
        "ai_notes": "60/hour",
    },
}

# ── Emails (réinitialisation de mot de passe) ────────────────────────
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "Fajma <no-reply@fajma.sn>")
EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)

# ── Services externes ────────────────────────────────────────────────
PAYDUNYA = {
    "MASTER_KEY": os.environ.get("PAYDUNYA_MASTER_KEY", ""),
    "PRIVATE_KEY": os.environ.get("PAYDUNYA_PRIVATE_KEY", ""),
    "TOKEN": os.environ.get("PAYDUNYA_TOKEN", ""),
    "MODE": os.environ.get("PAYDUNYA_MODE", "test"),
}
TWILIO = {
    "ACCOUNT_SID": os.environ.get("TWILIO_ACCOUNT_SID", ""),
    "AUTH_TOKEN": os.environ.get("TWILIO_AUTH_TOKEN", ""),
    "SMS_FROM": os.environ.get("TWILIO_SMS_FROM", ""),
    "WHATSAPP_FROM": os.environ.get("TWILIO_WHATSAPP_FROM", ""),
    "STATUS_TOKEN": os.environ.get("TWILIO_STATUS_TOKEN", ""),
}

# Notifications push du navigateur (clés générées par « python manage.py vapid_keys »). Vide = désactivé.
WEBPUSH = {
    "PUBLIC_KEY": os.environ.get("WEBPUSH_VAPID_PUBLIC_KEY", ""),
    "PRIVATE_KEY": os.environ.get("WEBPUSH_VAPID_PRIVATE_KEY", ""),
    "CONTACT": os.environ.get("WEBPUSH_CONTACT", "mailto:contact@fajma.sn"),
}

# Temps réel (flux d'événements) : durée d'une connexion et intervalle de vérification.
EVENTS_STREAM_SECONDS = int(os.environ.get("EVENTS_STREAM_SECONDS", "300"))
EVENTS_POLL_SECONDS = float(os.environ.get("EVENTS_POLL_SECONDS", "2"))

# Menu USSD : secret partagé avec l'agrégateur (en-tête X-Ussd-Secret ou ?secret=). Vide = désactivé.
USSD_SECRET = os.environ.get("USSD_SECRET", "")
AI = {
    "API_KEY": os.environ.get("AI_API_KEY", ""),
    "MODEL": os.environ.get("AI_MODEL", ""),
    "API_URL": os.environ.get(
        "AI_API_URL", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    ),
}

# Assistant de prise de notes des médecins : envoie le texte des notes (sans identité du patient) au
# fournisseur d'IA ci-dessus. À désactiver (false) tant que ce transfert n'est pas autorisé ; une mise en
# forme locale sans IA reste alors disponible.
AI_NOTES_ENABLED = env_bool("AI_NOTES_ENABLED", True)

# ── Supervision (facultatif) ─────────────────────────────────────────
SENTRY_DSN = os.environ.get("SENTRY_DSN", "")
if SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
        traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
        send_default_pii=False,  # jamais de données personnelles ni de santé vers Sentry
    )

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}

# Tests : hachage de mot de passe rapide (le hachage de production est volontairement lent).
import sys  # noqa: E402

if "test" in sys.argv:
    import tempfile  # noqa: E402

    TASKS = {"default": {"BACKEND": "django.tasks.backends.immediate.ImmediateBackend"}}
    PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
    PRIVATE_MEDIA_ROOT = Path(tempfile.gettempdir()) / "fajma-test-media"
