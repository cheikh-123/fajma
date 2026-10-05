"""
Test de volume : remplit la base avec des données FICTIVES à l'échelle d'un pays, pour mesurer les temps de
réponse et vérifier les index avant la mise en ligne.

    python manage.py seed_volume                       # 500 médecins, 20 000 patients, ~200 000 RDV
    python manage.py seed_volume --doctors 50 --patients 2000 --per-doctor 100

Refusé hors du mode développement (DEBUG) : jamais de fausses données en production.
Les comptes créés ont l'adresse « @volume.test » et un mot de passe inutilisable.
"""

import random
from datetime import UTC, datetime, time, timedelta

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from appointments.models import Appointment
from audit.models import AuditEvent
from directory.models import Doctor, DoctorAvailability, Specialty
from medical.models import MedicalRecord, Prescription
from messaging.models import Message
from notifications.models import Notification
from payments.models import Payment

CITIES = ["Dakar", "Pikine", "Guédiawaye", "Rufisque", "Thiès", "Mbour", "Saint-Louis", "Touba", "Kaolack", "Ziguinchor"]
FIRST = ["Awa", "Moussa", "Fatou", "Ibrahima", "Aminata", "Cheikh", "Mariama", "Ousmane", "Khady", "Mamadou", "Ndeye", "Abdoulaye"]
LAST = ["Diop", "Ndiaye", "Fall", "Sow", "Ba", "Faye", "Gueye", "Sarr", "Diallo", "Cissé", "Mbaye", "Seck"]
BATCH = 5000


class Command(BaseCommand):
    help = "Données fictives en grand nombre pour le test de volume (développement uniquement)"

    def add_arguments(self, parser):
        parser.add_argument("--doctors", type=int, default=500)
        parser.add_argument("--patients", type=int, default=20000)
        parser.add_argument("--per-doctor", type=int, default=400, help="rendez-vous par médecin")
        parser.add_argument("--seed", type=int, default=7)

    def handle(self, *args, doctors, patients, per_doctor, seed, **options):
        if not settings.DEBUG:
            raise CommandError("Refusé : seed_volume ne s'utilise qu'en développement (DEBUG), jamais en production.")
        rng = random.Random(seed)
        now = timezone.now()
        unusable = make_password(None)
        name = lambda: f"{rng.choice(FIRST)} {rng.choice(LAST)}"  # noqa: E731
        start = User.objects.filter(email__endswith="@volume.test").count()

        specialties = list(Specialty.objects.all()) or [Specialty.objects.create(slug="medecine-generale", name="Médecine générale")]

        with transaction.atomic():
            self.stdout.write(f"patients : {patients}")
            pats = [
                User(email=f"patient{start + i}@volume.test", full_name=name(), password=unusable, city=rng.choice(CITIES))
                for i in range(patients)
            ]
            User.objects.bulk_create(pats, batch_size=BATCH)
            self.stdout.write(f"médecins : {doctors}")
            doc_users = [
                User(email=f"medecin{start + i}@volume.test", full_name=f"Dr {name()}", password=unusable) for i in range(doctors)
            ]
            User.objects.bulk_create(doc_users, batch_size=BATCH)
            docs = [
                Doctor(
                    user=u,
                    full_name=u.full_name,
                    specialty=rng.choice(specialties),
                    city=rng.choice(CITIES),
                    consultation_price=rng.choice([10000, 15000, 20000, 25000]),
                    is_verified=True,
                    latitude=14.7 + rng.random() * 0.3,
                    longitude=-17.5 + rng.random() * 0.3,
                )
                for u in doc_users
            ]
            Doctor.objects.bulk_create(docs, batch_size=BATCH)
            DoctorAvailability.objects.bulk_create(
                [
                    DoctorAvailability(doctor=d, weekday=w, start_time=time(8), end_time=time(18), slot_minutes=30)
                    for d in docs
                    for w in range(1, 6)
                ],
                batch_size=BATCH,
            )

            # Rendez-vous sans chevauchement : un créneau de 30 min après l'autre, ~300 jours passés, 60 à venir.
            self.stdout.write(f"rendez-vous : {doctors * per_doctor}")
            appts = []
            origin = (now - timedelta(days=300)).astimezone(UTC).replace(hour=8, minute=0, second=0, microsecond=0)
            for d in docs:
                at = origin + timedelta(minutes=30 * rng.randint(0, 20))
                for _ in range(per_doctor):
                    at += timedelta(minutes=30 * rng.randint(1, 30))
                    if at.hour >= 18:
                        at = (at + timedelta(days=1)).replace(hour=8, minute=0)
                    past = at < now
                    status = rng.choice(["completed"] * 6 + ["cancelled", "no_show"]) if past else rng.choice(["confirmed", "pending"])
                    appts.append(
                        Appointment(
                            doctor=d,
                            patient=rng.choice(pats),
                            scheduled_at=at,
                            ends_at=at + timedelta(minutes=30),
                            duration_minutes=30,
                            status=status,
                            price=d.consultation_price,
                            reason="Consultation",
                            channel=rng.choice(["web", "web", "web", "whatsapp", "ussd", "desk"]),
                        )
                    )
            Appointment.objects.bulk_create(appts, batch_size=BATCH)

            done = [a for a in appts if a.status == "completed"]
            self.stdout.write(f"comptes-rendus, ordonnances, paiements : {len(done)}")
            MedicalRecord.objects.bulk_create(
                [MedicalRecord(appointment=a, patient=a.patient, doctor=a.doctor, summary="Examen clinique sans particularité.") for a in done],
                batch_size=BATCH,
            )
            Prescription.objects.bulk_create(
                [
                    Prescription(
                        appointment=a,
                        patient=a.patient,
                        doctor=a.doctor,
                        content="Paracétamol 1 g, 3 fois par jour pendant 5 jours",
                        reference=f"V{a.id.hex[:12].upper()}",
                    )
                    for a in done[::2]
                ],
                batch_size=BATCH,
            )
            Payment.objects.bulk_create(
                [
                    Payment(
                        appointment=a,
                        patient=a.patient,
                        amount=a.price,
                        method=rng.choice(["wave", "orange_money", "cash"]),
                        status="paid",
                        reference=f"VOL-{a.id.hex[:10].upper()}",
                        paid_at=a.scheduled_at,
                    )
                    for a in done[::3]
                ],
                batch_size=BATCH,
            )
            self.stdout.write("messages, notifications, journal d'audit")
            Message.objects.bulk_create(
                [Message(doctor=a.doctor, patient=a.patient, sender=a.patient, body="Bonjour docteur, merci.") for a in done[::4]],
                batch_size=BATCH,
            )
            Notification.objects.bulk_create(
                [Notification(user=a.patient, kind="appointment", title="Rendez-vous confirmé") for a in appts[::2]],
                batch_size=BATCH,
            )
            AuditEvent.objects.bulk_create(
                [
                    AuditEvent(actor=a.doctor.user, patient=a.patient, action="patient_file_viewed", ip="10.0.0.1")
                    for a in done[::2]
                ],
                batch_size=BATCH,
            )
        self.stdout.write(self.style.SUCCESS("Données de volume créées."))
