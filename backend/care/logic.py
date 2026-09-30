"""Repères indicatifs pour signaler une mesure inhabituelle (ils ne remplacent pas l'avis du médecin)."""


def assess(kind: str, systolic=None, diastolic=None, value=None, context="") -> tuple[str, str | None]:
    """(niveau, message) : niveau parmi normal, high, very_high, low."""
    if kind == "blood_pressure" and systolic and diastolic:
        if systolic >= 180 or diastolic >= 110:
            return "very_high", (
                "Tension très élevée. Reposez-vous 5 minutes et mesurez à nouveau. Si elle reste aussi haute ou en cas "
                "de maux de tête violents, douleur dans la poitrine, gêne pour parler ou bouger : appelez le SAMU (1515)."
            )
        if systolic >= 140 or diastolic >= 90:
            return "high", "Tension élevée : notez-la et parlez-en à votre médecin si cela se répète."
        if systolic < 90:
            return "low", "Tension basse : si vous avez des vertiges ou un malaise, contactez un médecin."
    if kind == "glucose" and value is not None:
        if value < 0.7:
            return "low", "Glycémie basse (hypoglycémie) : prenez tout de suite du sucre (jus, sucre, bonbon), puis mesurez à nouveau."
        if value >= 2.5:
            return "very_high", "Glycémie très élevée : contactez votre médecin aujourd'hui, ou les urgences si vous vous sentez mal."
        if (context == "fasting" and value >= 1.26) or (context != "fasting" and value >= 2.0):
            return "high", "Glycémie élevée : notez-la et parlez-en à votre médecin si cela se répète."
    return "normal", None
