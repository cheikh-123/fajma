"""
Catalogue des spécialités proposées sur Fajma (installé par la migration directory 0012, sur toute base).
(slug, nom affiché, icône Lucide dessinée par src/components/SpecialtyIcon.tsx, description courte).
Le slug ne change jamais (adresses /specialites/<slug>, filtres, statistiques) ; le nom peut évoluer.
"""

CATALOG = [
    ("medecine-generale", "Médecine générale", "Stethoscope", "Consultations de premier recours pour toute la famille."),
    ("pediatrie", "Pédiatrie", "Baby", "Soins et suivi des enfants de 0 à 15 ans, vaccinations."),
    ("gynecologie", "Gynécologie-obstétrique", "Venus", "Santé de la femme, contraception, suivi de grossesse."),
    ("sage-femme", "Sage-femme", "HeartHandshake", "Consultations prénatales, accouchement, suivi après la naissance."),
    ("cardiologie", "Cardiologie", "HeartPulse", "Cœur et vaisseaux : hypertension, douleurs thoraciques, suivi cardiaque."),
    ("dermatologie", "Dermatologie", "Sparkles", "Maladies de la peau, des cheveux et des ongles : acné, eczéma, mycoses."),
    ("ophtalmologie", "Ophtalmologie", "Eye", "Examens de la vue, lunettes, glaucome, cataracte."),
    ("orl", "ORL (oreilles, nez, gorge)", "Ear", "Otites, sinusites, angines, troubles de l'audition."),
    ("neurologie", "Neurologie", "Brain", "Maux de tête, épilepsie, AVC, troubles neurologiques."),
    ("psychiatrie", "Psychiatrie", "BrainCircuit", "Dépression, anxiété, troubles psychiques : diagnostic et traitement."),
    ("psychologie", "Psychologie", "MessageCircleHeart", "Écoute, accompagnement et thérapies par la parole."),
    ("orthopedie", "Orthopédie-traumatologie", "Bone", "Fractures, articulations, dos, chirurgie des os."),
    ("rhumatologie", "Rhumatologie", "Hand", "Douleurs articulaires, arthrose, goutte, rhumatismes."),
    ("kinesitherapie", "Kinésithérapie", "PersonStanding", "Rééducation, massages, récupération après une blessure."),
    ("endocrinologie", "Endocrinologie-diabétologie", "Syringe", "Diabète, thyroïde, troubles hormonaux."),
    ("gastro-enterologie", "Gastro-entérologie", "Soup", "Estomac, intestins, foie : douleurs digestives, ulcères, hépatites."),
    ("pneumologie", "Pneumologie", "Wind", "Poumons et respiration : asthme, toux persistante, tuberculose."),
    ("nephrologie", "Néphrologie", "Bean", "Reins : insuffisance rénale, dialyse, hypertension."),
    ("urologie", "Urologie", "Droplet", "Voies urinaires et prostate."),
    ("hematologie", "Hématologie", "Droplets", "Maladies du sang : anémie, drépanocytose."),
    ("oncologie", "Oncologie", "Ribbon", "Diagnostic et traitement des cancers."),
    ("maladies-infectieuses", "Maladies infectieuses et tropicales", "Bug", "Paludisme, VIH, hépatites, infections."),
    ("medecine-interne", "Médecine interne", "Activity", "Maladies complexes touchant plusieurs organes."),
    ("geriatrie", "Gériatrie", "HandHeart", "Santé des personnes âgées."),
    ("chirurgie-generale", "Chirurgie générale", "Scissors", "Consultations avant et après une opération : hernies, vésicule, appendicite."),
    ("chirurgie-pediatrique", "Chirurgie pédiatrique", "Scissors", "Chirurgie des enfants."),
    ("neurochirurgie", "Neurochirurgie", "Brain", "Chirurgie du cerveau et de la colonne vertébrale."),
    ("chirurgie-plastique", "Chirurgie plastique et esthétique", "Wand2", "Réparation après brûlure ou blessure, chirurgie esthétique."),
    ("dentiste", "Chirurgie dentaire", "Smile", "Soins des dents : caries, détartrage, prothèses."),
    ("stomatologie", "Stomatologie", "Smile", "Bouche, mâchoires et gencives."),
    ("radiologie", "Radiologie et imagerie", "Scan", "Radiographies, échographies, scanners."),
    ("nutrition", "Nutrition et diététique", "Apple", "Alimentation, surpoids, dénutrition, régimes adaptés."),
    ("medecine-du-sport", "Médecine du sport", "Dumbbell", "Certificats, blessures et suivi des sportifs."),
    ("medecine-du-travail", "Médecine du travail", "Briefcase", "Visites d'embauche et suivi de la santé au travail."),
    ("orthophonie", "Orthophonie", "Speech", "Troubles de la parole, du langage et de la déglutition."),
    ("allergologie", "Allergologie", "Flower2", "Allergies respiratoires, alimentaires et cutanées."),
]

NAMES = [name for _, name, _, _ in CATALOG]
