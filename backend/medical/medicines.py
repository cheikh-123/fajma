"""
Catalogue des médicaments et règles de sécurité de la prescription (allergies, interactions,
contre-indications liées à l'état du patient, limites d'âge).

Base : Liste nationale des médicaments et produits essentiels du Sénégal, complétée des spécialités
couramment prescrites. Les règles sont celles des référentiels classiques (OMS, résumés des
caractéristiques du produit) limitées aux associations **établies et cliniquement utiles** : l'objectif est
d'alerter sur ce qui blesse, pas de noyer le médecin sous des avertissements.

C'est une **aide à la prescription**, jamais une autorisation ni un refus : le médecin reste seul
responsable. Une alerte « majeure » demande une justification écrite, qui est conservée et journalisée.

Liste et règles à faire valider par la Direction de la Pharmacie et du Médicament avant la mise en service :
c'est le seul fichier à modifier (comme `medical/conditions.py` pour les maladies).
"""

from __future__ import annotations

import re
import unicodedata
from typing import NamedTuple

# ── Familles (une allergie vise en général toute la famille) ──────────

FAMILIES: dict[str, str] = {
    "penicillines": "Pénicillines",
    "cephalosporines": "Céphalosporines",
    "sulfamides": "Sulfamides antibactériens",
    "macrolides": "Macrolides",
    "quinolones": "Quinolones",
    "cyclines": "Cyclines",
    "aminosides": "Aminosides",
    "nitroimidazoles": "Nitro-imidazolés",
    "phenicoles": "Phénicolés",
    "nitrofuranes": "Nitrofuranes",
    "antipaludiques": "Antipaludiques",
    "antalgiques": "Antalgiques (paracétamol)",
    "ains": "Anti-inflammatoires non stéroïdiens et aspirine",
    "opioides": "Opioïdes",
    "calcium": "Inhibiteurs calciques",
    "iec": "Inhibiteurs de l'enzyme de conversion",
    "ara2": "Antagonistes des récepteurs de l'angiotensine II",
    "betabloquants": "Bêtabloquants",
    "diuretiques_thiazidiques": "Diurétiques thiazidiques",
    "diuretiques_anse": "Diurétiques de l'anse",
    "diuretiques_epargneurs": "Diurétiques épargneurs de potassium",
    "antihypertenseurs_centraux": "Antihypertenseurs centraux",
    "digitaliques": "Digitaliques",
    "statines": "Statines",
    "avk": "Antivitamines K",
    "heparines": "Héparines",
    "antiagregants": "Antiagrégants plaquettaires",
    "biguanides": "Biguanides (metformine)",
    "sulfamides_hypoglycemiants": "Sulfamides hypoglycémiants",
    "insulines": "Insulines",
    "beta2": "Bêta-2 mimétiques",
    "corticoides": "Corticoïdes (voie générale)",
    "corticoides_inhales": "Corticoïdes inhalés",
    "ipp": "Inhibiteurs de la pompe à protons",
    "antiemetiques": "Antiémétiques",
    "antidiarrheiques": "Antidiarrhéiques",
    "rehydratation": "Réhydratation orale",
    "antiepileptiques": "Antiépileptiques",
    "benzodiazepines": "Benzodiazépines",
    "isrs": "Antidépresseurs ISRS",
    "antidepresseurs_tricycliques": "Antidépresseurs tricycliques",
    "neuroleptiques": "Neuroleptiques",
    "arv": "Antirétroviraux",
    "antituberculeux": "Antituberculeux",
    "antifongiques_azoles": "Antifongiques azolés",
    "antifongiques": "Antifongiques (autres)",
    "antihistaminiques": "Antihistaminiques",
    "antiparasitaires": "Antiparasitaires",
    "supplements": "Vitamines et suppléments",
    "cytotoxiques": "Cytotoxiques",
    "contraceptifs_oraux": "Contraceptifs oraux",
    "uterotoniques": "Utérotoniques",
    "antispasmodiques": "Antispasmodiques",
}

# Allergie croisée partielle : être allergique à la première famille impose la prudence sur la seconde.
CROSS_ALLERGY: list[tuple[str, str, str]] = [
    ("penicillines", "cephalosporines", "allergie croisée pénicillines–céphalosporines (environ 1 à 3 % des cas)"),
    ("cephalosporines", "penicillines", "allergie croisée céphalosporines–pénicillines (environ 1 à 3 % des cas)"),
    ("sulfamides", "sulfamides_hypoglycemiants", "parenté chimique des sulfamides (risque faible mais décrit)"),
]


class Medicine(NamedTuple):
    code: str
    dci: str  # dénomination commune internationale
    family: str
    group: str  # classe affichée au médecin
    brands: tuple[str, ...] = ()
    forms: str = ""
    essential: bool = True  # figure sur la liste nationale des médicaments essentiels


MEDICINES: list[Medicine] = [
    # ── Antibiotiques ──
    Medicine("amoxicilline", "Amoxicilline", "penicillines", "Antibiotique", ("Clamoxyl", "Amoxil", "Hiconcil"), "gélule, sirop, injectable"),
    Medicine("amoxicilline_clavulanate", "Amoxicilline + acide clavulanique", "penicillines", "Antibiotique", ("Augmentin",), "comprimé, sirop"),
    Medicine("ampicilline", "Ampicilline", "penicillines", "Antibiotique", (), "injectable"),
    Medicine("cloxacilline", "Cloxacilline", "penicillines", "Antibiotique", ("Orbénine",), "gélule, injectable"),
    Medicine("penicilline_g", "Benzylpénicilline (pénicilline G)", "penicillines", "Antibiotique", (), "injectable"),
    Medicine("penicilline_v", "Phénoxyméthylpénicilline (pénicilline V)", "penicillines", "Antibiotique", ("Oracilline",), "comprimé, sirop"),
    Medicine("benzathine_penicilline", "Benzathine benzylpénicilline", "penicillines", "Antibiotique", ("Extencilline",), "injectable"),
    Medicine("ceftriaxone", "Ceftriaxone", "cephalosporines", "Antibiotique", ("Rocéphine",), "injectable"),
    Medicine("cefixime", "Céfixime", "cephalosporines", "Antibiotique", ("Oroken",), "comprimé, sirop"),
    Medicine("cefalexine", "Céfalexine", "cephalosporines", "Antibiotique", ("Keforal",), "gélule, sirop"),
    Medicine("cotrimoxazole", "Sulfaméthoxazole + triméthoprime (cotrimoxazole)", "sulfamides", "Antibiotique", ("Bactrim", "Eusaprim"), "comprimé, sirop"),
    Medicine("metronidazole", "Métronidazole", "nitroimidazoles", "Antibiotique / antiparasitaire", ("Flagyl",), "comprimé, sirop, perfusion"),
    Medicine("ciprofloxacine", "Ciprofloxacine", "quinolones", "Antibiotique", ("Ciflox", "Ciprofar"), "comprimé, perfusion"),
    Medicine("ofloxacine", "Ofloxacine", "quinolones", "Antibiotique", ("Oflocet",), "comprimé"),
    Medicine("azithromycine", "Azithromycine", "macrolides", "Antibiotique", ("Zithromax", "Azix"), "comprimé, sirop"),
    Medicine("erythromycine", "Érythromycine", "macrolides", "Antibiotique", (), "comprimé, sirop"),
    Medicine("doxycycline", "Doxycycline", "cyclines", "Antibiotique", ("Vibramycine", "Doxy"), "comprimé"),
    Medicine("gentamicine", "Gentamicine", "aminosides", "Antibiotique", (), "injectable"),
    Medicine("chloramphenicol", "Chloramphénicol", "phenicoles", "Antibiotique", (), "gélule, injectable, collyre"),
    Medicine("nitrofurantoine", "Nitrofurantoïne", "nitrofuranes", "Antibiotique urinaire", ("Furadantine",), "gélule"),
    # ── Antipaludiques ──
    Medicine("artemether_lumefantrine", "Artéméther + luméfantrine", "antipaludiques", "Antipaludique", ("Coartem", "Riamet"), "comprimé"),
    Medicine("artesunate_amodiaquine", "Artésunate + amodiaquine", "antipaludiques", "Antipaludique", ("Coarsucam", "ASAQ"), "comprimé"),
    Medicine("artesunate", "Artésunate", "antipaludiques", "Antipaludique (forme grave)", (), "injectable"),
    Medicine("quinine", "Quinine", "antipaludiques", "Antipaludique", (), "comprimé, perfusion"),
    Medicine("sulfadoxine_pyrimethamine", "Sulfadoxine + pyriméthamine", "sulfamides", "Antipaludique (traitement préventif intermittent)", ("Fansidar",), "comprimé"),
    Medicine("primaquine", "Primaquine", "antipaludiques", "Antipaludique", (), "comprimé"),
    # ── Douleur et fièvre ──
    Medicine("paracetamol", "Paracétamol", "antalgiques", "Antalgique / antipyrétique", ("Doliprane", "Efferalgan", "Panadol", "Dafalgan"), "comprimé, sirop, suppositoire, perfusion"),
    Medicine("ibuprofene", "Ibuprofène", "ains", "Anti-inflammatoire", ("Advil", "Nurofen", "Brufen"), "comprimé, sirop"),
    Medicine("diclofenac", "Diclofénac", "ains", "Anti-inflammatoire", ("Voltarène",), "comprimé, injectable, gel"),
    Medicine("ketoprofene", "Kétoprofène", "ains", "Anti-inflammatoire", ("Profénid",), "comprimé, injectable"),
    Medicine("aspirine", "Acide acétylsalicylique (aspirine)", "ains", "Antalgique / antiagrégant", ("Aspégic", "Kardégic", "Aspirine du Rhône"), "comprimé, sachet"),
    Medicine("tramadol", "Tramadol", "opioides", "Antalgique de palier 2", ("Contramal", "Topalgic"), "gélule, injectable"),
    Medicine("codeine", "Codéine", "opioides", "Antalgique de palier 2", (), "comprimé, sirop"),
    Medicine("morphine", "Morphine", "opioides", "Antalgique de palier 3", (), "comprimé, injectable"),
    Medicine("phloroglucinol", "Phloroglucinol", "antispasmodiques", "Antispasmodique", ("Spasfon",), "comprimé, injectable"),
    Medicine("butylscopolamine", "Butylscopolamine", "antispasmodiques", "Antispasmodique", ("Buscopan",), "comprimé, injectable"),
    # ── Cœur et tension ──
    Medicine("amlodipine", "Amlodipine", "calcium", "Antihypertenseur", ("Amlor",), "comprimé"),
    Medicine("nifedipine", "Nifédipine", "calcium", "Antihypertenseur", ("Adalate",), "comprimé"),
    Medicine("captopril", "Captopril", "iec", "Antihypertenseur", ("Lopril",), "comprimé"),
    Medicine("enalapril", "Énalapril", "iec", "Antihypertenseur", ("Renitec",), "comprimé"),
    Medicine("lisinopril", "Lisinopril", "iec", "Antihypertenseur", ("Zestril",), "comprimé"),
    Medicine("losartan", "Losartan", "ara2", "Antihypertenseur", ("Cozaar",), "comprimé"),
    Medicine("hydrochlorothiazide", "Hydrochlorothiazide", "diuretiques_thiazidiques", "Diurétique", (), "comprimé"),
    Medicine("furosemide", "Furosémide", "diuretiques_anse", "Diurétique", ("Lasilix",), "comprimé, injectable"),
    Medicine("spironolactone", "Spironolactone", "diuretiques_epargneurs", "Diurétique", ("Aldactone",), "comprimé"),
    Medicine("atenolol", "Aténolol", "betabloquants", "Bêtabloquant", ("Ténormine",), "comprimé"),
    Medicine("propranolol", "Propranolol", "betabloquants", "Bêtabloquant", ("Avlocardyl",), "comprimé"),
    Medicine("bisoprolol", "Bisoprolol", "betabloquants", "Bêtabloquant", ("Cardensiel",), "comprimé"),
    Medicine("methyldopa", "Méthyldopa", "antihypertenseurs_centraux", "Antihypertenseur (grossesse)", ("Aldomet",), "comprimé"),
    Medicine("digoxine", "Digoxine", "digitaliques", "Cardiotonique", (), "comprimé"),
    Medicine("atorvastatine", "Atorvastatine", "statines", "Hypolipémiant", ("Tahor",), "comprimé"),
    Medicine("simvastatine", "Simvastatine", "statines", "Hypolipémiant", ("Zocor",), "comprimé"),
    # ── Sang ──
    Medicine("warfarine", "Warfarine", "avk", "Anticoagulant", ("Coumadine",), "comprimé"),
    Medicine("acenocoumarol", "Acénocoumarol", "avk", "Anticoagulant", ("Sintrom",), "comprimé"),
    Medicine("heparine", "Héparine", "heparines", "Anticoagulant", (), "injectable"),
    Medicine("enoxaparine", "Énoxaparine", "heparines", "Anticoagulant", ("Lovenox",), "injectable"),
    Medicine("clopidogrel", "Clopidogrel", "antiagregants", "Antiagrégant plaquettaire", ("Plavix",), "comprimé"),
    # ── Diabète ──
    Medicine("metformine", "Metformine", "biguanides", "Antidiabétique", ("Glucophage", "Stagid"), "comprimé"),
    Medicine("glibenclamide", "Glibenclamide", "sulfamides_hypoglycemiants", "Antidiabétique", ("Daonil",), "comprimé"),
    Medicine("gliclazide", "Gliclazide", "sulfamides_hypoglycemiants", "Antidiabétique", ("Diamicron",), "comprimé"),
    Medicine("insuline", "Insuline", "insulines", "Antidiabétique", ("Lantus", "Actrapid", "Mixtard"), "injectable"),
    # ── Respiratoire ──
    Medicine("salbutamol", "Salbutamol", "beta2", "Bronchodilatateur", ("Ventoline",), "aérosol, sirop, injectable"),
    Medicine("beclometasone", "Béclométasone", "corticoides_inhales", "Corticoïde inhalé", ("Bécotide",), "aérosol"),
    Medicine("prednisolone", "Prednisolone", "corticoides", "Corticoïde", ("Solupred",), "comprimé"),
    Medicine("dexamethasone", "Dexaméthasone", "corticoides", "Corticoïde", (), "comprimé, injectable"),
    Medicine("hydrocortisone", "Hydrocortisone", "corticoides", "Corticoïde", (), "injectable"),
    # ── Digestif ──
    Medicine("omeprazole", "Oméprazole", "ipp", "Protecteur gastrique", ("Mopral", "Oméprazol"), "gélule"),
    Medicine("metoclopramide", "Métoclopramide", "antiemetiques", "Antinauséeux", ("Primpéran",), "comprimé, injectable"),
    Medicine("loperamide", "Lopéramide", "antidiarrheiques", "Antidiarrhéique", ("Imodium",), "gélule"),
    Medicine("sro", "Sels de réhydratation orale", "rehydratation", "Réhydratation", ("SRO",), "sachet"),
    # ── Système nerveux ──
    Medicine("phenobarbital", "Phénobarbital", "antiepileptiques", "Antiépileptique", ("Gardénal",), "comprimé, injectable"),
    Medicine("carbamazepine", "Carbamazépine", "antiepileptiques", "Antiépileptique", ("Tégrétol",), "comprimé"),
    Medicine("valproate", "Valproate de sodium", "antiepileptiques", "Antiépileptique", ("Dépakine",), "comprimé, sirop"),
    Medicine("phenytoine", "Phénytoïne", "antiepileptiques", "Antiépileptique", ("Di-Hydan",), "comprimé"),
    Medicine("diazepam", "Diazépam", "benzodiazepines", "Anxiolytique / anticonvulsivant", ("Valium",), "comprimé, injectable"),
    Medicine("fluoxetine", "Fluoxétine", "isrs", "Antidépresseur", ("Prozac",), "gélule"),
    Medicine("amitriptyline", "Amitriptyline", "antidepresseurs_tricycliques", "Antidépresseur", ("Laroxyl",), "comprimé"),
    Medicine("haloperidol", "Halopéridol", "neuroleptiques", "Neuroleptique", ("Haldol",), "comprimé, injectable"),
    Medicine("chlorpromazine", "Chlorpromazine", "neuroleptiques", "Neuroleptique", ("Largactil",), "comprimé, injectable"),
    # ── VIH et tuberculose ──
    Medicine("tenofovir", "Ténofovir", "arv", "Antirétroviral", (), "comprimé"),
    Medicine("lamivudine", "Lamivudine", "arv", "Antirétroviral", (), "comprimé"),
    Medicine("dolutegravir", "Dolutégravir", "arv", "Antirétroviral", ("TLD",), "comprimé"),
    Medicine("efavirenz", "Éfavirenz", "arv", "Antirétroviral", (), "comprimé"),
    Medicine("zidovudine", "Zidovudine", "arv", "Antirétroviral", ("AZT",), "comprimé"),
    Medicine("rifampicine", "Rifampicine", "antituberculeux", "Antituberculeux", ("Rifadine",), "gélule, sirop"),
    Medicine("isoniazide", "Isoniazide", "antituberculeux", "Antituberculeux", (), "comprimé"),
    Medicine("pyrazinamide", "Pyrazinamide", "antituberculeux", "Antituberculeux", (), "comprimé"),
    Medicine("ethambutol", "Éthambutol", "antituberculeux", "Antituberculeux", (), "comprimé"),
    # ── Antifongiques, antihistaminiques, antiparasitaires ──
    Medicine("fluconazole", "Fluconazole", "antifongiques_azoles", "Antifongique", ("Triflucan",), "gélule, perfusion"),
    Medicine("ketoconazole", "Kétoconazole", "antifongiques_azoles", "Antifongique", (), "comprimé, crème"),
    Medicine("griseofulvine", "Griséofulvine", "antifongiques", "Antifongique", (), "comprimé"),
    Medicine("cetirizine", "Cétirizine", "antihistaminiques", "Antihistaminique", ("Zyrtec",), "comprimé, sirop"),
    Medicine("chlorphenamine", "Chlorphénamine", "antihistaminiques", "Antihistaminique", ("Polaramine",), "comprimé, sirop"),
    Medicine("promethazine", "Prométhazine", "antihistaminiques", "Antihistaminique", ("Phénergan",), "sirop, injectable"),
    Medicine("albendazole", "Albendazole", "antiparasitaires", "Antiparasitaire", ("Zentel",), "comprimé, sirop"),
    Medicine("mebendazole", "Mébendazole", "antiparasitaires", "Antiparasitaire", ("Vermox",), "comprimé, sirop"),
    Medicine("praziquantel", "Praziquantel", "antiparasitaires", "Antiparasitaire (bilharziose)", ("Biltricide",), "comprimé"),
    Medicine("ivermectine", "Ivermectine", "antiparasitaires", "Antiparasitaire", ("Mectizan",), "comprimé"),
    # ── Sang, vitamines, santé de la mère ──
    Medicine("fer_acide_folique", "Fer + acide folique", "supplements", "Supplément", (), "comprimé"),
    Medicine("acide_folique", "Acide folique", "supplements", "Supplément", (), "comprimé"),
    Medicine("vitamine_a", "Vitamine A (rétinol)", "supplements", "Supplément", (), "capsule"),
    Medicine("calcium", "Calcium", "supplements", "Supplément", (), "comprimé"),
    Medicine("hydroxyuree", "Hydroxyurée (hydroxycarbamide)", "cytotoxiques", "Drépanocytose", ("Siklos", "Hydréa"), "gélule"),
    Medicine("contraceptif_oral", "Contraceptif oral œstroprogestatif", "contraceptifs_oraux", "Contraception", ("Microgynon", "Duofem"), "comprimé"),
    Medicine("misoprostol", "Misoprostol", "uterotoniques", "Utérotonique", ("Cytotec",), "comprimé"),
    Medicine("ocytocine", "Ocytocine", "uterotoniques", "Utérotonique", ("Syntocinon",), "injectable"),
    Medicine("magnesium_sulfate", "Sulfate de magnésium", "uterotoniques", "Prééclampsie / éclampsie", (), "injectable"),
]

BY_CODE: dict[str, Medicine] = {m.code: m for m in MEDICINES}
BY_FAMILY: dict[str, list[Medicine]] = {}
for _m in MEDICINES:
    BY_FAMILY.setdefault(_m.family, []).append(_m)

MAJOR, MODERATE, INFO = "majeure", "moderee", "information"
LEVEL_LABELS = {MAJOR: "Alerte majeure", MODERATE: "Précaution", INFO: "Information"}


class Rule(NamedTuple):
    """`a` et `b` : code de médicament, ou « fam:<famille> » pour toute une famille."""

    a: str
    b: str
    level: str
    reason: str


INTERACTIONS: list[Rule] = [
    # Saignement
    Rule("fam:avk", "fam:ains", MAJOR, "risque hémorragique élevé et déséquilibre de l'INR"),
    Rule("fam:avk", "fam:antiagregants", MAJOR, "addition des effets : risque hémorragique"),
    Rule("fam:avk", "metronidazole", MAJOR, "augmentation marquée de l'INR : risque hémorragique"),
    Rule("fam:avk", "cotrimoxazole", MAJOR, "augmentation marquée de l'INR : risque hémorragique"),
    Rule("fam:avk", "fluconazole", MAJOR, "augmentation marquée de l'INR : risque hémorragique"),
    Rule("fam:avk", "rifampicine", MAJOR, "effondrement de l'effet anticoagulant : risque de thrombose"),
    Rule("fam:avk", "fam:macrolides", MODERATE, "augmentation possible de l'INR : contrôler plus souvent"),
    Rule("fam:avk", "fam:cyclines", MODERATE, "augmentation possible de l'INR : contrôler plus souvent"),
    Rule("fam:heparines", "fam:ains", MODERATE, "addition du risque hémorragique"),
    Rule("fam:antiagregants", "fam:ains", MODERATE, "addition du risque hémorragique digestif"),
    Rule("fam:isrs", "fam:ains", MODERATE, "risque d'hémorragie digestive augmenté"),
    # Rein, potassium, tension
    Rule("fam:iec", "fam:ains", MODERATE, "risque d'insuffisance rénale aiguë, surtout si déshydratation"),
    Rule("fam:ara2", "fam:ains", MODERATE, "risque d'insuffisance rénale aiguë, surtout si déshydratation"),
    Rule("fam:iec", "fam:diuretiques_epargneurs", MAJOR, "risque d'hyperkaliémie (trouble du rythme)"),
    Rule("fam:ara2", "fam:diuretiques_epargneurs", MAJOR, "risque d'hyperkaliémie (trouble du rythme)"),
    Rule("fam:iec", "fam:ara2", MAJOR, "association déconseillée : insuffisance rénale et hyperkaliémie"),
    Rule("fam:ains", "fam:diuretiques_anse", MODERATE, "effet diurétique diminué et risque rénal"),
    Rule("fam:ains", "fam:diuretiques_thiazidiques", MODERATE, "effet antihypertenseur diminué et risque rénal"),
    Rule("fam:ains", "fam:corticoides", MODERATE, "risque d'ulcère et d'hémorragie digestive : protecteur gastrique"),
    # Cœur
    Rule("fam:digitaliques", "fam:diuretiques_anse", MAJOR, "hypokaliémie : toxicité de la digoxine (troubles du rythme)"),
    Rule("fam:digitaliques", "fam:diuretiques_thiazidiques", MAJOR, "hypokaliémie : toxicité de la digoxine"),
    Rule("quinine", "fam:neuroleptiques", MAJOR, "allongement de l'intervalle QT : risque de torsades de pointes"),
    Rule("quinine", "fam:macrolides", MODERATE, "allongement de l'intervalle QT : prudence"),
    Rule("fam:betabloquants", "fam:beta2", MAJOR, "le bêtabloquant annule l'effet du bronchodilatateur"),
    Rule("fam:betabloquants", "fam:insulines", MODERATE, "les signes d'hypoglycémie sont masqués"),
    Rule("fam:betabloquants", "fam:sulfamides_hypoglycemiants", MODERATE, "les signes d'hypoglycémie sont masqués"),
    # Efficacité diminuée
    Rule("rifampicine", "fam:contraceptifs_oraux", MAJOR, "échec de la contraception : prévoir une autre méthode"),
    Rule("carbamazepine", "fam:contraceptifs_oraux", MAJOR, "échec de la contraception : prévoir une autre méthode"),
    Rule("phenobarbital", "fam:contraceptifs_oraux", MAJOR, "échec de la contraception : prévoir une autre méthode"),
    Rule("phenytoine", "fam:contraceptifs_oraux", MAJOR, "échec de la contraception : prévoir une autre méthode"),
    Rule("rifampicine", "fam:arv", MAJOR, "concentration de l'antirétroviral diminuée : adapter le schéma"),
    Rule("rifampicine", "fam:corticoides", MODERATE, "effet du corticoïde diminué"),
    Rule("rifampicine", "fam:antifongiques_azoles", MODERATE, "effet de l'antifongique diminué"),
    Rule("fam:quinolones", "fer_acide_folique", MODERATE, "absorption de l'antibiotique très diminuée : espacer de 2 heures"),
    Rule("fam:quinolones", "calcium", MODERATE, "absorption de l'antibiotique très diminuée : espacer de 2 heures"),
    Rule("fam:cyclines", "fer_acide_folique", MODERATE, "absorption de l'antibiotique très diminuée : espacer de 2 heures"),
    Rule("fam:cyclines", "calcium", MODERATE, "absorption de l'antibiotique très diminuée : espacer de 2 heures"),
    # Toxicité
    Rule("fam:aminosides", "fam:diuretiques_anse", MAJOR, "addition de la toxicité pour l'oreille et le rein"),
    Rule("fam:aminosides", "fam:ains", MODERATE, "addition de la toxicité rénale"),
    Rule("tramadol", "fam:isrs", MAJOR, "syndrome sérotoninergique et abaissement du seuil convulsif"),
    Rule("tramadol", "fam:antidepresseurs_tricycliques", MAJOR, "convulsions et syndrome sérotoninergique"),
    Rule("fam:opioides", "fam:benzodiazepines", MAJOR, "dépression respiratoire : association à éviter"),
    Rule("fam:opioides", "fam:antihistaminiques", MODERATE, "somnolence majorée"),
    Rule("fam:benzodiazepines", "fam:antihistaminiques", MODERATE, "somnolence majorée"),
    Rule("fam:statines", "fam:macrolides", MODERATE, "risque d'atteinte musculaire (rhabdomyolyse)"),
    Rule("fam:statines", "fam:antifongiques_azoles", MODERATE, "risque d'atteinte musculaire (rhabdomyolyse)"),
    Rule("fam:neuroleptiques", "metoclopramide", MODERATE, "addition des effets extrapyramidaux"),
    Rule("isoniazide", "phenytoine", MODERATE, "toxicité de la phénytoïne augmentée"),
    Rule("isoniazide", "carbamazepine", MODERATE, "toxicité de la carbamazépine augmentée"),
    Rule("zidovudine", "cotrimoxazole", MODERATE, "addition de la toxicité pour la moelle osseuse"),
    Rule("fam:corticoides", "fam:sulfamides_hypoglycemiants", MODERATE, "le corticoïde augmente la glycémie : adapter le traitement"),
    Rule("fam:corticoides", "fam:insulines", MODERATE, "le corticoïde augmente la glycémie : adapter les doses"),
    Rule("metformine", "fam:diuretiques_anse", MODERATE, "déshydratation : risque d'acidose lactique"),
]


class StateRule(NamedTuple):
    target: str  # code de médicament ou « fam:<famille> »
    state: str  # état du patient (voir STATES)
    level: str
    reason: str


# États repérés chez le patient (alertes vitales de la fiche d'urgence, diagnostics codés, texte libre).
STATES: dict[str, str] = {
    "grossesse": "Grossesse",
    "allaitement": "Allaitement",
    "asthme": "Asthme",
    "insuffisance_renale": "Maladie rénale / dialyse",
    "insuffisance_cardiaque": "Insuffisance cardiaque",
    "hypertension": "Hypertension artérielle",
    "diabete": "Diabète",
    "epilepsie": "Épilepsie",
    "drepanocytose": "Drépanocytose",
    "g6pd": "Déficit en G6PD",
    "ulcere": "Ulcère gastro-duodénal",
    "hepatite": "Maladie du foie",
    "hemophilie": "Trouble de la coagulation",
    "anticoagulant": "Sous anticoagulant",
    "glaucome": "Glaucome",
}

CONTRAINDICATIONS: list[StateRule] = [
    # Grossesse
    StateRule("fam:iec", "grossesse", MAJOR, "atteinte rénale du fœtus : contre-indiqué pendant la grossesse (préférer la méthyldopa)"),
    StateRule("fam:ara2", "grossesse", MAJOR, "atteinte rénale du fœtus : contre-indiqué pendant la grossesse (préférer la méthyldopa)"),
    StateRule("fam:avk", "grossesse", MAJOR, "malformations et hémorragies : contre-indiqué (préférer l'héparine)"),
    StateRule("fam:ains", "grossesse", MAJOR, "formellement contre-indiqué à partir du 6e mois (atteinte rénale et cardiaque du fœtus)"),
    StateRule("fam:cyclines", "grossesse", MAJOR, "coloration des dents et atteinte osseuse du fœtus"),
    StateRule("fam:statines", "grossesse", MAJOR, "contre-indiqué pendant la grossesse"),
    StateRule("valproate", "grossesse", MAJOR, "malformations et troubles du développement : à éviter absolument chez la femme enceinte"),
    StateRule("hydroxyuree", "grossesse", MAJOR, "toxique pour le fœtus"),
    StateRule("griseofulvine", "grossesse", MAJOR, "toxique pour le fœtus"),
    StateRule("primaquine", "grossesse", MAJOR, "risque d'hémolyse chez le fœtus"),
    StateRule("misoprostol", "grossesse", MAJOR, "provoque des contractions : réservé aux indications obstétricales encadrées"),
    StateRule("carbamazepine", "grossesse", MODERATE, "risque de malformations : avis spécialisé et acide folique"),
    StateRule("phenytoine", "grossesse", MODERATE, "risque de malformations : avis spécialisé et acide folique"),
    StateRule("fam:quinolones", "grossesse", MODERATE, "atteinte du cartilage décrite chez l'animal : éviter si une autre option existe"),
    StateRule("cotrimoxazole", "grossesse", MODERATE, "à éviter au 1er trimestre et en fin de grossesse (ictère du nouveau-né)"),
    StateRule("fluconazole", "grossesse", MODERATE, "éviter les doses élevées et répétées"),
    StateRule("albendazole", "grossesse", MODERATE, "à éviter au 1er trimestre"),
    StateRule("mebendazole", "grossesse", MODERATE, "à éviter au 1er trimestre"),
    StateRule("efavirenz", "grossesse", INFO, "schéma antirétroviral à revoir avec le programme national"),
    # Allaitement
    StateRule("fam:cyclines", "allaitement", MODERATE, "passe dans le lait : à éviter"),
    StateRule("cotrimoxazole", "allaitement", MODERATE, "à éviter chez le nouveau-né et le prématuré"),
    StateRule("fam:opioides", "allaitement", MODERATE, "somnolence du nourrisson : prudence et durée courte"),
    # Asthme
    StateRule("fam:betabloquants", "asthme", MAJOR, "risque de crise d'asthme grave : contre-indiqué"),
    StateRule("fam:ains", "asthme", MODERATE, "crise d'asthme possible (asthme à l'aspirine)"),
    # Rein
    StateRule("metformine", "insuffisance_renale", MAJOR, "risque d'acidose lactique : contre-indiqué si la fonction rénale est altérée"),
    StateRule("fam:ains", "insuffisance_renale", MAJOR, "aggravation de l'insuffisance rénale"),
    StateRule("fam:aminosides", "insuffisance_renale", MAJOR, "toxicité rénale : adapter la dose et surveiller"),
    StateRule("fam:iec", "insuffisance_renale", MODERATE, "surveiller la créatinine et le potassium"),
    StateRule("fam:diuretiques_epargneurs", "insuffisance_renale", MAJOR, "risque d'hyperkaliémie grave"),
    StateRule("cotrimoxazole", "insuffisance_renale", MODERATE, "adapter la dose"),
    # Cœur, tension, diabète
    StateRule("fam:ains", "insuffisance_cardiaque", MAJOR, "rétention d'eau et de sel : décompensation"),
    StateRule("fam:ains", "hypertension", MODERATE, "élévation de la tension et effet des traitements diminué"),
    StateRule("fam:corticoides", "hypertension", MODERATE, "rétention d'eau et de sel : tension plus difficile à contrôler"),
    StateRule("fam:corticoides", "diabete", MODERATE, "augmentation de la glycémie : renforcer la surveillance"),
    # Neurologie
    StateRule("tramadol", "epilepsie", MAJOR, "abaisse le seuil convulsif"),
    StateRule("fam:quinolones", "epilepsie", MODERATE, "abaisse le seuil convulsif"),
    StateRule("chlorpromazine", "epilepsie", MODERATE, "abaisse le seuil convulsif"),
    # Déficit en G6PD (fréquent en Afrique de l'Ouest)
    StateRule("cotrimoxazole", "g6pd", MAJOR, "risque d'hémolyse aiguë"),
    StateRule("primaquine", "g6pd", MAJOR, "risque d'hémolyse aiguë : dépistage préalable"),
    StateRule("nitrofurantoine", "g6pd", MAJOR, "risque d'hémolyse aiguë"),
    StateRule("chloramphenicol", "g6pd", MODERATE, "risque d'hémolyse"),
    StateRule("sulfadoxine_pyrimethamine", "g6pd", MODERATE, "risque d'hémolyse"),
    StateRule("aspirine", "g6pd", MODERATE, "risque d'hémolyse à forte dose"),
    # Drépanocytose
    StateRule("fam:ains", "drepanocytose", MODERATE, "prudence rénale et hydratation ; privilégier le paracétamol et les opioïdes dans la crise"),
    # Digestif et foie
    StateRule("fam:ains", "ulcere", MAJOR, "risque d'hémorragie digestive"),
    StateRule("fam:corticoides", "ulcere", MODERATE, "associer un protecteur gastrique"),
    StateRule("ketoconazole", "hepatite", MAJOR, "toxicité pour le foie"),
    StateRule("paracetamol", "hepatite", MODERATE, "ne pas dépasser 3 g par jour (2 g si atteinte sévère)"),
    StateRule("isoniazide", "hepatite", MODERATE, "surveiller les transaminases"),
    StateRule("rifampicine", "hepatite", MODERATE, "surveiller les transaminases"),
    # Saignement
    StateRule("fam:ains", "hemophilie", MAJOR, "risque hémorragique majeur"),
    StateRule("fam:ains", "anticoagulant", MAJOR, "risque hémorragique : association à éviter"),
    StateRule("fam:antiagregants", "anticoagulant", MAJOR, "risque hémorragique : association à éviter"),
    # Divers
    StateRule("fam:antihistaminiques", "glaucome", MODERATE, "risque de poussée de glaucome par fermeture de l'angle"),
]


class AgeRule(NamedTuple):
    target: str
    min_years: float
    level: str
    reason: str


AGE_LIMITS: list[AgeRule] = [
    AgeRule("aspirine", 16, MAJOR, "syndrome de Reye : l'aspirine est contre-indiquée avant 16 ans en cas de fièvre virale"),
    AgeRule("fam:cyclines", 8, MAJOR, "coloration définitive des dents avant 8 ans"),
    AgeRule("codeine", 12, MAJOR, "dépression respiratoire : contre-indiqué avant 12 ans"),
    AgeRule("tramadol", 12, MAJOR, "contre-indiqué avant 12 ans"),
    AgeRule("promethazine", 2, MAJOR, "contre-indiqué avant 2 ans"),
    AgeRule("loperamide", 6, MAJOR, "contre-indiqué chez le jeune enfant (occlusion, troubles neurologiques)"),
    AgeRule("fam:quinolones", 15, MODERATE, "atteinte du cartilage de croissance : réserver aux indications sans alternative"),
    AgeRule("metoclopramide", 18, MODERATE, "troubles extrapyramidaux fréquents chez l'enfant et l'adolescent"),
]

# Au-delà de cet âge, prudence particulière (fonction rénale, chutes).
ELDERLY_YEARS = 75
ELDERLY_RULES: list[tuple[str, str, str]] = [
    ("fam:ains", MODERATE, "après 75 ans : risque rénal et digestif nettement augmenté, durée la plus courte possible"),
    ("fam:benzodiazepines", MODERATE, "après 75 ans : risque de chute et de confusion"),
    ("fam:antidepresseurs_tricycliques", MODERATE, "après 75 ans : confusion, rétention d'urine, hypotension"),
]


# ── Reconnaissance d'un médicament dans un texte ──────────────────────


def strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


def normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", strip_accents(str(text or "")).lower()).strip()


def _terms(m: Medicine) -> list[str]:
    out = [m.dci, *m.brands]
    # « Amoxicilline + acide clavulanique » : chaque partie est reconnue séparément.
    out += [part for part in re.split(r"[+/]", m.dci) if len(part.strip()) > 3]
    return out


# Terme normalisé → code de médicament (le terme le plus long gagne : « acide acetylsalicylique » avant « aspirine »).
TERM_INDEX: dict[str, str] = {}
for _m in MEDICINES:
    for _t in _terms(_m):
        TERM_INDEX.setdefault(normalize(_t), _m.code)

# Mots courants désignant une famille entière (ce qu'un patient écrit : « allergique à la pénicilline »).
FAMILY_TERMS: dict[str, str] = {
    "penicilline": "penicillines", "penicillines": "penicillines", "peni": "penicillines",
    "cephalosporine": "cephalosporines", "cephalosporines": "cephalosporines",
    "sulfamide": "sulfamides", "sulfamides": "sulfamides", "sulfa": "sulfamides",
    "macrolide": "macrolides", "macrolides": "macrolides",
    "quinolone": "quinolones", "quinolones": "quinolones", "fluoroquinolone": "quinolones",
    "cycline": "cyclines", "cyclines": "cyclines", "tetracycline": "cyclines",
    "aminoside": "aminosides", "aminosides": "aminosides",
    "ains": "ains", "anti inflammatoire": "ains", "anti inflammatoires": "ains", "antiinflammatoire": "ains",
    "salicyle": "ains", "salicyles": "ains",
    "iode": "", "latex": "",  # allergies non médicamenteuses : ignorées ici
}


def find_in_text(text: str) -> tuple[set[str], set[str]]:
    """
    Médicaments et familles cités dans un texte libre (allergies, traitements en cours).
    Renvoie (codes de médicaments, codes de familles).
    """
    norm = f" {normalize(text)} "
    codes, families = set(), set()
    if not norm.strip():
        return codes, families
    for term, code in TERM_INDEX.items():
        if term and f" {term} " in norm:
            codes.add(code)
    for term, family in FAMILY_TERMS.items():
        if family and f" {term} " in norm:
            families.add(family)
    for code in codes:
        families.add(BY_CODE[code].family)
    return codes, families


def expand(target: str) -> set[str]:
    """« fam:penicillines » → tous les codes de la famille ; « amoxicilline » → lui-même."""
    if target.startswith("fam:"):
        return {m.code for m in BY_FAMILY.get(target[4:], [])}
    return {target} if target in BY_CODE else set()


def label(target: str) -> str:
    if target.startswith("fam:"):
        return FAMILIES.get(target[4:], target[4:])
    med = BY_CODE.get(target)
    return med.dci if med else target


def catalog() -> list[dict]:
    """Catalogue envoyé au médecin (saisie assistée)."""
    return [
        {"code": m.code, "dci": m.dci, "brands": list(m.brands), "group": m.group,
         "family": m.family, "family_label": FAMILIES.get(m.family, m.family), "forms": m.forms, "essential": m.essential}
        for m in sorted(MEDICINES, key=lambda x: strip_accents(x.dci).lower())
    ]
