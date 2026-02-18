// ─── MOTEUR DE RÈGLES LCB-FT ──────────────────────────────────────────────────

const GROUPE = {
  faible: ["élève", "etudiant", "étudiant", "sans profession", "travailleur indépendant", "travailleur independant"],
  moyen:  ["salarié", "salarie", "fonctionnaire"],
  eleve:  ["pm", "chef d'entreprise", "chef dentreprise", "profession libérale", "profession liberale"],
  retraite: ["retraité", "retraite"],
};

export function getGroupe(activite) {
   const a = activite.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
   if (GROUPE.retraite.some(x => a.includes(x.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) return "retraite";
   if (GROUPE.faible.some(x => a.includes(x.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) return "faible";
   if (GROUPE.eleve.some(x => a.includes(x.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) return "eleve";
   return "moyen";
 }

 export const SEUILS = {
    // Indicateur 2 — Souscription capital élevé
    ind2: {
        faible:   { "!=": 50000,  "RE": 30000 },
        moyen:    { "!=": 150000, "RE": 40000 },
        retraite: { "!=": 80000,  "RE": 160000 },
        eleve:    { "!=": 500000, "RE": 200000 },
    },
    // Indicateur 3 — Prime élevée à la souscription
    ind3: {
        faible:   { "!=": 1000,  "RE": 400 },
        moyen:    { "!=": 2500,  "RE": 1000 },
        retraite: { "!=": 2000,  "RE": 3000 },
        eleve:    { "!=": 6000,  "RE": 3000 },
    },
    // Indicateur 4 — Rachat (valeur contrat)
    ind4: {
        faible:   { "!=": 20000,  "RE": 10000 },
        moyen:    { "!=": 30000,  "RE": 15000 },
        retraite: { "!=": 50000,  "RE": 60000 },
        eleve:    { "!=": 100000, "RE": 50000 },
    },
    // Indicateur 5 — Augmentation capital
    ind5: {
        faible:   { "!=": 2,    "RE": 2 },
        moyen:    { "!=": 2,    "RE": 2 },
        retraite: { "!=": 2,    "RE": 2 },
        eleve:    { "!=": 1.25, "RE": 1.25 },
    },
    // Indicateur 8 — Capital Bayti incohérent
    ind8: {
        faible:   400000,
        moyen:    800000,
        eleve:    1000000,
        retraite: 400000,
    },
    // Indicateur 10 — Paiement espèces
    ind10: {
        seuil: 5000
    },
    // Legacy aliases for backward compat
    ind_cap: {
        faible:   { "!=": 50000,  "RE": 30000 },
        moyen:    { "!=": 150000, "RE": 40000 },
        retraite: { "!=": 80000,  "RE": 160000 },
        eleve:    { "!=": 500000, "RE": 200000 },
    },
    ind_prime: {
        faible:   { "!=": 1000,  "RE": 400 },
        moyen:    { "!=": 2500,  "RE": 1000 },
        retraite: { "!=": 2000,  "RE": 3000 },
        eleve:    { "!=": 6000,  "RE": 3000 },
    },
    ind_rachat: {
        faible:   { "!=": 20000,  "RE": 10000 },
        moyen:    { "!=": 30000,  "RE": 15000 },
        retraite: { "!=": 50000,  "RE": 60000 },
        eleve:    { "!=": 100000, "RE": 50000 },
    },
    // Keep old keys for FormPanel display
    ind_old3: {
        faible: { "!=": 50000, "RE": 30000 },
        moyen: { "!=": 150000, "RE": 40000 },
        eleve: { "!=": 500000, "RE": 200000 },
    },
    ind_old4: {
        faible: { "!=": 1000, "RE": 400 },
        moyen: { "!=": 2500, "RE": 1000 },
        eleve: { "!=": 6000, "RE": 3000 },
    },
    ind_old5: {
        faible: { "!=": 20000, "RE": 10000 },
        moyen: { "!=": 30000, "RE": 15000 },
        eleve: { "!=": 100000, "RE": 50000 },
    },
    ind6: {
      "faible": 2,
      "moyen": 2,
      "retraite": 2,
      "eleve": 1.25
    },
    ind12: {
      seuil: 5000
    }
}

// ─── NOUVELLE FONCTION : checkAlert ────────────────────────────────────────────
// Prend un profil simplifié et retourne toutes les alertes déclenchées

export function checkAlert(profile) {
  // profile = {
  //   activite, niveauRisque, capitalAssure, prime, typeOperation,
  //   valeurRachat, augmentationCapital, paiementEspeces,
  //   paysGafi, rachatMoins90j, changementBeneficiaire,
  //   baytIIcoherent, souscriptionsMultiples
  // }

  const groupe = getGroupe(profile.activite || "salarié");
  const risque = profile.niveauRisque || "!=";
  const alertes = [];

  // ── Scénario 1 : Pays GAFI ─────────────────────────────────────────────────
  if (profile.paysGafi) {
    alertes.push({
      id: 1,
      scenario: "Pays Liste GAFI",
      regle: "Souscription d'un contrat par un client ressortissant d'un pays sur la liste du GAFI",
      gravite: "critique",
    });
  }

  // ── Scénario 2 : Capital assuré élevé (Souscription) ──────────────────────
  if (profile.typeOperation === "souscription" || profile.typeOperation === "augmentation") {
    const seuil2 = SEUILS.ind2[groupe]?.[risque];
    if (seuil2 && profile.capitalAssure > seuil2) {
      alertes.push({
        id: 2,
        scenario: "Capital Assuré Élevé — Souscription",
        regle: `Capital assuré (${(profile.capitalAssure || 0).toLocaleString("fr-TN")} DT) > seuil ${seuil2.toLocaleString("fr-TN")} DT pour ${profile.activite} (${risque})`,
        gravite: "haute",
        seuil: seuil2,
      });
    }
  }

  // ── Scénario 3 : Prime élevée (Souscription) ──────────────────────────────
  if (profile.typeOperation === "souscription" || profile.typeOperation === "prime") {
    const seuil3 = SEUILS.ind3[groupe]?.[risque];
    if (seuil3 && profile.prime > seuil3) {
      alertes.push({
        id: 3,
        scenario: "Prime Anormalement Élevée",
        regle: `Prime (${(profile.prime || 0).toLocaleString("fr-TN")} DT) > seuil ${seuil3.toLocaleString("fr-TN")} DT pour ${profile.activite} (${risque})`,
        gravite: "haute",
        seuil: seuil3,
      });
    }
  }

  // ── Scénario 4 : Rachat élevé ─────────────────────────────────────────────
  if (profile.typeOperation === "rachat") {
    const seuil4 = SEUILS.ind4[groupe]?.[risque];
    if (seuil4 && profile.valeurRachat > seuil4) {
      alertes.push({
        id: 4,
        scenario: "Rachat Important",
        regle: `Valeur de rachat (${(profile.valeurRachat || 0).toLocaleString("fr-TN")} DT) > seuil ${seuil4.toLocaleString("fr-TN")} DT pour ${profile.activite} (${risque})`,
        gravite: "haute",
        seuil: seuil4,
      });
    }
  }

  // ── Scénario 5 : Augmentation de capital ──────────────────────────────────
  if (profile.typeOperation === "augmentation") {
    const ratio5 = SEUILS.ind5[groupe]?.[risque] || SEUILS.ind6[groupe];
    if (profile.augmentationCapital >= ratio5) {
      alertes.push({
        id: 5,
        scenario: "Augmentation de Capital Suspecte",
        regle: `Augmentation de capital (x${profile.augmentationCapital}) ≥ ratio ${ratio5} pour groupe ${groupe}`,
        gravite: "haute",
        seuil: ratio5,
      });
    }
  }

  // ── Scénario 6 : Rachat total ou partiel < 90 jours ───────────────────────
  if (profile.rachatMoins90j) {
    alertes.push({
      id: 6,
      scenario: "Rachat Précoce (< 90 jours)",
      regle: "Rachat total ou partiel demandé moins de 90 jours après la souscription",
      gravite: "critique",
    });
  }

  // ── Scénario 7 : Changement fréquent de bénéficiaire ─────────────────────
  if (profile.changementBeneficiaire) {
    alertes.push({
      id: 7,
      scenario: "Changement Fréquent de Bénéficiaire",
      regle: "≥ 3 modifications du bénéficiaire durant la vie du contrat",
      gravite: "moyenne",
    });
  }

  // ── Scénario 8 : Capital Bayti incohérent ─────────────────────────────────
  if (profile.baytIIcoherent) {
    const seuil8 = SEUILS.ind8[groupe];
    alertes.push({
      id: 8,
      scenario: "Capital Bayti Incohérent avec le Profil",
      regle: `Capital assuré Produit Bayti incohérent avec le profil client (${profile.activite}) — seuil référence : ${seuil8?.toLocaleString("fr-TN")} DT`,
      gravite: "haute",
    });
  }

  // ── Scénario 9 : Souscriptions multiples ──────────────────────────────────
  if (profile.souscriptionsMultiples) {
    alertes.push({
      id: 9,
      scenario: "Souscriptions Multiples sur Court Délai",
      regle: "≥ 3 contrats de vie ou capitalisation en vigueur sur une durée < 3 ans",
      gravite: "moyenne",
    });
  }

  // ── Scénario 10 : Paiement en espèces ────────────────────────────────────
  const seuil10 = SEUILS.ind10.seuil;
  if ((profile.paiementEspeces || 0) > seuil10) {
    alertes.push({
      id: 10,
      scenario: "Paiement en Espèces Élevé",
      regle: `Paiement en espèces (${(profile.paiementEspeces || 0).toLocaleString("fr-TN")} DT) > ${seuil10.toLocaleString("fr-TN")} DT`,
      gravite: "critique",
    });
  }

  return {
    alert: alertes.length > 0,
    alertes,
    groupe,
  };
}

// ─── ANCIENNE FONCTION : evaluerIndicateurs (backtesting complet) ──────────────

function genererResultat(id, alerte, gravite, label, regle, valeurs, seuil, detail = "") {
  return { id, alerte, gravite, label, regle, valeurs, seuil, detail };
}

export function evaluerIndicateurs(c) {
    const groupe = getGroupe(c.activite);
    let resultats = [];

    // Indicateur 1
    const ind1_alerte = c.produitVie && c.niveauRisqueElevé;
    resultats.push(genererResultat(1, ind1_alerte, 'moyenne', 'Produit Vie + Risque Élevé', 'Souscription produit de vie ET client classé à risque élevé', `Produit vie: ${c.produitVie}, Risque élevé: ${c.niveauRisqueElevé}`, 'Les 2 vrais', ''));

    // Indicateur 2 — Pays GAFI
    resultats.push(genererResultat(2, c.paysGafi, 'critique', 'Pays Liste GAFI', "Client est résident d'un pays sur la liste du GAFI", `Pays GAFI: ${c.paysGafi}`, 'Vrai', ''));

    // Indicateur 3 — Capital assuré
    const seuil3 = SEUILS.ind2[groupe]?.[c.niveauRisque];
    const ind3_alerte = c.typeOperation === 'souscription' && c.capitalAssure > seuil3;
    resultats.push(genererResultat(3, ind3_alerte, 'haute', 'Capital Assuré Élevé', 'Capital assuré > Seuil selon profil', `${c.capitalAssure?.toLocaleString('fr-TN')} DT`, `> ${seuil3?.toLocaleString('fr-TN')} DT`, `Groupe: ${groupe}, Risque: ${c.niveauRisque}`));

    // Indicateur 4 — Prime
    const seuil4 = SEUILS.ind3[groupe]?.[c.niveauRisque];
    const ind4_alerte = c.typeOperation === 'souscription' && c.prime > seuil4;
    resultats.push(genererResultat(4, ind4_alerte, 'moyenne', 'Prime Anormale', 'Prime versée > Seuil selon profil', `${c.prime?.toLocaleString('fr-TN')} DT`, `> ${seuil4?.toLocaleString('fr-TN')} DT`, `Groupe: ${groupe}, Risque: ${c.niveauRisque}`));

    // Indicateur 5 — Rachat
    const seuil5 = SEUILS.ind4[groupe]?.[c.niveauRisque];
    const ind5_alerte = c.typeOperation === 'rachat' && c.valeurRachat > seuil5;
    resultats.push(genererResultat(5, ind5_alerte, 'haute', 'Rachat Important', 'Valeur de rachat > Seuil selon profil', `${c.valeurRachat?.toLocaleString('fr-TN')} DT`, `> ${seuil5?.toLocaleString('fr-TN')} DT`, `Groupe: ${groupe}, Risque: ${c.niveauRisque}`));
    
    // Indicateur 6 — Augmentation capital
    const ratio6 = SEUILS.ind6[groupe];
    const ind6_alerte = c.augmentationCapital >= ratio6;
    resultats.push(genererResultat(6, ind6_alerte, 'haute', 'Augmentation de Capital', 'Augmentation de capital > Ratio selon profil', `Ratio: x${c.augmentationCapital}`, `> x${ratio6}`, `Groupe: ${groupe}`));

    // Indicateur 7 — Rachat précoce
    resultats.push(genererResultat(7, c.rachatMoins90j, 'critique', 'Rachat Précoce', 'Rachat demandé moins de 90 jours après la souscription', `Rachat < 90j: ${c.rachatMoins90j}`, 'Vrai', ''));

    // Indicateur 8 — Bénéficiaire pays risque
    resultats.push(genererResultat(8, c.beneficiairePaysRisque, 'critique', 'Bénéficiaire à Risque', 'Bénéficiaire est dans un pays à haut risque', `Bénéf. pays risque: ${c.beneficiairePaysRisque}`, 'Vrai', ''));

    // Indicateur 9 — Changement bénéficiaire
    resultats.push(genererResultat(9, c.changementBeneficiaire, 'moyenne', 'Changement de Bénéficiaire', 'Changements fréquents/injustifiés du bénéficiaire', `Chg bénéficiaire: ${c.changementBeneficiaire}`, 'Vrai', ''));

    // Indicateur 10 — Bayti incohérent
    resultats.push(genererResultat(10, c.baytIIcoherent, 'haute', 'Incohérence Bayti II', 'Capital souscrit pour Bayti II incohérent avec le profil', `Incohérence Bayti: ${c.baytIIcoherent}`, 'Vrai', ''));
    
    // Indicateur 11 — Souscriptions multiples
    resultats.push(genererResultat(11, c.souscriptionsMultiples, 'moyenne', 'Souscriptions Multiples', 'Souscriptions multiples sur une courte période', `Souscriptions mult.: ${c.souscriptionsMultiples}`, 'Vrai', ''));

    // Indicateur 12 — Paiement espèces
    const seuil12 = SEUILS.ind12.seuil;
    const ind12_alerte = c.paiementEspeces > seuil12;
    resultats.push(genererResultat(12, ind12_alerte, 'critique', 'Paiement en Espèces', 'Part du paiement en espèces > Seuil fixe', `${c.paiementEspeces?.toLocaleString('fr-TN')} DT`, `> ${seuil12?.toLocaleString('fr-TN')} DT`, ''));

    // Indicateur 13 — Plusieurs comptes
    resultats.push(genererResultat(13, c.plusieursComptes, 'moyenne', 'Comptes Multiples', 'Paiement via plusieurs comptes sans justification', `Comptes multiples: ${c.plusieursComptes}`, 'Vrai', ''));

    return resultats;
}
