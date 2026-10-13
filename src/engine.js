// ─── MOTEUR DE DÉTECTION & DÉCISION LCB-FT — 13 SCÉNARIOS RÉGLEMENTAIRES ────────
import { AML_SCENARIOS, PROFESSIONS_GROUPS, PAYS_RISQUE_ELEVE } from './scenariosConfig.js';

export { AML_SCENARIOS, PROFESSIONS_GROUPS, PAYS_RISQUE_ELEVE };

/**
 * Détermine le groupe d'activité socio-professionnel (g1, g2, g3, g4)
 */
export function getGroupe(activite = "") {
  const a = (activite || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  if (PROFESSIONS_GROUPS.groupe3.roles.some(r => a.includes(r.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) {
    return "retraite"; // g3
  }
  if (PROFESSIONS_GROUPS.groupe4.roles.some(r => a.includes(r.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) {
    return "eleve"; // g4 (Chef d'entreprise, Prof libérale)
  }
  if (PROFESSIONS_GROUPS.groupe1.roles.some(r => a.includes(r.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) {
    return "faible"; // g1 (Élève, Étudiant, Sans prof, Indépendant)
  }
  return "moyen"; // g2 (Salarié, Fonctionnaire) par défaut
}

/**
 * Normalise un groupe vers les identifiants de scénarios (groupe1, groupe2, groupe3, groupe4)
 */
export function mapGroupeKey(groupe) {
  switch (groupe) {
    case "faible": return "groupe1";
    case "moyen": return "groupe2";
    case "retraite": return "groupe3";
    case "eleve": return "groupe4";
    default: return "groupe2";
  }
}

/**
 * Conversion intelligente Millimes / DT
 */
export function parseMontantDT(val, defaultValue = 0) {
  if (val === undefined || val === null || val === "") return defaultValue;
  if (typeof val === "number") {
    // Si c'est déjà un grand nombre supérieur à 1 000 000 et pas un capital géant
    return val;
  }
  const clean = String(val).replace(/\s/g, "").replace(",", ".");
  const num = parseFloat(clean);
  if (isNaN(num)) return defaultValue;
  // Si le nombre semble être en millimes (ex: 5000000 millimes = 5000 DT)
  return num;
}

/**
 * Rétro-compatibilité pour l'UI des seuils dynamiques
 */
export const SEUILS = {
  ind2: {
    faible: { "RM/RF": 50000, "RE": 30000 },
    moyen: { "RM/RF": 150000, "RE": 80000 },
    retraite: { "RM/RF": 200000, "RE": 160000 },
    eleve: { "RM/RF": 500000, "RE": 200000 },
  },
  ind3: {
    faible: { "RM/RF": 1000, "RE": 400 },
    moyen: { "RM/RF": 2500, "RE": 1000 },
    retraite: { "RM/RF": 3000, "RE": 2000 },
    eleve: { "RM/RF": 6000, "RE": 3000 },
  },
  ind4: {
    faible: { "RM/RF": 20000, "RE": 10000 },
    moyen: { "RM/RF": 30000, "RE": 15000 },
    retraite: { "RM/RF": 50000, "RE": 30000 },
    eleve: { "RM/RF": 100000, "RE": 50000 },
  },
  ind5: {
    "RM/RF": 2,
    "RE": 1.25
  },
  ind8: {
    faible: 400000,
    moyen: 800000,
    eleve: 1000000,
    retraite: 400000,
  },
  ind10: {
    seuil: 5000
  }
};

const GRAVITE_SCORES = {
  critique: 10,
  haute: 5,
  moyenne: 2,
  basse: 1
};

export function calculateRiskScore(indicators) {
  const alertes = indicators.filter(ind => ind.alerte);
  const totalScore = alertes.reduce((sum, ind) => sum + (GRAVITE_SCORES[ind.gravite] || 0), 0);
  const maxScore = indicators.reduce((sum, ind) => sum + (GRAVITE_SCORES[ind.gravite] || 0), 0);
  const percentage = maxScore > 0 ? Math.min(100, Math.round((totalScore / maxScore) * 100)) : 0;

  let niveau = "basse";
  if (percentage >= 70) niveau = "critique";
  else if (percentage >= 40) niveau = "haute";
  else if (percentage >= 20) niveau = "moyenne";

  return {
    score: totalScore,
    percentage,
    niveau,
    alertesCount: alertes.length,
    details: alertes.map(ind => ({ id: ind.id, code: ind.code, label: ind.label, gravite: ind.gravite }))
  };
}

/**
 * Générateur automatisé des 3 livrables de décision pour un scénario donné :
 * 1) Raison de clôture (champ rouge obligatoire "Raison *")
 * 2) Note d'investigation
 * 3) Motif et argumentaire de déclaration de soupçon (CTAF / goAML)
 */
export function generateDecisionsForScenario(scenario, matchInfo, client) {
  const nom = client.nom ? `${client.prenom ? client.prenom + ' ' : ''}${client.nom}` : "Sociétaire";
  const profession = client.activite || client.LIB_PROF || "Salarié";
  const risque = client.niveauRisque || "RM/RF";
  const police = client.police || client.N_POLICE || "En cours";
  const agence = client.agence || client.AGENCE || "Principale";

  const data = {
    nom,
    profession,
    risque,
    police,
    agence,
    pays: client.pays || "Tunisie",
    valeurFmt: matchInfo.valeurFmt || `${matchInfo.valeur} TND`,
    valeurBienFmt: client.valeurBien ? `${client.valeurBien.toLocaleString('fr-TN')} TND` : null,
    delai_jours: matchInfo.delai_jours,
    matchRule: matchInfo.rule
  };

  // 1. Raison de clôture (RegTools)
  const raisonCloture = scenario.motifClotureTemplate
    ? scenario.motifClotureTemplate(data, matchInfo.rule || {})
    : `Dossier analysé pour le scénario ${scenario.description}. Profil socio-économique (${profession}) et justification documentaire vérifiés. Clôture sans suite.`;

  // 2. Note d'investigation (RegTools)
  const noteInvestigation = scenario.noteInvestigationTemplate
    ? scenario.noteInvestigationTemplate(data, matchInfo.rule || {})
    : `1. OBJET DU CONTRÔLE : Alerte sur ${scenario.description}.\n2. ANALYSE KYC : ${nom} (${profession}), risque ${risque}.\n3. DILIGENCES : Collecter les pièces justificatives complémentaires auprès de l'agence ${agence}.`;

  // 3. Déclaration de soupçon (CTAF / goAML / CNLCT)
  const motifSoupcon = `DÉCLARATION DE SOUPÇON (Réf: CTAF - Loi n°2015-26 & Règlement CGA n°2019-02)

1. EXPOSÉ FACTUEL :
Le client ${nom}, exerçant la profession de ${profession} (profil de risque: ${risque}), a initié une opération sur le contrat n°${police} (Agence ${agence}) déclenchant le scénario réglementaire "${scenario.description}".
Montant / Donnée constatée : ${data.valeurFmt}.

2. ANALYSE DU SOUPÇON & INCOHÉRENCES KYC :
- Incompatibilité caractérisée entre la surface financière apparente du souscripteur et l'importance économique de l'opération.
- Anomalie de comportement au regard des typologies de blanchiment d'argent dans le secteur des assurances (contournement des seuils, absence de justification probante de l'origine économique des fonds, risque de prête-nom).

3. QUALIFICATION JURIDIQUE & RECOMMANDATION :
En application de l'article 20 de la Loi organique n°2015-26 modifiée par la loi 2019-09, transmission immédiate d'une Déclaration de Soupçon (DS) à la Commission Tunisienne des Analyses Financières (CTAF) pour examen approfondi des flux financiers.`;

  return {
    raisonCloture,
    noteInvestigation,
    motifSoupcon
  };
}

/**
 * Référentiel de mapping officiel des Branches et Compagnies / Produits d'assurance
 * Intègre l'ensemble des branches :
 * - C_BR = 'A' : Automobile (MONO, FLOTTE)
 * - C_BR = 'B' : Habitation (BEYTI 271-277)
 * - C_BR = 'I' : Incendie & Pertes d'exploitation (INC 300, Risques Simples & Industriels)
 * - C_BR = 'M' : Multirisques Professionnelles (MULTI_PROF 280, MAPL 1 & 2)
 * - C_BR = 'C' : Accidents Corporels & Assistance Voyage (ACCIDENT 208, SAFER 211-213, PRIV_PROF 210)
 * - C_BR = 'N' : Risques Agricoles (Agricole 350)
 * - C_BR = 'G' : Santé & Maladie (MALA_INDIV 400, MALA_GRPE 401)
 * - C_BR = 'E' : Épargne & Assurance Vie (EPARGNE 600-604)
 */
export const BRANCHES_MAPPING = {
  A: {
    code: "A",
    nom: "Automobile",
    branche: "Non-Vie",
    source_system: "Auto/Irds",
    cies: [
      { n_cie: "10", lib_cie: "MONOBRANCHE", lib_branche: "Auto standard / Mono" },
      { n_cie: "17", lib_cie: "AUTO_FLOTTE", lib_branche: "Flotte Automobile" },
      { n_cie: "210", lib_cie: "AUTO_SPECIF", lib_branche: "Véhicules professionnels" }
    ],
    scenarios: ["SCEN_01", "SCEN_02", "SCEN_04", "SCEN_10"]
  },
  B: {
    code: "B",
    nom: "Habitation / Multirisque Habitation (MRH - BEYTI)",
    branche: "Non-Vie",
    source_system: "auto",
    cies: [
      { n_cie: "271", lib_cie: "BEYTI_PLUS", lib_branche: "Formule Plus" },
      { n_cie: "272", lib_cie: "BEYTI_CONF", lib_branche: "Formule Confort" },
      { n_cie: "273", lib_cie: "BEYTI_IMME", lib_branche: "Immeuble / Propriétaire" },
      { n_cie: "274", lib_cie: "BEYTI_CHIC", lib_branche: "Formule Haut de Gamme" },
      { n_cie: "276", lib_cie: "BEYTI_ASSU", lib_branche: "Formule Essentielle" },
      { n_cie: "277", lib_cie: "BEYTI_FORM", lib_branche: "Multirisque Standard" }
    ],
    scenarios: ["SCEN_08", "SCEN_01", "SCEN_02", "SCEN_04", "SCEN_10"]
  },
  I: {
    code: "I",
    nom: "Incendie & Pertes d'exploitation (INC)",
    branche: "Non-Vie",
    source_system: "Auto/Irds",
    cies: [
      {
        n_cie: "300",
        lib_cie: "INC",
        lib_branches: [
          "RISQUES SIMPLES", "Risques simples (TD)", "RISQUES INDUSTRIELS",
          "Perte d'exploitation apres incend", "Forfait incendie", "INCENDIE FORFAIT",
          "Incendie crédit", "INCENDIE INDUSTRIELS", "Incendie Crédit AC&PL",
          "Incendie Risque Simple", "Incendie Crédit Activité Indust"
        ]
      }
    ],
    scenarios: ["SCEN_01", "SCEN_02", "SCEN_04", "SCEN_10"]
  },
  M: {
    code: "M",
    nom: "Multirisques Professionnelles (MAPL)",
    branche: "Non-Vie",
    source_system: "Auto/Irds",
    cies: [
      {
        n_cie: "280",
        lib_cie: "MULTI_PROF",
        lib_branches: [
          "Forfait", "MAPL Formule 1", "MULTIRISQUES", "MAPL Formule 2"
        ]
      }
    ],
    scenarios: ["SCEN_01", "SCEN_02", "SCEN_04", "SCEN_10"]
  },
  C: {
    code: "C",
    nom: "Accidents Corporels & Assistance Voyage (SAFER)",
    branche: "Non-Vie",
    source_system: "Auto/Irds",
    cies: [
      { n_cie: "205", lib_cie: "vi_sco_ext", lib_branche: "Vie Scolaire Extra-scolaire" },
      { n_cie: "206", lib_cie: "AGRICO_IAC", lib_branche: "Agricoles Individuelle Accident" },
      { n_cie: "207", lib_cie: "PF_IND_ACC", lib_branche: "Pack Foyer / Classe des Professions" },
      { n_cie: "208", lib_cie: "ACCIDENT", lib_branche: "Individuelle Accident (Classes 1-4, Forfait, Annuel)" },
      { n_cie: "209", lib_cie: "PRIV_TRAJ", lib_branche: "Accident Trajet & Vie Privée" },
      { n_cie: "210", lib_cie: "PRIV_PROF / INDIV_ACC", lib_branche: "Accidents Professionnels & Privés" },
      { n_cie: "211", lib_cie: "SAFER_IND", lib_branche: "Assistance Voyage SAFER Individuel (7j-180j / Omra / Annuel)" },
      { n_cie: "212", lib_cie: "SAFER_GPE", lib_branche: "Assistance Voyage SAFER Groupe" },
      { n_cie: "213", lib_cie: "SAFER_FAM", lib_branche: "Assistance Voyage SAFER Famille" }
    ],
    scenarios: ["SCEN_01", "SCEN_02", "SCEN_04", "SCEN_10"]
  },
  N: {
    code: "N",
    nom: "Risques Agricoles",
    branche: "Non-Vie",
    source_system: "Auto/Irds",
    cies: [
      { n_cie: "350", lib_cie: "Agricole", lib_branche: "Agricole Forfait & Cultures" }
    ],
    scenarios: ["SCEN_01", "SCEN_02", "SCEN_04", "SCEN_10"]
  },
  G: {
    code: "G",
    nom: "Santé & Maladie (Groupe / Individuel)",
    branche: "Non-Vie",
    source_system: "Auto/Irds",
    cies: [
      { n_cie: "400", lib_cie: "MALA_INDIV", lib_branche: "Maladie Individuelle" },
      { n_cie: "401", lib_cie: "MALA_GRPE", lib_branche: "Maladie Groupe / Entreprise" }
    ],
    scenarios: ["SCEN_01", "SCEN_02", "SCEN_04", "SCEN_10"]
  },
  E: {
    code: "E",
    nom: "Épargne & Assurance Vie",
    branche: "Vie",
    source_system: "vie encaissement",
    cies: [
      { n_cie: "600", lib_cie: "EPARGNE_PROJ", lib_branche: "Épargne Projet" },
      { n_cie: "601", lib_cie: "EPARGNE_RET", lib_branche: "Épargne Retraite" },
      { n_cie: "602", lib_cie: "EPARGNE_TRAN", lib_branche: "Épargne Transmission" },
      { n_cie: "603", lib_cie: "EPARGNE_ETUD", lib_branche: "Épargne Études" },
      { n_cie: "604", lib_cie: "EPARGNE_INVE", lib_branche: "Épargne Investissement" }
    ],
    scenarios: ["SCEN_03", "SCEN_05", "SCEN_06", "SCEN_07", "SCEN_09", "SCEN_10", "SCEN_11", "SCEN_12", "SCEN_13", "SCEN_04"]
  },
  P: {
    code: "P",
    nom: "Prévoyance & Décès (PREV / IDR)",
    branche: "Vie",
    source_system: "vie encaissement",
    cies: [
      { n_cie: "650", lib_cie: "PREVOYANC", lib_branche: "Prévoyance Individuelle" },
      { n_cie: "655", lib_cie: "PREV_MIXTE", lib_branche: "Prévoyance Mixte" },
      { n_cie: "656", lib_cie: "PREVOYA_ES", lib_branche: "Prévoyance Entreprise" },
      { n_cie: "660", lib_cie: "Coll_Deces", lib_branche: "Contrat Collectif Décès" },
      { n_cie: "665", lib_cie: "IDR", lib_branche: "Contrat IDR (Indemnités Départ Retraite)" }
    ],
    scenarios: ["SCEN_07", "SCEN_10", "SCEN_04", "SCEN_01", "SCEN_02"]
  },
  Q: {
    code: "Q",
    nom: "Risques Techniques (TRC, BDM, Engins)",
    branche: "Non-Vie",
    source_system: "Auto/Irds",
    cies: [
      { n_cie: "260", lib_cie: "BDM", lib_branche: "Bris de Machines" },
      { n_cie: "261", lib_cie: "TRC", lib_branche: "Tous Risques Chantier" },
      { n_cie: "263", lib_cie: "TRI", lib_branche: "Tous Risques Informatiques" },
      { n_cie: "267", lib_cie: "TRE", lib_branche: "Tous Risques Montage & Essais" },
      { n_cie: "268", lib_cie: "EDC", lib_branche: "Engins de Chantier" }
    ],
    scenarios: ["SCEN_01", "SCEN_02", "SCEN_04", "SCEN_10"]
  },
  R: {
    code: "R",
    nom: "Responsabilité Civile & Risques Divers (RC, Décennale, Vol, DDE)",
    branche: "Non-Vie",
    source_system: "Auto/Irds",
    cies: [
      { n_cie: "220", lib_cie: "VOL", lib_branche: "Risques Divers - Vol" },
      { n_cie: "230", lib_cie: "RC", lib_branche: "Responsabilité Civile (Professionnelle, Chef de famille, Entreprises)" },
      { n_cie: "231", lib_cie: "DECENNALE", lib_branche: "RC Décennale Constructeurs" },
      { n_cie: "240", lib_cie: "DDE", lib_branche: "Dégâts des Eaux" },
      { n_cie: "250", lib_cie: "BDG", lib_branche: "Bris de Glaces" },
      { n_cie: "290", lib_cie: "RC_COMPT", lib_branche: "RC Experts-Comptables & Commissaires aux comptes" }
    ],
    scenarios: ["SCEN_01", "SCEN_02", "SCEN_04", "SCEN_10"]
  },
  T: {
    code: "T",
    nom: "Transport & Plaisance (Facultés & Corps)",
    branche: "Non-Vie",
    source_system: "Auto/Irds",
    cies: [
      { n_cie: "500", lib_cie: "FAC_VOYAGE", lib_branche: "Facultés au Voyage (Maritimes, Aériens, Terrestres)" },
      { n_cie: "501", lib_cie: "FAC_ABONN", lib_branche: "Facultés à l'Abonnement (Police Flottante)" },
      { n_cie: "502", lib_cie: "TRANS_FORF", lib_branche: "Transport Forfait Terrestre" },
      { n_cie: "503", lib_cie: "ASS_PLAISA", lib_branche: "Assurance Plaisance & Corps de navires" }
    ],
    scenarios: ["SCEN_01", "SCEN_02", "SCEN_04", "SCEN_10"]
  },
  V: {
    code: "V",
    nom: "Temporaire Décès Dégressif & Assurance Emprunteur (TD_DEGRESS / Conventions)",
    branche: "Vie",
    source_system: "vie encaissement",
    cies: [
      {
        n_cie: "700",
        lib_cie: "TD_DEGRESS",
        lib_branches: [
          "VIE", "FORFAIT", "SANS FRANCHISE", "Franchise 1 à 3 mois", "Franchise 4 mois",
          "Franchise 5 mois", "Franchise 6 mois", "Franchise 7 mois", "Franchise 8 mois",
          "Franchise 9 mois", "Franchise 10 mois", "Franchise 11 mois", "Franchise 12 mois",
          "Franchise 24 mois", "Franchise 36 mois", "Franchise 60 mois", "Franchise 84 mois",
          "BENEFICIAIRE CLIENTS DE LA BNA", "BENEFICIAIRE EMPLOYE DE LA BNA",
          "BENEFICIAIRE SONEDE", "BENEFICIAIRE OMMP", "BENEFICIAIRE RNTA",
          "BENEFICIAIRE Amicale OACA", "BENEFICIAIRE CNRPS", "BENEF MINIST EDUCAT & FORMATION",
          "BENEFICIAIRE ONAS"
        ]
      },
      {
        n_cie: "701",
        lib_cie: "PREVOYANCE",
        lib_branches: ["FORFAIT"]
      }
    ],
    scenarios: ["SCEN_01", "SCEN_07", "SCEN_10", "SCEN_11", "SCEN_04"]
  }
};

/**
 * Fonction universelle de détection et normalisation de branche
 */
export function detectBranchAndSystem(profile = {}) {
  const cBr = (profile.C_BR || profile.c_br || "").toUpperCase().trim();
  const nCie = String(profile.N_CIE ?? profile.n_cie ?? "").trim();
  const libCie = (profile.LIB_CIE || profile.lib_cie || "").toUpperCase().trim();
  const libBranche = (profile.LIB_BRANCHE || profile.LIB_BRAN || profile.lib_branche || "").toUpperCase().trim();

  // 1. Détection directe par code C_BR
  if (cBr && BRANCHES_MAPPING[cBr]) {
    const m = BRANCHES_MAPPING[cBr];
    return {
      code: m.code,
      nom: m.nom,
      branche: m.branche,
      source_system: m.source_system,
      isVie: m.branche === "Vie",
      isHabitation: m.code === "B",
      isNonVieIrds: m.branche === "Non-Vie"
    };
  }

  // 2. Détection par N_CIE ou LIB_CIE
  if (["600", "601", "602", "603", "604"].includes(nCie) || libCie.includes("EPARGNE") || (libCie.includes("VIE") && !libCie.includes("VI_SCO"))) {
    const m = BRANCHES_MAPPING.E;
    return { code: "E", nom: m.nom, branche: "Vie", source_system: "vie encaissement", isVie: true, isHabitation: false, isNonVieIrds: false };
  }

  if (["650", "655", "656", "660", "665"].includes(nCie) || libCie.includes("PREVOY") || libCie.includes("COLL_DECES") || libCie.includes("IDR")) {
    const m = BRANCHES_MAPPING.P;
    return { code: "P", nom: m.nom, branche: "Vie", source_system: "vie encaissement", isVie: true, isHabitation: false, isNonVieIrds: false };
  }

  if (["260", "261", "263", "267", "268"].includes(nCie) || libCie.includes("TRC") || libCie.includes("BDM") || libCie.includes("TRI") || libCie.includes("TRE") || libCie.includes("EDC")) {
    const m = BRANCHES_MAPPING.Q;
    return { code: "Q", nom: m.nom, branche: "Non-Vie", source_system: "Auto/Irds", isVie: false, isHabitation: false, isNonVieIrds: true };
  }

  if (["220", "230", "231", "240", "250", "290"].includes(nCie) || libCie.includes("DECENNALE") || libCie.includes("RC") || libCie.includes("VOL") || libCie.includes("DDE") || libCie.includes("BDG")) {
    const m = BRANCHES_MAPPING.R;
    return { code: "R", nom: m.nom, branche: "Non-Vie", source_system: "Auto/Irds", isVie: false, isHabitation: false, isNonVieIrds: true };
  }

  if (["500", "501", "502", "503"].includes(nCie) || libCie.includes("FAC_") || libCie.includes("TRANS_") || libCie.includes("PLAISA") || libCie.includes("VOYAG")) {
    const m = BRANCHES_MAPPING.T;
    return { code: "T", nom: m.nom, branche: "Non-Vie", source_system: "Auto/Irds", isVie: false, isHabitation: false, isNonVieIrds: true };
  }

  if (["700", "701"].includes(nCie) || libCie.includes("TD_DEGRESS") || cBr === "V") {
    const m = BRANCHES_MAPPING.V;
    return { code: "V", nom: m.nom, branche: "Vie", source_system: "vie encaissement", isVie: true, isHabitation: false, isNonVieIrds: false };
  }

  if (["271", "272", "273", "274", "276", "277"].includes(nCie) || libCie.includes("BEYTI") || libCie.includes("HABIT")) {
    const m = BRANCHES_MAPPING.B;
    return { code: "B", nom: m.nom, branche: "Non-Vie", source_system: "auto", isVie: false, isHabitation: true, isNonVieIrds: true };
  }

  if (nCie === "300" || libCie.includes("INC")) {
    const m = BRANCHES_MAPPING.I;
    return { code: "I", nom: m.nom, branche: "Non-Vie", source_system: "Auto/Irds", isVie: false, isHabitation: false, isNonVieIrds: true };
  }

  if (nCie === "280" || libCie.includes("MULTI_PROF") || libCie.includes("MAPL")) {
    const m = BRANCHES_MAPPING.M;
    return { code: "M", nom: m.nom, branche: "Non-Vie", source_system: "Auto/Irds", isVie: false, isHabitation: false, isNonVieIrds: true };
  }

  if (["205", "206", "207", "208", "209", "210", "211", "212", "213"].includes(nCie) ||
      libCie.includes("ACCIDENT") || libCie.includes("SAFER") || libCie.includes("PRIV_TRAJ") || libCie.includes("INDIV_ACC") || libCie.includes("PRIV_PROF") || libCie.includes("VI_SCO")) {
    const m = BRANCHES_MAPPING.C;
    return { code: "C", nom: m.nom, branche: "Non-Vie", source_system: "Auto/Irds", isVie: false, isHabitation: false, isNonVieIrds: true };
  }

  if (nCie === "350" || libCie.includes("AGRICOLE")) {
    const m = BRANCHES_MAPPING.N;
    return { code: "N", nom: m.nom, branche: "Non-Vie", source_system: "Auto/Irds", isVie: false, isHabitation: false, isNonVieIrds: true };
  }

  if (["400", "401"].includes(nCie) || libCie.includes("MALA") || libCie.includes("SANTE")) {
    const m = BRANCHES_MAPPING.G;
    return { code: "G", nom: m.nom, branche: "Non-Vie", source_system: "Auto/Irds", isVie: false, isHabitation: false, isNonVieIrds: true };
  }

  if (["10", "17"].includes(nCie) || libCie.includes("MONO") || libCie.includes("FLOTTE") || libCie.includes("AUTO")) {
    const m = BRANCHES_MAPPING.A;
    return { code: "A", nom: m.nom, branche: "Non-Vie", source_system: "Auto/Irds", isVie: false, isHabitation: false, isNonVieIrds: true };
  }

  // Par défaut Non-Vie / Auto/Irds
  return { code: "A", nom: "Non-Vie / Auto/IRDS", branche: "Non-Vie", source_system: "Auto/Irds", isVie: false, isHabitation: false, isNonVieIrds: true };
}

/**
 * Moteur principal : évalue un profil ou une transaction contre les 13 SCÉNARIOS RÉGLEMENTAIRES
 */
export function checkAlert(profile = {}) {
  const groupeSlug = getGroupe(profile.activite || profile.LIB_PROF || "salarié");
  const groupeKey = mapGroupeKey(groupeSlug);
  const isRisqueEleve = profile.niveauRisque === "RE" || profile.riskValue === "Risque Elevé" || !!profile.niveauRisqueElevé;
  const risqueLabel = isRisqueEleve ? "RE" : "RM/RF";

  // Normalisation des colonnes du système de gestion (C_BR, N_CIE, LIB_CIE, N_BRA, LIB_BRANCHE)
  const cBr = (profile.C_BR || profile.c_br || "").toUpperCase().trim();
  const nCie = String(profile.N_CIE ?? profile.n_cie ?? "").trim();
  const libCie = (profile.LIB_CIE || profile.lib_cie || "").toUpperCase().trim();
  const libBranche = (profile.LIB_BRANCHE || profile.LIB_BRAN || profile.lib_branche || "").toUpperCase().trim();

  // Détection automatique de la branche et du système source (A, B, C, I, M, N, G, E)
  const branchInfo = detectBranchAndSystem(profile);
  const isAuto = branchInfo.code === "A";
  const isHabitationBayti = branchInfo.isHabitation;
  const isVieEpargne = branchInfo.isVie;
  const isNonVieIrds = branchInfo.isNonVieIrds;

  let sourceSys = (profile.source_system || "").toLowerCase();
  if (!sourceSys) {
    sourceSys = branchInfo.source_system.toLowerCase();
  }

  const modifType = (profile.modification_type || profile.typeOperation || "").toLowerCase();

  // Capital Non-Vie (Auto/IRDS ou Multirisque Habitation)
  const capNonVie = Number(profile.capitalAssure || profile.MAX_CAP || profile.max_cap || profile.VAL_VENTE || 0);
  // Prime Non-Vie
  const primeNonVie = Number(profile.prime || profile.PRIME_ENCAIS || 0);
  // Rachat Vie
  const rachatVie = Number(profile.valeurRachat || profile.capital || 0);
  // Augmentation ratio
  const ratioAugment = Number(profile.augmentationCapital || (profile.capital && profile.Capital_previous ? profile.capital / profile.Capital_previous : 0));
  // Capital Vie (fin de contrat)
  const capVieFin = Number(profile.capitalAssureVie || profile.Capital_fin_contrat || (isVieEpargne ? capNonVie : 0));
  // Primes cumulées Vie
  const primesVieTotales = Number(profile.primesVieTotales || profile["montant total des primes versees"] || (isVieEpargne ? primeNonVie : 0));
  // Espèces
  const especes = Number(profile.paiementEspeces || profile.amount || profile.montant || (String(profile.M).trim() === "1" ? primeNonVie : 0));
  const modePaiement = String(profile.MODE_PAIEMENT || profile.M || profile.modePaiement || "").toUpperCase().trim();
  const isModeEspeces = modePaiement === "ESPECE" || modePaiement === "ESPEC" || modePaiement === "1" || !!profile.isEspeces;

  const indicators = [];

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. SCÉNARIO 01 : Somme des capitaux assuré supérieur à (non vie)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const scen = AML_SCENARIOS[0];
    const isTrigger = sourceSys.includes("auto") || sourceSys.includes("irds") || isNonVieIrds || profile.typeOperation === "souscription" || !sourceSys;
    const rule = scen.sousRegles.find(r => r.groupe === groupeKey && r.risqueEleve === isRisqueEleve) || scen.sousRegles[2];
    const isAlert = isTrigger && (capNonVie > rule.seuilDT || capNonVie > rule.seuilMillimes);
    const decisions = isAlert ? generateDecisionsForScenario(scen, { valeur: capNonVie, valeurFmt: `${capNonVie.toLocaleString('fr-TN')} DT`, rule }, profile) : null;
    
    indicators.push({
      id: scen.id,
      code: scen.code,
      label: scen.description,
      alerte: isAlert,
      regle: `Seuil ${rule.seuilDT.toLocaleString('fr-TN')} DT (${rule.label})`,
      valeurs: `${capNonVie.toLocaleString('fr-TN')} DT`,
      seuil: `${rule.seuilDT.toLocaleString('fr-TN')} DT`,
      gravite: scen.gravite,
      branche: scen.branche,
      sousRegleDeclenchee: isAlert ? rule : null,
      decisions
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. SCÉNARIO 02 : Souscription d'un contrat dont la prime est supérieure à (non vie)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const scen = AML_SCENARIOS[1];
    const isTrigger = sourceSys.includes("auto") || sourceSys.includes("irds") || isNonVieIrds || profile.typeOperation === "souscription" || profile.typeOperation === "prime" || !sourceSys;
    const rule = scen.sousRegles.find(r => r.groupe === groupeKey && r.risqueEleve === isRisqueEleve) || scen.sousRegles[2];
    const isAlert = isTrigger && (primeNonVie > rule.seuilDT || primeNonVie > rule.seuilMillimes);
    const decisions = isAlert ? generateDecisionsForScenario(scen, { valeur: primeNonVie, valeurFmt: `${primeNonVie.toLocaleString('fr-TN')} DT`, rule }, profile) : null;

    indicators.push({
      id: scen.id,
      code: scen.code,
      label: scen.description,
      alerte: isAlert,
      regle: `Seuil ${rule.seuilDT.toLocaleString('fr-TN')} DT (${rule.label})`,
      valeurs: `${primeNonVie.toLocaleString('fr-TN')} DT`,
      seuil: `${rule.seuilDT.toLocaleString('fr-TN')} DT`,
      gravite: scen.gravite,
      branche: scen.branche,
      sousRegleDeclenchee: isAlert ? rule : null,
      decisions
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. SCÉNARIO 03 : Rachat d'un contrat d'assurance vie ou capitalisation
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const scen = AML_SCENARIOS[2];
    const isTrigger = sourceSys.includes("vie decaissement") || modifType.includes("rachat") || profile.typeOperation === "rachat";
    const rule = scen.sousRegles.find(r => r.groupe === groupeKey && r.risqueEleve === isRisqueEleve) || scen.sousRegles[2];
    const isAlert = isTrigger && (rachatVie > rule.seuilDT || rachatVie > rule.seuilMillimes);
    const decisions = isAlert ? generateDecisionsForScenario(scen, { valeur: rachatVie, valeurFmt: `${rachatVie.toLocaleString('fr-TN')} DT`, rule }, profile) : null;

    indicators.push({
      id: scen.id,
      code: scen.code,
      label: scen.description,
      alerte: isAlert,
      regle: `Valeur rachat > ${rule.seuilDT.toLocaleString('fr-TN')} DT (${rule.label})`,
      valeurs: `${rachatVie.toLocaleString('fr-TN')} DT`,
      seuil: `${rule.seuilDT.toLocaleString('fr-TN')} DT`,
      gravite: scen.gravite,
      branche: scen.branche,
      sousRegleDeclenchee: isAlert ? rule : null,
      decisions
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. SCÉNARIO 04 : Souscription par client ressortissant d'un pays liste GAFI
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const scen = AML_SCENARIOS[3];
    const pays = profile.pays || "";
    const isGafi = !!profile.paysGafi || 
      (profile.riskFactors && String(profile.riskFactors).includes("67a3758d951558001cf2e82c")) ||
      PAYS_RISQUE_ELEVE.some(p => pays.toLowerCase().includes(p.toLowerCase()));
    const decisions = isGafi ? generateDecisionsForScenario(scen, { pays, valeurFmt: pays || "Pays GAFI" }, profile) : null;

    indicators.push({
      id: scen.id,
      code: scen.code,
      label: scen.description,
      alerte: isGafi,
      regle: "Client ressortissant d'un pays sous surveillance renforcée / liste noire du GAFI",
      valeurs: `Pays: ${pays || (isGafi ? "Liste GAFI" : "Conforme")}`,
      seuil: "Pays GAFI = Vrai",
      gravite: scen.gravite,
      branche: scen.branche,
      decisions
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. SCÉNARIO 05 : Augmentation de la valeur des capitaux assurés
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const scen = AML_SCENARIOS[4];
    const rule = scen.sousRegles.find(r => r.risqueEleve === isRisqueEleve) || scen.sousRegles[0];
    const isTrigger = sourceSys.includes("vie encaissement") || modifType.includes("avenant") || modifType.includes("capital") || profile.typeOperation === "augmentation";
    const isAlert = isTrigger && ratioAugment > rule.multiplicateur;
    const decisions = isAlert ? generateDecisionsForScenario(scen, { valeurFmt: `Ratio x${ratioAugment.toFixed(2)}`, rule }, profile) : null;

    indicators.push({
      id: scen.id,
      code: scen.code,
      label: scen.description,
      alerte: isAlert,
      regle: `Ratio de capital > x${rule.multiplicateur} (${rule.label})`,
      valeurs: `Ratio: x${ratioAugment || 0}`,
      seuil: `> x${rule.multiplicateur}`,
      gravite: scen.gravite,
      branche: scen.branche,
      sousRegleDeclenchee: isAlert ? rule : null,
      decisions
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. SCÉNARIO 06 : Rachat total ou partiel précoce (< 90 jours)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const scen = AML_SCENARIOS[5];
    let diffDays = null;
    let isEarly = !!profile.rachatMoins90j;

    if (profile.dateSouscription && profile.dateOperation) {
      const d1 = new Date(profile.dateSouscription);
      const d2 = new Date(profile.dateOperation);
      const diff = Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
      if (!isNaN(diff)) {
        diffDays = diff;
        isEarly = diff < 90 && diff >= 0;
      }
    }
    const isTrigger = sourceSys.includes("vie decaissement") || modifType.includes("rachat") || profile.typeOperation === "rachat" || isEarly;
    const isAlert = isTrigger && isEarly;
    const decisions = isAlert ? generateDecisionsForScenario(scen, { delai_jours: diffDays ?? "< 90", valeurFmt: `${diffDays ?? '< 90'} jours` }, profile) : null;

    indicators.push({
      id: scen.id,
      code: scen.code,
      label: scen.description,
      alerte: isAlert,
      regle: "Rachat total ou partiel demandé moins de 90 jours après la date de souscription",
      valeurs: diffDays !== null ? `${diffDays} jours` : (isEarly ? "< 90 jours" : "Délai normal"),
      seuil: "< 90 jours",
      gravite: scen.gravite,
      branche: scen.branche,
      decisions
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. SCÉNARIO 07 : Changement fréquent du bénéficiaire (vie / capitalisation)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const scen = AML_SCENARIOS[6];
    const nbModifs = Number(profile.nbChangementsBeneficiaire || profile.count_contract_last_modification_dateeqDatedencaissement_gt3 || 0);
    const isAlert = nbModifs >= 3 || !!profile.changementBeneficiaire;
    const decisions = isAlert ? generateDecisionsForScenario(scen, { valeurFmt: `${nbModifs || '≥ 3'} changements` }, profile) : null;

    indicators.push({
      id: scen.id,
      code: scen.code,
      label: scen.description,
      alerte: isAlert,
      regle: "≥ 3 modifications enregistrées de la clause bénéficiaire (KPI > 3)",
      valeurs: nbModifs > 0 ? `${nbModifs} fois` : (isAlert ? "≥ 3 fois" : "Non"),
      seuil: "≥ 3 modifications",
      gravite: scen.gravite,
      branche: scen.branche,
      decisions
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. SCÉNARIO 08 : Capital multirisques habitation incohérent
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const scen = AML_SCENARIOS[7];
    let rule = scen.sousRegles.find(r => r.groupe === groupeKey) || scen.sousRegles[0];
    const isHabitation = isHabitationBayti || cBr === "B" || !!profile.baytIIcoherent;
    const isAlert = isHabitation && (!!profile.baytIIcoherent || (capNonVie > rule.seuilDT || capNonVie > rule.seuilMillimes));
    const decisions = isAlert ? generateDecisionsForScenario(scen, { valeurFmt: `${capNonVie.toLocaleString('fr-TN')} DT`, rule }, profile) : null;

    indicators.push({
      id: scen.id,
      code: scen.code,
      label: scen.description,
      alerte: isAlert,
      regle: `Capital multirisques > ${rule.seuilDT.toLocaleString('fr-TN')} DT selon groupe pro (${rule.label})`,
      valeurs: isAlert ? (capNonVie > 0 ? `${capNonVie.toLocaleString('fr-TN')} DT` : "Incohérent déclaré") : "Cohérent",
      seuil: `${rule.seuilDT.toLocaleString('fr-TN')} DT`,
      gravite: scen.gravite,
      branche: scen.branche,
      sousRegleDeclenchee: isAlert ? rule : null,
      decisions
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. SCÉNARIO 09 : Souscriptions multiples de contrats vie (court délai ≤ 3 ans)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const scen = AML_SCENARIOS[8];
    const nbContrats = Number(profile.nbContrats3Ans || 0);
    const isAlert = nbContrats >= 3 || !!profile.souscriptionsMultiples;
    const decisions = isAlert ? generateDecisionsForScenario(scen, { valeurFmt: `${nbContrats || '≥ 3'} contrats en < 3 ans` }, profile) : null;

    indicators.push({
      id: scen.id,
      code: scen.code,
      label: scen.description,
      alerte: isAlert,
      regle: "≥ 3 contrats vie ou capitalisation souscrits dans un délai ≤ 3 ans",
      valeurs: nbContrats > 0 ? `${nbContrats} contrats` : (isAlert ? "≥ 3 contrats" : "0"),
      seuil: "≥ 3 contrats / 3 ans",
      gravite: scen.gravite,
      branche: scen.branche,
      decisions
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. SCÉNARIO 10 : Paiement en espèce (> 5 000 DT)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const scen = AML_SCENARIOS[9];
    const rule = scen.sousRegles[0];
    const depasseSeuil = especes > rule.seuilDT || especes > rule.seuilMillimes;
    const isAlert = depasseSeuil && (isModeEspeces || !modePaiement);
    const decisions = isAlert ? generateDecisionsForScenario(scen, { valeurFmt: `${especes.toLocaleString('fr-TN')} DT`, rule }, profile) : null;

    indicators.push({
      id: scen.id,
      code: scen.code,
      label: scen.description,
      alerte: isAlert,
      regle: "Paiement en espèces > 5 000 DT (5 000 000 millimes) — Article 13 Loi 2015-26",
      valeurs: `${especes.toLocaleString('fr-TN')} DT ${isModeEspeces ? "(Mode Espèces)" : ""}`,
      seuil: "5 000 DT",
      gravite: scen.gravite,
      branche: scen.branche,
      decisions
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 11. SCÉNARIO 11 : Somme des capitaux assuré supérieur à (vie)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const scen = AML_SCENARIOS[10];
    const rule = scen.sousRegles.find(r => r.groupe === groupeKey && r.risqueEleve === isRisqueEleve) || scen.sousRegles[2];
    const isTrigger = sourceSys.includes("vie") || profile.produitVie || profile.typeOperation === "souscription";
    const isAlert = isTrigger && (capVieFin > rule.seuilDT || capVieFin > rule.seuilMillimes);
    const decisions = isAlert ? generateDecisionsForScenario(scen, { valeurFmt: `${capVieFin.toLocaleString('fr-TN')} DT`, rule }, profile) : null;

    indicators.push({
      id: scen.id,
      code: scen.code,
      label: scen.description,
      alerte: isAlert,
      regle: `Capital fin de contrat vie > ${rule.seuilDT.toLocaleString('fr-TN')} DT (${rule.label})`,
      valeurs: `${capVieFin.toLocaleString('fr-TN')} DT`,
      seuil: `${rule.seuilDT.toLocaleString('fr-TN')} DT`,
      gravite: scen.gravite,
      branche: scen.branche,
      sousRegleDeclenchee: isAlert ? rule : null,
      decisions
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 12. SCÉNARIO 12 : Souscription d'un contrat dont la prime est supérieure à (vie)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const scen = AML_SCENARIOS[11];
    const rule = scen.sousRegles.find(r => r.groupe === groupeKey && r.risqueEleve === isRisqueEleve) || scen.sousRegles[2];
    const isTrigger = sourceSys.includes("vie") || profile.produitVie || profile.typeOperation === "souscription" || profile.typeOperation === "prime";
    const isAlert = isTrigger && (primesVieTotales > rule.seuilDT || primesVieTotales > rule.seuilMillimes);
    const decisions = isAlert ? generateDecisionsForScenario(scen, { valeurFmt: `${primesVieTotales.toLocaleString('fr-TN')} DT`, rule }, profile) : null;

    indicators.push({
      id: scen.id,
      code: scen.code,
      label: scen.description,
      alerte: isAlert,
      regle: `Total des primes versées vie > ${rule.seuilDT.toLocaleString('fr-TN')} DT (${rule.label})`,
      valeurs: `${primesVieTotales.toLocaleString('fr-TN')} DT`,
      seuil: `${rule.seuilDT.toLocaleString('fr-TN')} DT`,
      gravite: scen.gravite,
      branche: scen.branche,
      sousRegleDeclenchee: isAlert ? rule : null,
      decisions
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 13. SCÉNARIO 13 : Avance contrat d'assurance vie ou capitalisation
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const scen = AML_SCENARIOS[12];
    const isAvance = modifType.includes("avance") || profile.typeOperation === "avance";
    const montantAvance = Number(profile.montantAvance || profile["montant prestation/décaissement"] || 0);
    const primesCumul = primesVieTotales > 0 ? primesVieTotales : 1;
    const ratioAvance = montantAvance / primesCumul;
    const isAvancePrecoce = !!profile.avanceMoins6Mois;
    const nbAvances12M = Number(profile.nbAvances12Mois || profile.count_contract_avance_gt2_L12M || 0);

    const isAlert = isAvance && (nbAvances12M > 2 || ratioAvance > 0.8 || isAvancePrecoce);
    const decisions = isAlert ? generateDecisionsForScenario(scen, { valeurFmt: `${montantAvance.toLocaleString('fr-TN')} DT (Ratio: ${(ratioAvance * 100).toFixed(0)}%)` }, profile) : null;

    indicators.push({
      id: scen.id,
      code: scen.code,
      label: scen.description,
      alerte: isAlert,
      regle: "Avance > 80% des primes versées OU avance < 6 mois OU répétée (> 2 en 12 mois)",
      valeurs: isAlert ? `Avance: ${montantAvance.toLocaleString('fr-TN')} DT (${(ratioAvance * 100).toFixed(0)}% primes)` : "Aucune alerte avance",
      seuil: "> 80% primes OU < 6 mois OU > 2 / an",
      gravite: scen.gravite,
      branche: scen.branche,
      decisions
    });
  }

  const alertes = indicators.filter(i => i.alerte);
  const riskScore = calculateRiskScore(indicators);

  return {
    alert: alertes.length > 0,
    alertes,
    indicators,
    groupe: groupeSlug,
    groupeLabel: PROFESSIONS_GROUPS[mapGroupeKey(groupeSlug)]?.label || groupeSlug,
    niveauRisque: risqueLabel,
    riskScore,
    totalScenarios: AML_SCENARIOS.length
  };
}
