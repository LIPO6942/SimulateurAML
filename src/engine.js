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
 * Moteur principal : évalue un profil ou une transaction contre les 13 SCÉNARIOS RÉGLEMENTAIRES
 */
export function checkAlert(profile = {}) {
  const groupeSlug = getGroupe(profile.activite || profile.LIB_PROF || "salarié");
  const groupeKey = mapGroupeKey(groupeSlug);
  const isRisqueEleve = profile.niveauRisque === "RE" || profile.riskValue === "Risque Elevé" || !!profile.niveauRisqueElevé;
  const risqueLabel = isRisqueEleve ? "RE" : "RM/RF";

  // Normalisation des variables d'entrée
  const sourceSys = (profile.source_system || "").toLowerCase();
  const modifType = (profile.modification_type || profile.typeOperation || "").toLowerCase();

  // Capital Non-Vie (Auto/IRDS)
  const capNonVie = Number(profile.capitalAssure || profile.MAX_CAP || profile.max_cap || 0);
  // Prime Non-Vie
  const primeNonVie = Number(profile.prime || profile.PRIME_ENCAIS || 0);
  // Rachat Vie
  const rachatVie = Number(profile.valeurRachat || profile.capital || 0);
  // Augmentation ratio
  const ratioAugment = Number(profile.augmentationCapital || (profile.capital && profile.Capital_previous ? profile.capital / profile.Capital_previous : 0));
  // Capital Vie (fin de contrat)
  const capVieFin = Number(profile.capitalAssureVie || profile.Capital_fin_contrat || profile.capitalAssure || 0);
  // Primes cumulées Vie
  const primesVieTotales = Number(profile.primesVieTotales || profile["montant total des primes versees"] || profile.prime || 0);
  // Espèces
  const especes = Number(profile.paiementEspeces || profile.amount || profile.montant || 0);
  const modePaiement = String(profile.MODE_PAIEMENT || profile.M || profile.modePaiement || "").toUpperCase();
  const isModeEspeces = modePaiement === "ESPECE" || modePaiement === "ESPEC" || modePaiement === "1" || !!profile.isEspeces;

  const indicators = [];

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. SCÉNARIO 01 : Somme des capitaux assuré supérieur à (non vie)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const scen = AML_SCENARIOS[0];
    const isTrigger = sourceSys.includes("auto") || sourceSys.includes("irds") || profile.typeOperation === "souscription" || !sourceSys;
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
    const isTrigger = sourceSys.includes("auto") || sourceSys.includes("irds") || profile.typeOperation === "souscription" || profile.typeOperation === "prime" || !sourceSys;
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
    const isAlert = !!profile.baytIIcoherent || (capNonVie > rule.seuilDT || capNonVie > rule.seuilMillimes);
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
