// ─── CONFIGURATION OFFICIELLE DES 13 SCÉNARIOS AML (REGTOOLS / LCB-FT) ───────
// Ce fichier centralise et mémorise l'ensemble des 13 scénarios réglementaires.
// Il peut être modifié directement ou rechargé dynamiquement pour ajuster les seuils,
// règles, critères de détection et textes types de clôture / investigation / soupçon.

export const PROFESSIONS_GROUPS = {
  groupe1: {
    id: "g1",
    label: "Élève / Étudiant / Sans Profession / Travailleur indépendant",
    roles: ["Elève", "Etudiant", "élève", "étudiant", "Sans Profession", "sans profession", "Travailleur indépendants", "Travailleur indépendant", "travailleur indépendant", "travailleur independant"]
  },
  groupe2: {
    id: "g2",
    label: "Salarié / Fonctionnaire",
    roles: ["Salarié", "salarié", "salarie", "Fonctionnaire", "fonctionnaire"]
  },
  groupe3: {
    id: "g3",
    label: "Retraité",
    roles: ["Retraité", "retraité", "retraite"]
  },
  groupe4: {
    id: "g4",
    label: "Chef d'Entreprise / Profession Libérale / Travailleur indépendant",
    roles: ["Chef d'Entreprise", "Chef d'entreprise", "chef d'entreprise", "chef dentreprise", "Profession Libérale", "Profession libérale", "profession libérale", "profession liberale", "PM", "pm", "Travailleur indépendants", "Travailleur indépendant"]
  }
};

export const PAYS_RISQUE_ELEVE = [
  "Myanmar", "Cameroun", "République démocratique du Congo", "Croatie", "Haïti", "Iran",
  "Kenya", "Corée du Nord", "Monaco", "Namibie", "Viêt Nam", "Sud-Soudan", "Syrie",
  "Venezuela", "Yémen", "Liban", "Laos", "Algérie", "Bolivie", "Angola", "Népal",
  "Côte d'Ivoire", "Afghanistan", "Iles Vierges américaines", "Soudan", "Israël",
  "Russie", "Pakistan", "Niger", "Nigeria", "Mozambique", "Mali", "Koweït",
  "Papouasie-Nouvelle-Guinée"
];

/**
 * 13 Scénarios réglementaires officiels
 */
export const AML_SCENARIOS = [
  {
    id: 1,
    code: "SCEN_01",
    description: "Somme des capitaux assuré supérieur à (non vie)",
    branche: "Non-Vie",
    source_system: "Auto/Irds",
    gravite: "haute",
    declencheur: {
      operateur: "AND",
      conditions: [
        { key: "source_system", op: "equals", value: "Auto/Irds" }
      ]
    },
    champCible: "max_cap",
    unite: "TND",
    sousRegles: [
      { id: 1, groupe: "groupe1", risqueEleve: false, seuilMillimes: 50000000, seuilDT: 50000, label: "G1 (Élève/Étudiant/Sans prof/Indép) - Risque Normal/Modéré" },
      { id: 2, groupe: "groupe1", risqueEleve: true, seuilMillimes: 30000000, seuilDT: 30000, label: "G1 (Élève/Étudiant/Sans prof/Indép) - Risque Élevé" },
      { id: 3, groupe: "groupe2", risqueEleve: false, seuilMillimes: 150000000, seuilDT: 150000, label: "G2 (Salarié/Fonctionnaire) - Risque Normal/Modéré" },
      { id: 4, groupe: "groupe2", risqueEleve: true, seuilMillimes: 80000000, seuilDT: 80000, label: "G2 (Salarié/Fonctionnaire) - Risque Élevé" },
      { id: 5, groupe: "groupe3", risqueEleve: false, seuilMillimes: 200000000, seuilDT: 200000, label: "G3 (Retraité) - Risque Normal/Modéré" },
      { id: 6, groupe: "groupe3", risqueEleve: true, seuilMillimes: 160000000, seuilDT: 160000, label: "G3 (Retraité) - Risque Élevé" },
      { id: 7, groupe: "groupe4", risqueEleve: false, seuilMillimes: 500000000, seuilDT: 500000, label: "G4 (Chef d'ent./Prof. lib.) - Risque Normal/Modéré" },
      { id: 8, groupe: "groupe4", risqueEleve: true, seuilMillimes: 200000000, seuilDT: 200000, label: "G4 (Chef d'ent./Prof. lib.) - Risque Élevé" },
    ],
    motifClotureTemplate: (data, rule) =>
      `Capitaux garantis (${data.valeurFmt}) conformes à la valeur vénale du bien/véhicule déclaré (${data.valeurBienFmt || 'justifiée sur facture/expertise'}). Profil client vérifié (${data.profession}), solvabilité avérée et adéquation du risque sans anomalie LCB-FT. Clôture sans suite.`,
    noteInvestigationTemplate: (data, rule) =>
      `1. DÉCLENCHEUR : Somme des capitaux assurés Non-Vie (${data.valeurFmt}) excédant le seuil réglementaire de ${rule.seuilDT.toLocaleString('fr-TN')} DT pour la catégorie ${rule.label}.\n2. ANALYSE KYC : Sociétaire ${data.nom} (${data.profession}), risque ${data.risque}.\n3. POINTS DE CONTRÔLE : Contrôle de la réalité du bien assuré, cohérence de la facture d'achat ou du rapport d'expert. Justification requise auprès de l'agence de souscription.`
  },
  {
    id: 2,
    code: "SCEN_02",
    description: "Souscription d'un contrat dont la prime est supérieure à (non vie)",
    branche: "Non-Vie",
    source_system: "Auto/Irds",
    gravite: "haute",
    declencheur: {
      operateur: "AND",
      conditions: [
        { key: "source_system", op: "equals", value: "Auto/Irds" }
      ]
    },
    champCible: "PRIME_ENCAIS",
    unite: "TND",
    sousRegles: [
      { id: 1, groupe: "groupe1", risqueEleve: false, seuilMillimes: 1000000, seuilDT: 1000, label: "G1 - Risque Normal/Modéré" },
      { id: 2, groupe: "groupe1", risqueEleve: true, seuilMillimes: 400000, seuilDT: 400, label: "G1 - Risque Élevé" },
      { id: 3, groupe: "groupe2", risqueEleve: false, seuilMillimes: 2500000, seuilDT: 2500, label: "G2 - Risque Normal/Modéré" },
      { id: 4, groupe: "groupe2", risqueEleve: true, seuilMillimes: 1000000, seuilDT: 1000, label: "G2 - Risque Élevé" },
      { id: 5, groupe: "groupe3", risqueEleve: false, seuilMillimes: 3000000, seuilDT: 3000, label: "G3 - Risque Normal/Modéré" },
      { id: 6, groupe: "groupe3", risqueEleve: true, seuilMillimes: 2000000, seuilDT: 2000, label: "G3 - Risque Élevé" },
      { id: 7, groupe: "groupe4", risqueEleve: false, seuilMillimes: 6000000, seuilDT: 6000, label: "G4 - Risque Normal/Modéré" },
      { id: 8, groupe: "groupe4", risqueEleve: true, seuilMillimes: 3000000, seuilDT: 3000, label: "G4 - Risque Élevé" },
    ],
    motifClotureTemplate: (data, rule) =>
      `Prime émise de ${data.valeurFmt} strictement conforme au tarif d'usage et barème technique (garanties souscrites). Mode de règlement bancaire ou justifié, capacité financière du souscripteur (${data.profession}) proportionnée. Levée de doute confirmée.`,
    noteInvestigationTemplate: (data, rule) =>
      `1. DÉCLENCHEUR : Prime Non-Vie de ${data.valeurFmt} excédant le seuil de ${rule.seuilDT.toLocaleString('fr-TN')} DT.\n2. ANALYSE : Cohérence des revenus déclarés avec le paiement de la prime. Vérification du mode d'encaissement et des antécédents de quittances impayées.`
  },
  {
    id: 3,
    code: "SCEN_03",
    description: "Rachat d'un contrat d'assurance vie ou capitalisation",
    branche: "Vie",
    source_system: "vie decaissement",
    gravite: "haute",
    declencheur: {
      operateur: "AND",
      conditions: [
        { key: "source_system", op: "contains", value: "vie decaissement" },
        { key: "modification_type", op: "contains", value: "rachat" }
      ]
    },
    champCible: "capital",
    unite: "TND",
    sousRegles: [
      { id: 1, groupe: "groupe1", risqueEleve: false, seuilMillimes: 20000000, seuilDT: 20000, label: "G1 - Risque Normal/Modéré" },
      { id: 2, groupe: "groupe1", risqueEleve: true, seuilMillimes: 10000000, seuilDT: 10000, label: "G1 - Risque Élevé" },
      { id: 3, groupe: "groupe2", risqueEleve: false, seuilMillimes: 30000000, seuilDT: 30000, label: "G2 - Risque Normal/Modéré" },
      { id: 4, groupe: "groupe2", risqueEleve: true, seuilMillimes: 15000000, seuilDT: 150000, label: "G2 - Risque Élevé" },
      { id: 5, groupe: "groupe3", risqueEleve: false, seuilMillimes: 50000000, seuilDT: 50000, label: "G3 - Risque Normal/Modéré" },
      { id: 6, groupe: "groupe3", risqueEleve: true, seuilMillimes: 30000000, seuilDT: 30000, label: "G3 - Risque Élevé" },
      { id: 7, groupe: "groupe4", risqueEleve: false, seuilMillimes: 100000000, seuilDT: 100000, label: "G4 - Risque Normal/Modéré" },
      { id: 8, groupe: "groupe4", risqueEleve: true, seuilMillimes: 50000000, seuilDT: 50000, label: "G4 - Risque Élevé" },
    ],
    motifClotureTemplate: (data, rule) =>
      `Demande de rachat de ${data.valeurFmt} sur contrat épargne vie avec antériorité d'épargne avérée. Virement effectué sur le compte bancaire propre du sociétaire, origine des primes initiales tracée. Clôture sans suite.`,
    noteInvestigationTemplate: (data, rule) =>
      `1. DÉCLENCHEUR : Rachat sur contrat d'assurance vie de ${data.valeurFmt} supérieur au seuil de ${rule.seuilDT.toLocaleString('fr-TN')} DT.\n2. ANALYSE : Ancienneté du contrat, motif du rachat (besoin de trésorerie, acquisition), vérification du RIB bénéficiaire et historique des primes versées.`
  },
  {
    id: 4,
    code: "SCEN_04",
    description: "Souscription d'un contrat par un client ressortissant d'un pays sur la liste du GAFI",
    branche: "Tous",
    source_system: "Tous",
    gravite: "critique",
    declencheur: {
      operateur: "OR",
      conditions: [
        { key: "riskFactors", op: "equals", value: "Risque Elevé", riskfactorId: "67a3758d951558001cf2e82c" },
        { key: "pays", op: "in", value: PAYS_RISQUE_ELEVE }
      ]
    },
    champCible: "pays",
    unite: "Pays",
    sousRegles: [
      { id: 1, label: "Ressortissant ou résident d'un pays sous surveillance renforcée / liste noire du GAFI", seuilDT: 0 }
    ],
    motifClotureTemplate: (data) =>
      `Client ressortissant/lié à ${data.pays || 'un pays à vigilance renforcée'}, mais résidence fiscale et activité économique établie en Tunisie de longue date. Vérification des sanctions internationales négative (gel des avoirs CNLCT / ONU vierge). Opération ordinaire justifiée.`,
    noteInvestigationTemplate: (data) =>
      `1. DÉCLENCHEUR : Alerte critique GAFI / Pays à haut risque (${data.pays}).\n2. DILIGENCES RENFORCÉES REQUISES : Application de l'article 20 du règlement CGA n°2019-02 (Vigilance accrue). Vérification de l'ayant droit économique, de l'origine licite des fonds et de l'absence de statut PEP / PPE.`
  },
  {
    id: 5,
    code: "SCEN_05",
    description: "Augmentation de la valeur des capitaux assurés",
    branche: "Vie",
    source_system: "vie encaissement",
    gravite: "haute",
    declencheur: {
      operateur: "AND",
      conditions: [
        { key: "modification_type", op: "contains", value: "Avenant de modification de capitaux" },
        { key: "source_system", op: "equals", value: "vie encaissement" }
      ]
    },
    champCible: "capital",
    unite: "Ratio",
    sousRegles: [
      { id: 1, risqueEleve: false, multiplicateur: 2, label: "Ratio capital > 2x Capital précédent (Risque Normal/Modéré)" },
      { id: 2, risqueEleve: true, multiplicateur: 1.25, label: "Ratio capital > 1.25x Capital précédent (Risque Élevé)" }
    ],
    motifClotureTemplate: (data, rule) =>
      `Avenant d'augmentation de capitaux (${data.valeurFmt}) motivé par l'évolution de la situation patrimoniale ou professionnelle (${data.profession}). Justificatifs d'épargne conformes, aucun versement atypique. Clôture de l'alerte.`,
    noteInvestigationTemplate: (data, rule) =>
      `1. DÉCLENCHEUR : Augmentation substantielle de capitaux (ratio > x${rule.multiplicateur}).\n2. CONTRÔLE : Vérifier la provenance des nouveaux capitaux injectés et l'absence de structuration ou de dissimulation de plus-values illicites.`
  },
  {
    id: 6,
    code: "SCEN_06",
    description: "Rachat total ou partiel d'un contrat d'assurance vie ou capitalisation (précoce < 90 jours)",
    branche: "Vie",
    source_system: "vie decaissement",
    gravite: "critique",
    declencheur: {
      operateur: "AND",
      conditions: [
        { key: "modification_type", op: "contains", value: "RACHAT TOTAL" },
        { key: "source_system", op: "equals", value: "vie decaissement" }
      ]
    },
    champCible: "delai_jours",
    unite: "Jours",
    sousRegles: [
      { id: 1, seuilJours: 90, label: "Délai entre date de souscription et date de rachat < 90 jours" }
    ],
    motifClotureTemplate: (data) =>
      `Rachat précoce demandé (${data.delai_jours || '< 90'} jours) motivé par un événement de force majeure documenté (licenciement, sinistre personnel, besoin impérieux de liquidité). Remboursement sur compte émetteur d'origine, pénalités de rachat appliquées.`,
    noteInvestigationTemplate: (data) =>
      `1. DÉCLENCHEUR : Rachat total intervenu moins de 90 jours après la souscription (Typologie classique de blanchiment : placement puis retrait immédiat).\n2. INVESTIGATION : Exiger les justificatifs précis du motif de désengagement rapide et tracer l'historique complet des versements initiaux.`
  },
  {
    id: 7,
    code: "SCEN_07",
    description: "Le changement fréquent du bénéficiaire pour les contrats vie et capitalisation",
    branche: "Vie",
    source_system: "vie encaissement",
    gravite: "moyenne",
    declencheur: {
      operateur: "AND",
      conditions: [
        { key: "source_system", op: "contains", value: "vie encaissement" },
        { key: "modification_type", op: "isAnyOf", value: ["CHANGEMENT DE BENEFICIAIRE", "CHANGEMENT DU BENEFICIAIRE"] }
      ]
    },
    champCible: "kpi_nb_changements",
    unite: "Modifications",
    sousRegles: [
      { id: 1, kpiName: "count_contract_last_modification_dateeqDatedencaissement_gt3", seuilCount: 3, label: "Plus de 3 modifications de bénéficiaire (KPI > 3)" }
    ],
    motifClotureTemplate: (data) =>
      `Modifications successives de la clause bénéficiaire expliquées par des mutations familiales documentées (mariage, naissance, mise à jour des ayants droit). Lien de parenté vérifié, levée de doute opérée.`,
    noteInvestigationTemplate: (data) =>
      `1. DÉCLENCHEUR : Changements répétés de bénéficiaires (> 3 fois).\n2. MOTIF DE SUSPICION : Risque de transmission occulte de capitaux à des tiers non apparentés ou prête-noms.\n3. CONTRÔLE : Obtenir l'arbre généalogique et l'acte d'état civil justifiant chaque désignation.`
  },
  {
    id: 8,
    code: "SCEN_08",
    description: "Le capital assuré du contrat multirisques habitation est incohérent avec le profil client",
    branche: "Non-Vie",
    source_system: "auto",
    gravite: "haute",
    declencheur: {
      operateur: "AND",
      conditions: [
        { key: "source_system", op: "contains", value: "auto" }
      ]
    },
    champCible: "max_cap",
    unite: "TND",
    sousRegles: [
      { id: 1, groupe: "groupe1", seuilMillimes: 400000000, seuilDT: 400000, label: "G1 (Élève/Étudiant/Sans prof/Indép) : Capital > 400 000 DT" },
      { id: 2, groupe: "groupe2", seuilMillimes: 800000000, seuilDT: 800000, label: "G2 (Salarié/Fonctionnaire) : Capital > 800 000 DT" },
      { id: 3, groupe: "groupe4", seuilMillimes: 1000000000, seuilDT: 1000000, label: "G4 (Chef d'entreprise / Prof libérale) : Capital > 1 000 000 DT" }
    ],
    motifClotureTemplate: (data, rule) =>
      `Capital garanti multirisques habitation de ${data.valeurFmt} en adéquation avec la valeur vénale et d'expertise du bien immobilier (titre de propriété et métrage vérifiés). Revenus du foyer ou patrimoine familial cohérent. Clôture.`,
    noteInvestigationTemplate: (data, rule) =>
      `1. DÉCLENCHEUR : Capital garanti multirisque (${data.valeurFmt}) disproportionné par rapport au statut professionnel (${data.profession}).\n2. VÉRIFICATIONS : Exiger le titre de propriété, le contrat d'acquisition ou l'expertise immobilière pour valider la réalité du bien.`
  },
  {
    id: 9,
    code: "SCEN_09",
    description: "Souscription multiples de contrats vie ou capitalisation en vigueur pour un court délai",
    branche: "Vie",
    source_system: "vie encaissement",
    gravite: "moyenne",
    declencheur: {
      operateur: "AND",
      conditions: [
        { key: "source_system", op: "equals", value: "vie encaissement" }
      ]
    },
    champCible: "nb_contrats_3ans",
    unite: "Contrats",
    sousRegles: [
      { id: 1, seuilDureeAnnees: 3, seuilContrats: 3, label: "Souscription de multiples contrats de vie (≥ 3 contrats) dans un délai ≤ 3 ans" }
    ],
    motifClotureTemplate: (data) =>
      `Multiplicité de souscriptions vie répondant à une stratégie d'épargne segmentée (objectifs distincts : études enfants, retraite, projet personnel). Capacité d'épargne globale vérifiée et conforme aux déclarations fiscales.`,
    noteInvestigationTemplate: (data) =>
      `1. DÉCLENCHEUR : Multiplication des contrats vie sur une courte période (< 3 ans).\n2. MOTIF DE SUSPICION : Risque de fractionnement et d'émiettement de fonds pour contourner les seuils déclaratifs.\n3. CONTRÔLE : Calculer le cumul total des primes sur l'ensemble des polices actives.`
  },
  {
    id: 10,
    code: "SCEN_10",
    description: "Paiement en espèce",
    branche: "Tous",
    source_system: "auto/irds, vie encaissement",
    gravite: "critique",
    declencheur: {
      operateur: "OR",
      conditions: [
        { key: "source_system", op: "contains", value: "auto/irds" },
        { key: "source_system", op: "equals", value: "vie encaissement" }
      ]
    },
    champCible: "amount",
    unite: "TND",
    sousRegles: [
      {
        id: 1,
        seuilMillimes: 5000000,
        seuilDT: 5000,
        modesEspeces: ["ESPECE", "ESPEC", "1", 1],
        label: "Montant > 5 000 DT (5 000 000 millimes) ET (MODE_PAIEMENT = ESPECE OU M = 1)"
      }
    ],
    motifClotureTemplate: (data) =>
      `Règlement de prime au comptant (${data.valeurFmt}) pour une activité (${data.profession}) générant légitimement des flux de trésorerie usuels. Absence de fractionnement suspect, montant en adéquation avec la valeur du risque assuré (${data.valeurBienFmt || 'véhicule/bien'}). Dossier régularisé sans suite.`,
    noteInvestigationTemplate: (data) =>
      `1. DÉCLENCHEUR CRITIQUE : Paiement en liquidités de ${data.valeurFmt} dépassant le seuil légal de 5 000 DT (Article 13 de la Loi 2015-26 & Règlement CGA n°2019-02).\n2. CONTRÔLE RÉGLEMENTAIRE : Demander sans délai la justification de provenance des espèces (bordereau de retrait bancaire, acte de vente) et vérifier pourquoi le paiement n'a pas transité par chèque ou virement.`
  },
  {
    id: 11,
    code: "SCEN_11",
    description: "Somme des capitaux assuré supérieur à (vie)",
    branche: "Vie",
    source_system: "vie",
    gravite: "haute",
    declencheur: {
      operateur: "AND",
      conditions: [
        { key: "source_system", op: "contains", value: "vie" }
      ]
    },
    champCible: "Capital_fin_contrat",
    unite: "TND",
    sousRegles: [
      { id: 1, groupe: "groupe1", risqueEleve: false, seuilMillimes: 50000000, seuilDT: 50000, label: "G1 (Élève/Étudiant/Sans prof/Indép) - Risque Normal/Modéré" },
      { id: 2, groupe: "groupe1", risqueEleve: true, seuilMillimes: 30000000, seuilDT: 30000, label: "G1 (Élève/Étudiant/Sans prof/Indép) - Risque Élevé" },
      { id: 3, groupe: "groupe2", risqueEleve: false, seuilMillimes: 150000000, seuilDT: 150000, label: "G2 (Salarié/Fonctionnaire) - Risque Normal/Modéré" },
      { id: 4, groupe: "groupe2", risqueEleve: true, seuilMillimes: 80000000, seuilDT: 80000, label: "G2 (Salarié/Fonctionnaire) - Risque Élevé" },
      { id: 5, groupe: "groupe3", risqueEleve: false, seuilMillimes: 200000000, seuilDT: 200000, label: "G3 (Retraité) - Risque Normal/Modéré" },
      { id: 6, groupe: "groupe3", risqueEleve: true, seuilMillimes: 160000000, seuilDT: 160000, label: "G3 (Retraité) - Risque Élevé" },
      { id: 7, groupe: "groupe4", risqueEleve: false, seuilMillimes: 500000000, seuilDT: 500000, label: "G4 (Chef d'ent./Prof. lib.) - Risque Normal/Modéré" },
      { id: 8, groupe: "groupe4", risqueEleve: true, seuilMillimes: 200000000, seuilDT: 200000, label: "G4 (Chef d'ent./Prof. lib.) - Risque Élevé" },
    ],
    motifClotureTemplate: (data, rule) =>
      `Capital au terme de ${data.valeurFmt} sur contrat vie en parfaite adéquation avec la stratégie de transmission et les revenus de l'adhérent (${data.profession}). Origine des fonds tracée, clôture sans suite.`,
    noteInvestigationTemplate: (data, rule) =>
      `1. DÉCLENCHEUR : Capital en fin de contrat vie de ${data.valeurFmt} supérieur au seuil de ${rule.seuilDT.toLocaleString('fr-TN')} DT.\n2. ANALYSE : Vérification de la solvabilité de l'adhérent et de la clause bénéficiaire.`
  },
  {
    id: 12,
    code: "SCEN_12",
    description: "Souscription d'un contrat dont la prime est supérieure à (vie)",
    branche: "Vie",
    source_system: "vie",
    gravite: "haute",
    declencheur: {
      operateur: "AND",
      conditions: [
        { key: "source_system", op: "contains", value: "vie" }
      ]
    },
    champCible: "montant total des primes versees",
    unite: "TND",
    sousRegles: [
      { id: 1, groupe: "groupe1", risqueEleve: false, seuilMillimes: 1000000, seuilDT: 1000, label: "G1 - Risque Normal/Modéré" },
      { id: 2, groupe: "groupe1", risqueEleve: true, seuilMillimes: 400000, seuilDT: 400, label: "G1 - Risque Élevé" },
      { id: 3, groupe: "groupe2", risqueEleve: false, seuilMillimes: 2500000, seuilDT: 2500, label: "G2 - Risque Normal/Modéré" },
      { id: 4, groupe: "groupe2", risqueEleve: true, seuilMillimes: 1000000, seuilDT: 1000, label: "G2 - Risque Élevé" },
      { id: 5, groupe: "groupe3", risqueEleve: false, seuilMillimes: 3000000, seuilDT: 3000, label: "G3 - Risque Normal/Modéré" },
      { id: 6, groupe: "groupe3", risqueEleve: true, seuilMillimes: 2000000, seuilDT: 2000, label: "G3 - Risque Élevé" },
      { id: 7, groupe: "groupe4", risqueEleve: false, seuilMillimes: 6000000, seuilDT: 6000, label: "G4 - Risque Normal/Modéré" },
      { id: 8, groupe: "groupe4", risqueEleve: true, seuilMillimes: 3000000, seuilDT: 3000, label: "G4 - Risque Élevé" },
    ],
    motifClotureTemplate: (data, rule) =>
      `Primes cumulées versées sur le contrat vie (${data.valeurFmt}) en adéquation avec les flux déclarés et l'historique bancaire de ${data.nom} (${data.profession}). Levée de doute validée.`,
    noteInvestigationTemplate: (data, rule) =>
      `1. DÉCLENCHEUR : Primes versées en assurance vie (${data.valeurFmt}) excédant le seuil de ${rule.seuilDT.toLocaleString('fr-TN')} DT.\n2. VÉRIFICATION : Adéquation des versements avec l'avis d'imposition ou les états financiers.`
  },
  {
    id: 13,
    code: "SCEN_13",
    description: "Avance contrat d'assurance vie ou capitalisation",
    branche: "Vie",
    source_system: "vie decaissement",
    gravite: "haute",
    declencheur: {
      operateur: "AND",
      conditions: [
        { key: "source_system", op: "equals", value: "vie decaissement" },
        { key: "modification_type", op: "contains", value: "avance" }
      ]
    },
    champCible: "montant prestation/décaissement",
    unite: "TND / Conditions",
    sousRegles: [
      {
        id: 1,
        operateur: "OR",
        conditions: [
          { type: "kpi", name: "count_contract_avance_gt2_L12M", label: "Plus de 2 avances sur les 12 derniers mois (KPI > 2)" },
          { type: "ratio", ratio: 0.8, base: "Montant total des primes versees", label: "Montant de l'avance > 80% des primes versées" },
          { type: "date", seuilMois: 6, label: "Avance demandée moins de 6 mois après la souscription" }
        ],
        label: "Avances répétées (> 2 sur 12 mois) OU montant > 80% des primes OU avance précoce < 6 mois"
      }
    ],
    motifClotureTemplate: (data) =>
      `Avance sur police d'assurance vie (${data.valeurFmt}) souscrite sous convention d'avance légale avec taux d'intérêt réglementaire. Motif de trésorerie ponctuel justifié, remboursement prévu, sociétaire de premier ordre. Clôture de l'alerte.`,
    noteInvestigationTemplate: (data) =>
      `1. DÉCLENCHEUR : Demande d'avance substantielle ou répétée sur contrat vie.\n2. RISQUE LCB-FT : L'avance peut être utilisée pour recycler des fonds sans liquider formellement le contrat (prêt déguisé).\n3. DILIGENCES : Vérifier le compte bancaire créditeur de l'avance et la régularité des remboursements antérieurs.`
  }
];

export default AML_SCENARIOS;
