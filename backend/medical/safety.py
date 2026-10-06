"""
Contrôle de sécurité d'une ordonnance : allergies, interactions avec les traitements en cours, maladies et
états du patient (grossesse, rein, asthme, déficit en G6PD…), âge.

Ce que le médecin voit pendant qu'il rédige, et que le serveur revérifie à l'enregistrement : une alerte
« majeure » bloque tant que le médecin n'a pas écrit pourquoi il maintient sa prescription. Cette
justification est conservée avec l'ordonnance et inscrite au journal.

L'état du patient est reconstitué sans rien lui redemander :
- allergies, antécédents et traitements du profil de santé (ou de la fiche du proche) ;
- diagnostics codés des comptes-rendus (medical/conditions.py) ;
- alertes vitales de la fiche d'urgence ;
- grossesse en cours du carnet de santé ;
- médicaments des ordonnances encore valables ;
- âge (date de naissance du patient ou du proche).
"""

from __future__ import annotations

from datetime import date, timedelta

from .medicines import (
    AGE_LIMITS,
    BY_CODE,
    CONTRAINDICATIONS,
    CROSS_ALLERGY,
    ELDERLY_RULES,
    ELDERLY_YEARS,
    FAMILIES,
    INFO,
    INTERACTIONS,
    LEVEL_LABELS,
    MAJOR,
    MODERATE,
    STATES,
    expand,
    find_in_text,
    normalize,
)

LEVEL_ORDER = {MAJOR: 0, MODERATE: 1, INFO: 2}
# Une ordonnance plus ancienne que cela n'est plus considérée comme un traitement en cours.
CURRENT_MONTHS = 6

# Diagnostic codé du compte-rendu (medical/conditions.py) → état à surveiller.
CONDITION_TO_STATE = {
    "hypertension": "hypertension",
    "diabete": "diabete",
    "asthme": "asthme",
    "drepanocytose": "drepanocytose",
    "insuffisance_renale": "insuffisance_renale",
    "hepatite_b": "hepatite",
    "hepatite_c": "hepatite",
    "hepatite_a_e": "hepatite",
    "grossesse_risque": "grossesse",
}
# Alerte vitale de la fiche d'urgence → état à surveiller.
FLAG_TO_STATE = {
    "diabete": "diabete",
    "epilepsie": "epilepsie",
    "drepanocytose": "drepanocytose",
    "anticoagulant": "anticoagulant",
    "cardiaque": "insuffisance_cardiaque",
    "hypertension": "hypertension",
    "asthme": "asthme",
    "dialyse": "insuffisance_renale",
    "hemophilie": "hemophilie",
    "enceinte": "grossesse",
}
# Mots des antécédents écrits en toutes lettres → état à surveiller.
TEXT_TO_STATE: list[tuple[tuple[str, ...], str]] = [
    (("enceinte", "grossesse", "gestante"), "grossesse"),
    (("allaite", "allaitement"), "allaitement"),
    (("asthme", "asthmatique"), "asthme"),
    (("insuffisance renale", "renale chronique", "dialyse", "nephropathie"), "insuffisance_renale"),
    (("insuffisance cardiaque", "cardiaque"), "insuffisance_cardiaque"),
    (("hypertension", "hta", "tension"), "hypertension"),
    (("diabete", "diabetique"), "diabete"),
    (("epilepsie", "epileptique", "convulsion"), "epilepsie"),
    (("drepanocytose", "drepanocytaire"), "drepanocytose"),
    (("g6pd", "favisme", "deficit en g6pd"), "g6pd"),
    (("ulcere", "gastrite"), "ulcere"),
    (("hepatite", "cirrhose", "foie"), "hepatite"),
    (("hemophilie", "trouble de la coagulation"), "hemophilie"),
    (("glaucome",), "glaucome"),
]


def _age(birth: date | None) -> float | None:
    if not birth:
        return None
    today = date.today()
    return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))


def _states_from_text(text: str) -> set[str]:
    norm = f" {normalize(text)} "
    return {state for words, state in TEXT_TO_STATE if any(f" {normalize(w)} " in norm for w in words)}


def patient_state(patient, relative=None) -> dict:
    """Tout ce qui sert au contrôle, rassemblé en une fois (sans contenu médical détaillé)."""
    from carnet.models import Pregnancy

    from .models import HealthProfile, MedicalRecord, Prescription, RelativeEmergencyCard

    allergies_text = conditions_text = treatments_text = devices_text = ""
    flags: list[str] = []
    if relative is not None:
        card = RelativeEmergencyCard.objects.filter(relative=relative).first()
        if card:
            allergies_text, conditions_text, treatments_text = card.allergies, card.conditions, card.treatments
            devices_text = card.medical_devices
            flags = list(card.critical_flags or [])
        birth, sex = relative.birth_date, relative.sex
    else:
        hp = HealthProfile.objects.filter(user=patient).first()
        if hp:
            allergies_text, conditions_text, treatments_text = hp.allergies, hp.conditions, hp.treatments
            devices_text = hp.medical_devices
            flags = list(hp.critical_flags or [])
        birth, sex = patient.birth_date, patient.sex

    allergy_codes, allergy_families = find_in_text(allergies_text)
    # Allergie croisée : allergique aux pénicillines → prudence sur les céphalosporines.
    cross = {}
    for source, target, note in CROSS_ALLERGY:
        if source in allergy_families and target not in allergy_families:
            cross[target] = note

    treatment_codes, _ = find_in_text(treatments_text)
    current: dict[str, str] = {c: "traitement déclaré par le patient" for c in treatment_codes}
    # Ordonnances encore valables : source la plus fiable.
    since = date.today() - timedelta(days=round(CURRENT_MONTHS * 30.44))
    rx = Prescription.objects.filter(patient=patient, created_at__date__gte=since)
    rx = rx.filter(relative=relative) if relative is not None else rx.filter(relative__isnull=True)
    for p in rx.order_by("-created_at")[:20]:
        if p.valid_until and p.valid_until < date.today():
            continue
        for item in p.items or []:
            codes, _ = find_in_text(item.get("name", ""))
            for code in codes:
                current.setdefault(code, f"ordonnance {p.reference}")

    states = {FLAG_TO_STATE[f] for f in flags if f in FLAG_TO_STATE}
    states |= _states_from_text(conditions_text)
    # Le compte-rendu n'a pas de champ « proche » : le sujet réel est celui du rendez-vous.
    subject_filter = (
        {"appointment__relative": relative} if relative is not None else {"appointment__relative__isnull": True}
    )
    codes = (
        MedicalRecord.objects.filter(patient=patient, **subject_filter)
        .exclude(condition_code="")
        .order_by("-created_at")
        .values_list("condition_code", flat=True)[:30]
    )
    states |= {CONDITION_TO_STATE[c] for c in codes if c in CONDITION_TO_STATE}
    if relative is None and Pregnancy.objects.filter(owner=patient, status="active").exists():
        states.add("grossesse")
    # Un homme ne peut pas être enceint : évite une alerte absurde sur une saisie erronée.
    if sex == "M":
        states.discard("grossesse")
        states.discard("allaitement")

    return {
        "allergy_codes": allergy_codes,
        "allergy_families": allergy_families,
        "cross_allergies": cross,
        "current": current,
        "states": states,
        "age": _age(birth),
        "sex": sex or "",
        "known": bool(allergies_text or conditions_text or treatments_text or flags or current),
        # Textes bruts : utilisés par les contrôles qui cherchent autre chose qu'un médicament
        # (allergie à l'iode, pacemaker avant une IRM).
        "allergies_text": allergies_text,
        "devices_text": devices_text,
    }


def _cap(text: str) -> str:
    """Majuscule initiale sans toucher au reste : capitalize() abîmerait « syndrome de Reye »."""
    return text[:1].upper() + text[1:] if text else text


def _alert(level, title, detail, item_name, kind) -> dict:
    return {"level": level, "level_label": LEVEL_LABELS[level], "title": title, "detail": detail,
            "medicine": item_name, "kind": kind}


def check(items: list[dict], state: dict) -> list[dict]:
    """Alertes pour les médicaments d'une ordonnance, de la plus grave à la moins grave."""
    alerts: list[dict] = []
    # Médicament prescrit → son code au catalogue (ceux qu'on ne reconnaît pas sont signalés une fois).
    prescribed: list[tuple[str, str]] = []  # (nom saisi, code)
    unknown: list[str] = []
    for item in items:
        name = (item.get("name") or "").strip()
        if not name:
            continue
        codes, _ = find_in_text(name)
        if codes:
            prescribed += [(name, c) for c in codes]
        else:
            unknown.append(name)

    for name, code in prescribed:
        med = BY_CODE[code]
        family = med.family

        # 1. Allergie déclarée
        if code in state["allergy_codes"]:
            alerts.append(_alert(MAJOR, "Allergie déclarée à ce médicament",
                                 f"Le patient a déclaré une allergie à {med.dci}.", name, "allergie"))
        elif family in state["allergy_families"]:
            alerts.append(_alert(MAJOR, "Allergie déclarée à cette famille",
                                 f"Le patient a déclaré une allergie aux {FAMILIES.get(family, family).lower()}.", name, "allergie"))
        elif family in state["cross_allergies"]:
            alerts.append(_alert(MODERATE, "Risque d'allergie croisée",
                                 state["cross_allergies"][family] + ".", name, "allergie"))

        # 2. Interaction avec un traitement en cours ou un autre médicament de l'ordonnance
        others = {c: src for c, src in state["current"].items() if c != code}
        for other_name, other_code in prescribed:
            if other_code != code:
                others.setdefault(other_code, "autre médicament de cette ordonnance")
        for rule in INTERACTIONS:
            for first, second in ((rule.a, rule.b), (rule.b, rule.a)):
                if code in expand(first):
                    for other in expand(second) & others.keys():
                        alerts.append(_alert(
                            rule.level, f"Interaction avec {BY_CODE[other].dci}",
                            f"{_cap(rule.reason)} ({others[other]}).", name, "interaction"))

        # 3. État du patient
        for rule in CONTRAINDICATIONS:
            if rule.state in state["states"] and code in expand(rule.target):
                alerts.append(_alert(rule.level, STATES[rule.state], _cap(rule.reason) + ".", name, "etat"))

        # 4. Âge
        age = state["age"]
        if age is not None:
            for rule in AGE_LIMITS:
                if age < rule.min_years and code in expand(rule.target):
                    alerts.append(_alert(rule.level, f"Âge : {int(age)} an(s)", _cap(rule.reason) + ".", name, "age"))
            if age >= ELDERLY_YEARS:
                for target, level, reason in ELDERLY_RULES:
                    if code in expand(target):
                        alerts.append(_alert(level, f"Âge : {int(age)} ans", _cap(reason) + ".", name, "age"))

        # 5. Doublon
        if code in state["current"]:
            alerts.append(_alert(MODERATE, "Déjà en cours",
                                 f"{med.dci} figure déjà dans le traitement du patient ({state['current'][code]}) : vérifier la dose totale.",
                                 name, "doublon"))

    if unknown and state["known"]:
        alerts.append(_alert(INFO, "Médicament hors catalogue",
                             "Non reconnu, donc non vérifié : " + ", ".join(sorted(set(unknown))[:5])
                             + ". Vérifiez vous-même allergies et interactions.", "", "inconnu"))

    # Doublons d'alertes (même médicament, même message) supprimés, puis tri par gravité.
    seen, unique = set(), []
    for a in alerts:
        key = (a["level"], a["title"], a["detail"], a["medicine"])
        if key not in seen:
            seen.add(key)
            unique.append(a)
    unique.sort(key=lambda a: (LEVEL_ORDER[a["level"]], a["medicine"]))
    return unique


def summary(alerts: list[dict]) -> dict:
    counts = {MAJOR: 0, MODERATE: 0, INFO: 0}
    for a in alerts:
        counts[a["level"]] += 1
    return {"alerts": alerts, "major": counts[MAJOR], "moderate": counts[MODERATE], "info": counts[INFO],
            "blocking": counts[MAJOR] > 0}


# ── Imagerie médicale ────────────────────────────────────────────────

# Examens utilisant les rayons X : à éviter chez la femme enceinte.
XRAY_MODALITIES = {"radio", "scanner", "mammo", "panoramique", "osteo"}
IODINE_WORDS = ("iode", "iodé", "produit de contraste", "contraste")
DEVICE_WORDS = ("pacemaker", "stimulateur cardiaque", "defibrillateur", "neurostimulateur",
                "valve mecanique", "clip", "eclat metallique", "implant cochleaire", "pompe a insuline")


def imaging_alerts(state: dict, modality: str, contrast: bool) -> list[dict]:
    """
    Alertes propres à un examen d'imagerie : grossesse et rayons X, pacemaker et IRM, produit de contraste
    chez un patient sous metformine, insuffisant rénal ou allergique à l'iode.
    """
    from labs.imaging import label as modality_label

    alerts: list[dict] = []
    exam = modality_label(modality) if modality else "Examen"

    if modality in XRAY_MODALITIES and "grossesse" in state["states"]:
        alerts.append(_alert(MAJOR, "Grossesse et rayons X",
                             "Cet examen utilise les rayons X : à éviter pendant la grossesse. "
                             "Préférer une échographie ou une IRM quand c'est possible ; sinon, protection abdominale.",
                             exam, "etat"))
    if modality == "irm":
        devices = normalize(state.get("devices_text", ""))
        found = [w for w in DEVICE_WORDS if normalize(w) in devices]
        if found:
            alerts.append(_alert(MAJOR, "Appareil implanté et IRM",
                                 f"Le patient porte : {state['devices_text']}. "
                                 "L'IRM peut être dangereuse : vérifier la compatibilité avec le centre avant l'examen.",
                                 exam, "etat"))
    if contrast:
        if "metformine" in state["current"]:
            alerts.append(_alert(MAJOR, "Metformine et produit de contraste",
                                 "Risque d'acidose lactique : arrêter la metformine le jour de l'examen et les 48 heures "
                                 "suivantes, reprise après contrôle de la fonction rénale.", exam, "interaction"))
        if "insuffisance_renale" in state["states"]:
            alerts.append(_alert(MAJOR, "Rein et produit de contraste",
                                 "Risque d'aggravation de l'insuffisance rénale : créatinine récente, hydratation, "
                                 "avis du radiologue.", exam, "etat"))
        allergies = normalize(state.get("allergies_text", ""))
        if any(normalize(w) in allergies for w in IODINE_WORDS):
            alerts.append(_alert(MAJOR, "Allergie au produit de contraste",
                                 f"Allergie déclarée : {state['allergies_text']}. Prévenir le centre d'imagerie.",
                                 exam, "allergie"))
    return alerts


def check_imaging(patient, relative, modality: str, contrast: bool) -> dict:
    return summary(imaging_alerts(patient_state(patient, relative), modality, contrast))
