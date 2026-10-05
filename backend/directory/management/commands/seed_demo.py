"""
Remplit la base locale avec des données de démonstration (idempotent) :

    python manage.py seed_demo              # spécialités, médecins, disponibilités, pharmacies
    python manage.py seed_demo --accounts   # + comptes de test (admin, médecin, patient)
    python manage.py seed_demo --activity   # + 12 semaines d'activité simulée (tableau de bord, démonstrations)
    python manage.py seed_demo --scenario   # comptes + dossier complet pour tester chaque interface
"""

from datetime import time

from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import User
from directory.specialties import CATALOG
from directory.models import ConsultationType, Doctor, DoctorAvailability, Pharmacy, Specialty

# Catalogue complet des spécialités : directory/specialties.py (aussi installé par migration).
SPECIALTIES = CATALOG

DOCTORS = [
    ("Dr Aïssatou Diop", "medecine-generale", "Dakar", "Point E, Rue 5", "Médecin généraliste avec 12 ans d'expérience à Dakar.", 12, 15000, True, ["Français", "Wolof"]),
    ("Dr Mamadou Ndiaye", "cardiologie", "Dakar", "Clinique du Cap, Almadies", "Cardiologue interventionnel, formé au CHU de Fann.", 18, 30000, True, ["Français", "Wolof"]),
    ("Dr Fatou Sarr", "pediatrie", "Thiès", "Route de Dakar, Thiès", "Pédiatre attentionnée, spécialiste du nourrisson.", 9, 20000, True, ["Français", "Wolof", "Serere"]),
    ("Dr Ibrahima Sow", "gynecologie", "Dakar", "Mermoz Pyrotechnie", "Gynécologue-obstétricien, suivi de grossesse.", 15, 25000, False, ["Français", "Wolof"]),
    ("Dr Awa Ba", "dermatologie", "Saint-Louis", "Sor, Saint-Louis", "Dermatologue esthétique et médicale.", 8, 22000, True, ["Français", "Wolof", "Pulaar"]),
    ("Dr Cheikh Fall", "ophtalmologie", "Dakar", "Hôpital Principal", "Ophtalmologue, chirurgie de la cataracte.", 20, 28000, False, ["Français", "Wolof"]),
    ("Dr Marième Diallo", "neurologie", "Dakar", "Ouakam, Dakar", "Neurologue, spécialiste des céphalées.", 11, 32000, True, ["Français", "Anglais"]),
    ("Dr Ousmane Camara", "orthopedie", "Ziguinchor", "Centre-ville, Ziguinchor", "Orthopédiste, traumatologie du sport.", 14, 26000, True, ["Français", "Wolof", "Diola"]),
]

# Coordonnées approximatives des cabinets de démonstration (carte des médecins).
COORDS = {
    "Dr Aïssatou Diop": (14.6937, -17.4580),
    "Dr Mamadou Ndiaye": (14.7458, -17.5147),
    "Dr Fatou Sarr": (14.7910, -16.9359),
    "Dr Ibrahima Sow": (14.7071, -17.4717),
    "Dr Awa Ba": (16.0179, -16.4896),
    "Dr Cheikh Fall": (14.6664, -17.4337),
    "Dr Marième Diallo": (14.7224, -17.4916),
    "Dr Ousmane Camara": (12.5681, -16.2719),
}

PHARMACIES = [
    ("Pharmacie du Plateau", "Dakar", "Plateau", "12 Avenue Léopold Sédar Senghor", "+221 33 821 12 34", True, "08:00", "22:00", 14.6690, -17.4370),
    ("Pharmacie Guigon", "Dakar", "Plateau", "Rue Carnot x Rue Jules Ferry", "+221 33 823 45 67", False, "08:30", "20:00", 14.6725, -17.4340),
    ("Pharmacie des Almadies", "Dakar", "Almadies", "Route des Almadies, près Ngor", "+221 33 820 88 90", True, "00:00", "23:59", 14.7440, -17.5150),
    ("Pharmacie Mermoz", "Dakar", "Mermoz", "Avenue Cheikh Anta Diop", "+221 33 825 30 11", False, "08:00", "21:00", 14.7040, -17.4740),
    ("Pharmacie Point E", "Dakar", "Point E", "Rue de Diourbel x Boulevard de l'Est", "+221 33 824 76 22", False, "08:00", "20:30", 14.6910, -17.4620),
    ("Pharmacie Liberté 6", "Dakar", "Liberté 6", "Cité Liberté 6 Extension", "+221 33 827 14 05", True, "08:00", "23:00", 14.7220, -17.4560),
    ("Pharmacie Parcelles U15", "Dakar", "Parcelles Assainies", "Unité 15, Parcelles Assainies", "+221 33 855 62 41", False, "08:00", "21:00", 14.7690, -17.4310),
    ("Pharmacie Sahm", "Thiès", "Centre", "Avenue Général de Gaulle", "+221 33 951 22 18", True, "08:00", "22:00", 14.7900, -16.9260),
    ("Pharmacie Thiès Nord", "Thiès", "Thiès Nord", "Route de Saint-Louis", "+221 33 951 77 04", False, "08:30", "20:00", 14.8060, -16.9310),
    ("Pharmacie Ndar", "Saint-Louis", "Île", "Rue Blaise Diagne", "+221 33 961 18 76", True, "08:00", "22:00", 16.0270, -16.5020),
    ("Pharmacie Sor", "Saint-Louis", "Sor", "Avenue Jean Mermoz", "+221 33 961 44 92", False, "08:00", "20:00", 16.0110, -16.4880),
    ("Pharmacie Kassa", "Ziguinchor", "Centre", "Rue du Commerce", "+221 33 991 33 27", True, "08:00", "21:30", 12.5680, -16.2730),
]

DEMO_PASSWORD = "Fajma-Demo-2026"


def _t(value: str) -> time:
    h, m = value.split(":")
    return time(int(h), int(m))


class Command(BaseCommand):
    help = "Données de démonstration pour le développement local"

    def add_arguments(self, parser):
        parser.add_argument("--accounts", action="store_true", help="Crée aussi des comptes de test")
        parser.add_argument("--activity", action="store_true", help="Simule 12 semaines de rendez-vous et de paiements passés")
        parser.add_argument(
            "--scenario", action="store_true", help="Comptes + données réalistes pour tester chaque interface (RDV, dossier, pharmacie…)"
        )

    @transaction.atomic
    def handle(self, *args, **options):
        specs = {}
        for slug, name, icon, desc in SPECIALTIES:
            specs[slug], _ = Specialty.objects.update_or_create(slug=slug, defaults={"name": name, "icon": icon, "description": desc})

        for n, (name, slug, city, address, bio, years, price, tele, langs) in enumerate(DOCTORS, 1):
            lat, lng = COORDS.get(name, (None, None))
            doctor, created = Doctor.objects.get_or_create(
                full_name=name,
                defaults=dict(
                    specialty=specs[slug], city=city, address=address, bio=bio, years_experience=years,
                    consultation_price=price, teleconsultation=tele, languages=langs, is_verified=True,
                ),
            )
            if doctor.latitude is None and lat is not None:
                doctor.latitude, doctor.longitude = lat, lng
                doctor.save(update_fields=["latitude", "longitude"])
            if not doctor.order_number:
                # Numéro fictif : en production, le médecin saisit le sien (vérifié avec son justificatif).
                doctor.order_number = f"DEMO-{n:04d}"
                doctor.practice_name = f"Cabinet médical {name.removeprefix('Dr ')}"
                doctor.save(update_fields=["order_number", "practice_name"])
            if created:
                # Lundi → vendredi (1 à 5) : 9 h – 12 h 30 et 14 h 30 – 17 h, créneaux de 30 min.
                for weekday in range(1, 6):
                    DoctorAvailability.objects.create(doctor=doctor, weekday=weekday, start_time=time(9), end_time=time(12, 30))
                    DoctorAvailability.objects.create(doctor=doctor, weekday=weekday, start_time=time(14, 30), end_time=time(17))
                ConsultationType.objects.create(doctor=doctor, name="Première consultation", duration_minutes=30, price=price, position=0)
                ConsultationType.objects.create(doctor=doctor, name="Consultation de suivi", duration_minutes=30, price=int(price * 0.8), position=1)

        for name, city, district, address, phone, duty, opens, closes, lat, lng in PHARMACIES:
            Pharmacy.objects.update_or_create(
                name=name,
                defaults=dict(city=city, district=district, address=address, phone=phone, is_on_duty=duty,
                              opens_at=_t(opens), closes_at=_t(closes), latitude=lat, longitude=lng),
            )
        self.stdout.write(self.style.SUCCESS(f"{len(SPECIALTIES)} spécialités, {len(DOCTORS)} médecins, {len(PHARMACIES)} pharmacies"))

        from insurance.models import Insurer
        from insurance.reference import ensure_insurers

        ensure_insurers(Insurer)

        if options["accounts"]:
            self.create_accounts()
        if options["activity"]:
            self.create_activity()
        if options["scenario"]:
            self.create_accounts()
            self.create_scenario()

    def create_accounts(self):
        admin, _ = User.objects.get_or_create(email="admin@fajma.local", defaults={"full_name": "Administrateur", "is_staff": True, "is_superuser": True})
        patient, _ = User.objects.get_or_create(email="patient@fajma.local", defaults={"full_name": "Awa Ndiaye", "phone": "771234567", "city": "Dakar", "sex": "F"})
        doc_user, _ = User.objects.get_or_create(email="medecin@fajma.local", defaults={"full_name": "Dr Aïssatou Diop"})
        pharmacist, _ = User.objects.get_or_create(email="pharmacie@fajma.local", defaults={"full_name": "Moussa Faye (pharmacien)"})
        cardio_user, _ = User.objects.get_or_create(email="cardiologue@fajma.local", defaults={"full_name": "Dr Mamadou Ndiaye"})
        clinic_owner, _ = User.objects.get_or_create(email="clinique@fajma.local", defaults={"full_name": "Fatou Sy (directrice)"})
        secretary, _ = User.objects.get_or_create(email="secretariat@fajma.local", defaults={"full_name": "Aminata Ba (secrétaire)"})
        lab_user, _ = User.objects.get_or_create(email="laboratoire@fajma.local", defaults={"full_name": "Khady Sarr (biologiste)"})
        from labs.models import Laboratory, LaboratoryMember

        lab, _ = Laboratory.objects.get_or_create(
            name="Laboratoire d'analyses Point E",
            defaults={"city": "Dakar", "district": "Point E", "address": "Rue 7, Point E", "phone": "338251010",
                      "opening_hours": "Lun.–sam. 7 h 30 – 18 h ; prélèvements à jeun jusqu'à 11 h",
                      "latitude": 14.6937, "longitude": -17.4613},
        )
        LaboratoryMember.objects.get_or_create(laboratory=lab, user=lab_user)
        for u in (admin, patient, doc_user, pharmacist, cardio_user, clinic_owner, secretary, lab_user):
            u.set_password(DEMO_PASSWORD)
            u.save()
        Doctor.objects.filter(full_name="Dr Aïssatou Diop", user__isnull=True).update(user=doc_user)
        Doctor.objects.filter(full_name="Dr Mamadou Ndiaye", user__isnull=True).update(user=cardio_user)
        from clinics.models import Clinic, ClinicMember, ClinicStaff
        from pharmacy.models import PharmacyMember

        officine = Pharmacy.objects.filter(city="Dakar").order_by("name").first()
        if officine:
            PharmacyMember.objects.get_or_create(pharmacy=officine, user=pharmacist)
        # Clinique de démonstration : une directrice, une secrétaire, deux médecins.
        clinic, _ = Clinic.objects.get_or_create(
            owner=clinic_owner,
            defaults={"name": "Clinique Fajma Point E", "city": "Dakar", "address": "Point E, Rue 5", "phone": "338250000", "is_verified": True},
        )
        for doctor in Doctor.objects.filter(user__in=[doc_user, cardio_user]):
            ClinicMember.objects.get_or_create(clinic=clinic, doctor=doctor, defaults={"title": "Médecin"})
        ClinicStaff.objects.get_or_create(clinic=clinic, user=secretary, defaults={"role": "secretary"})
        # Visites à domicile le samedi matin et un motif réservable en série, pour la démonstration.
        diop = Doctor.objects.filter(user=doc_user).first()
        if diop and not diop.home_visits:
            diop.home_visits, diop.home_visit_fee = True, 5000
            diop.home_visit_area = "Dakar Plateau, Médina, Fann, Point E, Mermoz"
            diop.save(update_fields=["home_visits", "home_visit_fee", "home_visit_area"])
            DoctorAvailability.objects.create(
                doctor=diop, weekday=6, start_time=time(9), end_time=time(13), slot_minutes=60, kind="home_visit"
            )
        if diop:
            ConsultationType.objects.get_or_create(
                doctor=diop,
                name="Soins de pansement",
                defaults={"duration_minutes": 30, "price": 8000, "mode": "in_person", "series_max": 10, "position": 2},
            )
        self.stdout.write(self.style.WARNING(
            "Comptes de test (mot de passe : %s) :\n"
            "  patient@fajma.local       patient (Awa Ndiaye)\n"
            "  medecin@fajma.local       médecin généraliste (Dr Aïssatou Diop)\n"
            "  cardiologue@fajma.local   médecin cardiologue (Dr Mamadou Ndiaye)\n"
            "  clinique@fajma.local      responsable de clinique\n"
            "  secretariat@fajma.local   secrétaire de clinique\n"
            "  pharmacie@fajma.local     pharmacien\n"
            "  laboratoire@fajma.local   laboratoire d'analyses\n"
            "  admin@fajma.local         administration" % DEMO_PASSWORD
        ))

    def create_activity(self):
        """Rendez-vous passés fictifs (patients de démonstration) : jamais à lancer sur une base réelle."""
        import random
        import secrets
        from datetime import timedelta

        from django.utils import timezone

        from appointments.models import Appointment
        from payments.ledger import record_earning
        from payments.models import LedgerEntry, Payment

        rng = random.Random(2026)  # toujours les mêmes données
        patients = []
        for i in range(40):
            u, _ = User.objects.get_or_create(email=f"patient{i}@demo.fajma.local", defaults={"full_name": f"Patient démo {i + 1}"})
            patients.append(u)
            User.objects.filter(id=u.id).update(date_joined=timezone.now() - timedelta(days=rng.randint(1, 84)))
        doctors = list(Doctor.objects.filter(is_verified=True))
        now = timezone.now()
        created = 0
        for day in range(84, 0, -1):
            for _ in range(rng.randint(2, 3 + (84 - day) // 12)):  # activité en croissance
                doctor = rng.choice(doctors)
                when = (now - timedelta(days=day)).replace(hour=rng.choice([9, 10, 11, 15, 16]), minute=rng.choice([0, 30]), second=0, microsecond=0)
                if Appointment.objects.filter(doctor=doctor, scheduled_at=when).exists():
                    continue
                status = rng.choices(["completed", "no_show", "cancelled"], weights=[80, 8, 12])[0]
                appt = Appointment.objects.create(
                    doctor=doctor,
                    patient=rng.choice(patients),
                    scheduled_at=when,
                    duration_minutes=30,
                    mode=rng.choices(["in_person", "teleconsultation"], weights=[85, 15])[0] if doctor.teleconsultation else "in_person",
                    status=status,
                    price=doctor.consultation_price,
                    channel=rng.choices(["web", "whatsapp", "ussd", "clinic"], weights=[60, 20, 8, 12])[0],
                )
                Appointment.objects.filter(id=appt.id).update(created_at=when - timedelta(days=rng.randint(1, 10)))
                if status == "completed" and rng.random() < 0.4:
                    payment = Payment.objects.create(
                        appointment=appt, patient=appt.patient, amount=appt.price, method=rng.choice(["wave", "orange_money"]),
                        status="paid", provider="paydunya", reference=f"DEMO-{secrets.token_hex(4).upper()}", paid_at=when,
                    )
                    record_earning(payment)
                    # Démonstration uniquement : l'écriture comptable est datée du jour du paiement simulé.
                    LedgerEntry.objects.filter(payment=payment).update(created_at=when)
                created += 1
        self.stdout.write(self.style.WARNING(f"Activité simulée : {created} rendez-vous passés"))

    def create_scenario(self):
        """
        Données réalistes autour des comptes de démonstration, pour que chaque interface ait du contenu :
        RDV passé (compte-rendu, ordonnance, avis, paiement), RDV à venir, enfant et carnet, assurance,
        messages, document partagé, ordonnance transmise à la pharmacie, demande de télé-expertise.
        Idempotent : sans effet si le scénario existe déjà.
        """
        from datetime import timedelta

        from django.utils import timezone

        from accounts.models import Relative
        from appointments.models import Appointment
        from carnet.models import VaccineDose
        from expertise.models import ExpertiseMessage, ExpertiseRequest
        from insurance.models import DoctorInsurer, Insurer, PatientCoverage
        from medical.issuer import issuer_snapshot
        from medical.models import DocumentShare, MedicalDocument, MedicalRecord, Prescription
        from medical.prescriptions import items_text
        from messaging.models import Message
        from payments.ledger import record_earning
        from payments.models import Payment
        from pharmacy.models import PrescriptionOrder
        from sunusante.uploads import store

        from directory.models import DoctorCredential, Review

        patient = User.objects.get(email="patient@fajma.local")
        if Relative.objects.filter(owner=patient, full_name="Ibou Ndiaye").exists():
            self.stdout.write("Scénario déjà présent.")
            return
        doctor = Doctor.objects.get(user__email="medecin@fajma.local")
        cardio = Doctor.objects.get(user__email="cardiologue@fajma.local")
        now = timezone.now().replace(minute=0, second=0, microsecond=0)
        pdf = b"%PDF-1.4\n% Document de demonstration Fajma\n"

        # Patiente : téléphone vérifié (connexion par SMS, WhatsApp, USSD), enfant, assurance.
        patient.phone, patient.phone_verified, patient.city = "+221771234567", True, "Dakar"
        patient.save(update_fields=["phone", "phone_verified", "city"])
        child = Relative.objects.create(owner=patient, full_name="Ibou Ndiaye", relationship="enfant", birth_date=timezone.localdate() - timedelta(days=50))
        VaccineDose.objects.create(owner=patient, relative=child, vaccine_code="bcg", given_on=child.birth_date)
        ipm = Insurer.objects.get(slug="ipm")
        PatientCoverage.objects.create(user=patient, insurer=ipm, member_number="IPM-SON-4521", coverage_percent=80)
        DoctorInsurer.objects.get_or_create(doctor=doctor, insurer=ipm, defaults={"tiers_payant": True})

        # Médecins : justificatif validé, questionnaire.
        for d in (doctor, cardio):
            DoctorCredential.objects.create(
                doctor=d, kind="ordre", title="Inscription à l'Ordre (démonstration)", file_path=store(f"credentials/{d.id}", "ordre.pdf", pdf),
                mime_type="application/pdf", size_bytes=len(pdf), status="accepted", reviewed_at=now,
            )
        doctor.questionnaire = [
            {"id": "q1", "label": "Avez-vous de la fièvre ?", "type": "yesno", "required": True},
            {"id": "q2", "label": "Traitements en cours", "type": "text", "required": False},
        ]
        doctor.save(update_fields=["questionnaire"])

        # RDV passé : compte-rendu, ordonnance, paiement en ligne, avis.
        past = Appointment.objects.create(
            doctor=doctor, patient=patient, scheduled_at=now - timedelta(days=5), duration_minutes=30, mode="in_person",
            status="completed", price=doctor.consultation_price, reason="Mal de gorge et fièvre depuis 2 jours",
        )
        MedicalRecord.objects.create(appointment=past, patient=patient, doctor=doctor, summary="Angine virale.", treatment="Repos, hydratation.")
        items = [
            {"name": "Paracétamol", "dosage": "1 g", "posology": "1 comprimé 3 fois par jour", "duration": "5 jours",
             "quantity": "1 boîte", "non_substitutable": False},
        ]
        prescription = Prescription.objects.create(
            appointment=past, patient=patient, doctor=doctor, items=items, content=items_text(items),
            valid_until=timezone.localdate() + timedelta(days=90),
            patient_info={"name": patient.full_name, "birth_date": None, "sex": "F", "weight_kg": None},
            issuer=issuer_snapshot(doctor, past),
        )
        payment = Payment.objects.create(
            appointment=past, patient=patient, amount=past.price, method="wave", status="paid", provider="paydunya",
            reference="DEMO-SCEN1", paid_at=past.scheduled_at,
        )
        record_earning(payment)
        Review.objects.create(appointment=past, patient=patient, doctor=doctor, rating=5, comment="Très à l'écoute, explications claires.")

        # RDV à venir : un confirmé (tiers payant IPM, questionnaire à remplir), un à confirmer pour l'enfant.
        Appointment.objects.create(
            doctor=doctor, patient=patient, scheduled_at=now + timedelta(days=2), duration_minutes=30, mode="in_person",
            status="confirmed", price=doctor.consultation_price, reason="Contrôle après traitement", insurer=ipm,
            insurance_member_number="IPM-SON-4521", coverage_percent=80, tiers_payant=True,
            patient_share=doctor.consultation_price - doctor.consultation_price * 80 // 100, questionnaire=doctor.questionnaire,
        )
        Appointment.objects.create(
            doctor=doctor, patient=patient, relative=child, scheduled_at=now + timedelta(days=3), duration_minutes=30,
            mode="in_person", status="pending", price=doctor.consultation_price, reason="Vaccins des 6 semaines",
        )

        # Dossier : document partagé, messages, ordonnance envoyée en pharmacie, télé-expertise.
        document = MedicalDocument.objects.create(
            patient=patient, uploaded_by=patient, title="Analyse de sang", category="analyse",
            file_path=store(str(patient.id), "analyse.pdf", pdf), mime_type="application/pdf", size_bytes=len(pdf),
        )
        DocumentShare.objects.create(document=document, doctor=doctor)
        Message.objects.create(doctor=doctor, patient=patient, sender=patient, body="Bonjour docteur, la fièvre est tombée, merci.")
        Message.objects.create(doctor=doctor, patient=patient, sender=doctor.user, body="Très bien. Terminez le traitement et revenez si besoin.")
        officine = Pharmacy.objects.filter(members__user__email="pharmacie@fajma.local").first()
        if officine:
            PrescriptionOrder.objects.create(prescription=prescription, patient=patient, pharmacy=officine, patient_note="Générique accepté")
        request = ExpertiseRequest.objects.create(
            requester=doctor, expert=cardio, patient=patient, subject="Souffle à l'auscultation", patient_informed_at=now
        )
        request.documents.set([document])
        ExpertiseMessage.objects.create(request=request, author=doctor, body="Patiente de 34 ans, souffle systolique. Votre avis sur l'analyse jointe ?")
        self.stdout.write(self.style.SUCCESS("Scénario de démonstration créé."))
