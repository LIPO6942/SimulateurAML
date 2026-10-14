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
      `Contrat ${data.produit} : capitaux garantis (${data.valeurFmt}) conformes à la valeur vénale déclarée (${data.valeurBienFmt || 'justifiée sur dossier'}). Profil client (${data.profession}) et solvabilité vérifiés sans anomalie LCB-FT. Clôture sans suite.`,
    noteInvestigationTemplate: (data, rule) =>
      `1. OBJET DU CONTRÔLE & PRODUIT : Examen sur le contrat ${data.libelleProduit || data.produit} (Police n°${data.police}, Agence ${data.agence}).\n2. DÉCLENCHEUR : Somme des capitaux assurés Non-Vie (${data.valeurFmt}) excédant le seuil de ${rule.seuilDT.toLocaleString('fr-TN')} DT pour la catégorie ${rule.label}.\n3. ANALYSE KYC : Sociétaire ${data.nom} (${data.profession}), risque ${data.risque}.\n4. POINTS DE CONTRÔLE : Contrôle de la réalité du bien assuré et adéquation des garanties au titre du produit ${data.produit}. Aucune anomalie LCB-FT.`
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
      `Contrat ${data.produit} : prime émise (${data.valeurFmt}) conforme au tarif technique des garanties souscrites. Profil client (${data.profession}) et capacité financière vérifiés. Clôture sans suite.`,
    noteInvestigationTemplate: (data, rule) =>
      `1. OBJET DU CONTRÔLE & PRODUIT : Quittance émise sur le contrat ${data.libelleProduit || data.produit} (Police n°${data.police}, Agence ${data.agence}).\n2. DÉCLENCHEUR : Prime Non-Vie de ${data.valeurFmt} excédant le seuil de ${rule.seuilDT.toLocaleString('fr-TN')} DT.\n3. ANALYSE KYC : Cohérence des revenus déclarés (${data.profession}) avec le paiement de la prime pour le produit ${data.produit}. Mode d'encaissement régulier.`
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
      `Contrat ${data.produit} : rachat de ${data.valeurFmt} avec antériorité d'épargne avérée. Virement bancaire sur compte propre de ${data.nom}. Clôture sans suite.`,
    noteInvestigationTemplate: (data, rule) =>
      `1. OBJET DU CONTRÔLE & PRODUIT : Rachat sur contrat d'assurance vie ${data.libelleProduit || data.produit} (Police n°${data.police}, Agence ${data.agence}).\n2. DÉCLENCHEUR : Rachat de ${data.valeurFmt} supérieur au seuil de ${rule.seuilDT.toLocaleString('fr-TN')} DT.\n3. ANALYSE KYC : Ancienneté du contrat, motif du rachat, RIB bénéficiaire vérifié et traçabilité des primes de ${data.produit}.`
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
      `Contrat ${data.produit} : sociétaire lié à ${data.pays || 'pays sous vigilance'}, avec résidence fiscale et activité économique établies en Tunisie. Criblage sanctions négatif. Clôture sans suite.`,
    noteInvestigationTemplate: (data) =>
      `1. OBJET DU CONTRÔLE & PRODUIT : Souscription du produit ${data.libelleProduit || data.produit} (Police n°${data.police}, Agence ${data.agence}).\n2. DÉCLENCHEUR : Alerte GAFI / Pays à haut risque (${data.pays}).\n3. DILIGENCES RENFORCÉES : Application article 20 règlement CGA n°2019-02. Ayant droit économique vérifié, absence de statut PEP/PPE, criblage listes sanctions gel des avoirs négatif pour le contrat ${data.produit}.`
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
      `Contrat ${data.produit} : augmentation de capitaux (${data.valeurFmt}) motivée par l'évolution patrimoniale de ${data.nom} (${data.profession}). Justificatifs d'épargne conformes. Clôture sans suite.`,
    noteInvestigationTemplate: (data, rule) =>
      `1. OBJET DU CONTRÔLE & PRODUIT : Avenant de capitaux sur le contrat ${data.libelleProduit || data.produit} (Police n°${data.police}).\n2. DÉCLENCHEUR : Augmentation substantielle de capitaux (ratio > x${rule.multiplicateur}).\n3. CONTRÔLE : Provenance des nouveaux capitaux injectés sur le produit ${data.produit} et absence d'anomalie LCB-FT.`
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
      `Contrat ${data.produit} : rachat précoce (${data.delai_jours || '< 90'} jours) motivé par un besoin urgent de liquidité documenté. Remboursement sur compte émetteur d'origine. Clôture sans suite.`,
    noteInvestigationTemplate: (data) =>
      `1. OBJET DU CONTRÔLE & PRODUIT : Rachat précoce sur contrat ${data.libelleProduit || data.produit} (Police n°${data.police}).\n2. DÉCLENCHEUR : Rachat total intervenu ${data.delai_jours || '< 90'} jours après souscription.\n3. INVESTIGATION : Justificatifs du motif de désengagement rapide sur le produit ${data.produit} et traçabilité des versements initiaux.`
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
      `Contrat ${data.produit} : changement de bénéficiaire justifié par mutation familiale documentée (état civil vérifié). Clôture sans suite.`,
    noteInvestigationTemplate: (data) =>
      `1. OBJET DU CONTRÔLE & PRODUIT : Clause bénéficiaire du contrat ${data.libelleProduit || data.produit} (Police n°${data.police}).\n2. DÉCLENCHEUR : Changements successifs de bénéficiaire (> 3).\n3. CONTRÔLE : Examen des actes d'état civil justifiant chaque désignation au titre du produit ${data.produit}.`
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
      `Contrat ${data.produit} : capital garanti (${data.valeurFmt}) en adéquation avec la valeur vénale du bien immobilier (titre de propriété vérifié). Revenus du souscripteur (${data.profession}) cohérents. Clôture sans suite.`,
    noteInvestigationTemplate: (data, rule) =>
      `1. OBJET DU CONTRÔLE & PRODUIT : Contrat multirisque habitation ${data.libelleProduit || data.produit} (Police n°${data.police}, Agence ${data.agence}).\n2. DÉCLENCHEUR : Capital garanti (${data.valeurFmt}) supérieur au seuil de ${rule.seuilDT.toLocaleString('fr-TN')} DT.\n3. CONTRÔLE : Titre de propriété et cohérence de l'expertise pour le logement couvert par le produit ${data.produit}.`
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
      `Souscriptions multiples en ${data.produit} justifiées par une stratégie d'épargne segmentée (projets familiaux distincts). Solvabilité globale de ${data.nom} vérifiée. Clôture sans suite.`,
    noteInvestigationTemplate: (data) =>
      `1. OBJET DU CONTRÔLE & PRODUIT : Polices multiples souscrites en ${data.libelleProduit || data.produit} (≥ 3 contrats sur 3 ans).\n2. DÉCLENCHEUR : Multiplication des souscriptions vie sur court délai.\n3. CONTRÔLE : Cumul des primes et adéquation avec les capacités d'épargne réelles du sociétaire pour ${data.produit}.`
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
      `Contrat ${data.produit} : règlement en espèces (${data.valeurFmt}) cohérent avec l'activité déclarée (${data.profession}) et la valeur du risque. Absence de fractionnement suspect. Clôture sans suite.`,
    noteInvestigationTemplate: (data) =>
      `1. OBJET DU CONTRÔLE & PRODUIT : Encaissement au comptant sur contrat ${data.libelleProduit || data.produit} (Police n°${data.police}, Agence ${data.agence}).\n2. DÉCLENCHEUR : Paiement en liquidités de ${data.valeurFmt} (seuil légal 5 000 DT - Loi 2015-26).\n3. CONTRÔLE : Justification des espèces, cohérence avec la profession ${data.profession} et proportionnalité de la prime pour le produit ${data.produit}.`
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
      `Contrat ${data.produit} : capital au terme (${data.valeurFmt}) proportionné aux revenus de ${data.nom} (${data.profession}) et à l'objectif d'épargne/retraite. Clôture sans suite.`,
    noteInvestigationTemplate: (data, rule) =>
      `1. OBJET DU CONTRÔLE & PRODUIT : Capitalisation / Épargne ${data.libelleProduit || data.produit} (Police n°${data.police}).\n2. DÉCLENCHEUR : Capital en fin de contrat de ${data.valeurFmt} supérieur au seuil de ${rule.seuilDT.toLocaleString('fr-TN')} DT.\n3. ANALYSE : Solvabilité de l'adhérent et conformité de la clause bénéficiaire sur le contrat ${data.produit}.`
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
      `Contrat ${data.produit} : primes cumulées versées (${data.valeurFmt}) proportionnées aux flux financiers et à l'activité de ${data.nom} (${data.profession}). Clôture sans suite.`,
    noteInvestigationTemplate: (data, rule) =>
      `1. OBJET DU CONTRÔLE & PRODUIT : Primes versées sur contrat ${data.libelleProduit || data.produit} (Police n°${data.police}).\n2. DÉCLENCHEUR : Primes cumulées de ${data.valeurFmt} excédant le seuil de ${rule.seuilDT.toLocaleString('fr-TN')} DT.\n3. CONTRÔLE : Adéquation des versements avec les justificatifs de revenus pour le produit ${data.produit}.`
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
      `Contrat ${data.produit} : avance de ${data.valeurFmt} conforme aux dispositions contractuelles. Besoin de trésorerie ponctuel justifié, sociétaire régulier. Clôture sans suite.`,
    noteInvestigationTemplate: (data) =>
      `1. OBJET DU CONTRÔLE & PRODUIT : Demande d'avance sur contrat ${data.libelleProduit || data.produit} (Police n°${data.police}).\n2. DÉCLENCHEUR : Avance de ${data.valeurFmt} sur contrat vie.\n3. CONTRÔLE : Respect des critères d'avance sur ${data.produit} et régularité des flux antérieurs.`
  }
];

export default AML_SCENARIOS;
