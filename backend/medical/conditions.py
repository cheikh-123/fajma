"""
Diagnostic principal codé, choisi par le médecin dans son compte-rendu (en plus du texte libre). Liste inspirée
de la Surveillance intégrée de la maladie et la riposte (SIMR / IDSR, OMS-Afrique) appliquée au Sénégal, avec
les maladies chroniques suivies par le ministère. Les codes CIM-10 permettent l'échange avec le système
national (DHIS2).

- notify « immediate » : maladie à déclaration immédiate (dès la suspicion, au district sanitaire / COUS) ;
- notify « weekly » : déclaration hebdomadaire (rapport SIMR) ;
- notify « » : suivi statistique seulement.
- test : examen rapide ou de confirmation proposé (TDR, goutte épaisse, PCR…).

Liste à faire valider par la Direction de la Prévention / Division de la surveillance épidémiologique : c'est
le seul endroit à modifier.
"""

from __future__ import annotations

from typing import NamedTuple


class Condition(NamedTuple):
    code: str
    label: str
    group: str
    icd10: str
    notify: str = ""  # immediate | weekly | ""
    test: str = ""


CONDITIONS: list[Condition] = [
    # Maladies à potentiel épidémique (déclaration immédiate)
    Condition("cholera", "Choléra", "À déclaration immédiate", "A00", "immediate", "Test rapide choléra / coproculture"),
    Condition("rougeole", "Rougeole", "À déclaration immédiate", "B05", "immediate", "Sérologie IgM"),
    Condition("meningite", "Méningite", "À déclaration immédiate", "A39", "immediate", "Ponction lombaire / test rapide"),
    Condition("fievre_jaune", "Fièvre jaune", "À déclaration immédiate", "A95", "immediate", "Sérologie IgM"),
    Condition("dengue", "Dengue", "À déclaration immédiate", "A90", "immediate", "Test rapide NS1 / IgM"),
    Condition("chikungunya", "Chikungunya", "À déclaration immédiate", "A92.0", "immediate", "PCR / sérologie"),
    Condition("fievre_hemorragique", "Fièvre hémorragique (Ebola, Marburg, Crimée-Congo, vallée du Rift)", "À déclaration immédiate", "A98", "immediate", "PCR (laboratoire de référence)"),
    Condition("polio_pfa", "Paralysie flasque aiguë (polio)", "À déclaration immédiate", "A80", "immediate", "Selles (laboratoire de référence)"),
    Condition("tetanos_neonatal", "Tétanos néonatal", "À déclaration immédiate", "A33", "immediate"),
    Condition("diphterie", "Diphtérie", "À déclaration immédiate", "A36", "immediate", "Prélèvement de gorge"),
    Condition("mpox", "Mpox (variole du singe)", "À déclaration immédiate", "B04", "immediate", "PCR"),
    Condition("grippe_aviaire", "Grippe humaine d'un nouveau sous-type", "À déclaration immédiate", "J09", "immediate", "PCR"),
    Condition("rage", "Rage / morsure d'animal suspect", "À déclaration immédiate", "A82", "immediate"),
    Condition("charbon", "Charbon (anthrax)", "À déclaration immédiate", "A22", "immediate"),
    # Surveillance hebdomadaire
    Condition("paludisme", "Paludisme", "Surveillance hebdomadaire", "B54", "weekly", "TDR / goutte épaisse"),
    Condition("diarrhee_sanglante", "Diarrhée sanglante (dysenterie)", "Surveillance hebdomadaire", "A09", "weekly", "Coproculture"),
    Condition("diarrhee", "Diarrhée aiguë / gastro-entérite", "Surveillance hebdomadaire", "A09.9", "weekly"),
    Condition("typhoide", "Fièvre typhoïde", "Surveillance hebdomadaire", "A01.0", "weekly", "Hémoculture / Widal"),
    Condition("ira_pneumonie", "Pneumonie / infection respiratoire aiguë grave", "Surveillance hebdomadaire", "J18", "weekly"),
    Condition("grippe", "Syndrome grippal", "Surveillance hebdomadaire", "J11", "weekly", "Test rapide grippe"),
    Condition("covid", "COVID-19", "Surveillance hebdomadaire", "U07.1", "weekly", "Test antigénique / PCR"),
    Condition("coqueluche", "Coqueluche", "Surveillance hebdomadaire", "A37", "weekly", "PCR"),
    Condition("varicelle", "Varicelle", "Surveillance hebdomadaire", "B01", "weekly"),
    Condition("tuberculose", "Tuberculose", "Surveillance hebdomadaire", "A15", "weekly", "GeneXpert / crachats"),
    Condition("hepatite_a_e", "Hépatite virale aiguë (A ou E, ictère)", "Surveillance hebdomadaire", "B15", "weekly", "Sérologie"),
    Condition("hepatite_b", "Hépatite B", "Surveillance hebdomadaire", "B16", "weekly", "Test rapide AgHBs"),
    Condition("hepatite_c", "Hépatite C", "Surveillance hebdomadaire", "B17.1", "weekly", "Test rapide anti-VHC"),
    Condition("vih", "Infection à VIH", "Surveillance hebdomadaire", "B24", "weekly", "Test rapide VIH"),
    Condition("ist", "Infection sexuellement transmissible", "Surveillance hebdomadaire", "A64", "weekly"),
    Condition("bilharziose", "Bilharziose (schistosomiase)", "Surveillance hebdomadaire", "B65", "weekly", "Urines / selles"),
    Condition("lepre", "Lèpre", "Surveillance hebdomadaire", "A30", "weekly"),
    Condition("conjonctivite", "Conjonctivite", "Surveillance hebdomadaire", "H10", "weekly"),
    Condition("malnutrition", "Malnutrition aiguë (enfant)", "Surveillance hebdomadaire", "E43", "weekly", "Périmètre brachial (MUAC)"),
    Condition("morsure_serpent", "Morsure de serpent", "Surveillance hebdomadaire", "T63.0", "weekly"),
    # Maladies chroniques (suivi des programmes nationaux)
    Condition("hypertension", "Hypertension artérielle", "Maladies chroniques", "I10"),
    Condition("diabete", "Diabète", "Maladies chroniques", "E14"),
    Condition("drepanocytose", "Drépanocytose", "Maladies chroniques", "D57"),
    Condition("asthme", "Asthme", "Maladies chroniques", "J45"),
    Condition("insuffisance_renale", "Maladie rénale chronique", "Maladies chroniques", "N18"),
    Condition("cancer", "Cancer (suspicion ou suivi)", "Maladies chroniques", "C80"),
    Condition("sante_mentale", "Trouble de santé mentale", "Maladies chroniques", "F99"),
    Condition("anemie", "Anémie", "Maladies chroniques", "D64.9"),
    # Santé de la mère
    Condition("grossesse_risque", "Grossesse à risque (prééclampsie, hémorragie…)", "Santé de la mère", "O26.9"),
    Condition("autre", "Autre diagnostic", "Autre", ""),
]

BY_CODE = {c.code: c for c in CONDITIONS}
STATUSES = {"suspected": "Suspect", "probable": "Probable", "confirmed": "Confirmé"}
TEST_RESULTS = {"positive": "Positif", "negative": "Négatif", "not_done": "Non fait", "pending": "En attente"}


def catalog() -> list[dict]:
    return [c._asdict() for c in CONDITIONS]


def apply_condition(record, data: dict) -> dict | None:
    """
    Enregistre le diagnostic codé du compte-rendu. Maladie à déclaration immédiate (et pas écartée par un test
    négatif) : fiche de déclaration créée, administration Fajma prévenue ; renvoie la consigne au médecin.
    """
    from django.utils import timezone

    from sunusante.api import ApiError

    code = (data.get("condition_code") or "").strip()
    if not code and "condition_code" not in data:
        return None
    if code and code not in BY_CODE:
        raise ApiError("Diagnostic inconnu")
    status = data.get("condition_status") or ("suspected" if code else "")
    test = data.get("test_result") or ""
    if status and status not in STATUSES:
        raise ApiError("Statut du diagnostic invalide")
    if test and test not in TEST_RESULTS:
        raise ApiError("Résultat de test invalide")
    record.condition_code, record.condition_status, record.test_result = code, status if code else "", test if code else ""
    record.save(update_fields=["condition_code", "condition_status", "test_result", "updated_at"])
    cond = BY_CODE.get(code)
    if not cond or cond.notify != "immediate" or test == "negative":
        return None
    from directory import localities

    from .models import DiseaseNotification

    city = record.doctor.city or ""
    loc = localities.find(city) if city else None
    notif, created = DiseaseNotification.objects.get_or_create(
        record=record,
        defaults={"condition_code": code, "condition_status": status, "city": city, "region": loc.region if loc else ""},
    )
    if not created and (notif.condition_code != code or notif.condition_status != status):
        notif.condition_code, notif.condition_status = code, status
        notif.save(update_fields=["condition_code", "condition_status", "updated_at"])
    if created:
        from accounts.models import User
        from notifications.service import notify

        for admin in User.objects.filter(is_staff=True, is_active=True):
            notify(admin, kind="mdo", title=f"Maladie à déclaration immédiate : {cond.label}",
                   body=f"{STATUSES.get(status, 'Suspect')} — {city or 'ville inconnue'} ({timezone.localdate():%d/%m}). "
                        f"Médecin : {record.doctor.full_name}.", link="/admin#veille", email=True)
    from backoffice.settings_registry import get_setting

    hotline = get_setting("epidemic_hotline")
    return {
        "condition": cond.label,
        "message": f"{cond.label} : maladie à déclaration immédiate. Déclarez ce cas {STATUSES.get(status, 'suspect').lower()} "
                   f"au district sanitaire dès maintenant{f' ({hotline})' if hotline else ''}, puis indiquez-le dans Fajma.",
        "notification_id": str(notif.id),
        "declared": bool(notif.declared_at),
    }
