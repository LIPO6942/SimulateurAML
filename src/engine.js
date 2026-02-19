// ─── MOTEUR DE RÈGLES LCB-FT ──────────────────────────────────────────────────

const GROUPE = {
  faible: ["élève", "etudiant", "étudiant", "sans profession", "travailleur indépendant", "travailleur independant"],
  moyen: ["salarié", "salarie", "fonctionnaire"],
  eleve: ["pm", "chef d'entreprise", "chef dentreprise", "profession libérale", "profession liberale"],
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
    faible: { "RM/RF": 50000, "RE": 30000 },
    moyen: { "RM/RF": 150000, "RE": 80000 },
    retraite: { "RM/RF": 200000, "RE": 160000 },
    eleve: { "RM/RF": 500000, "RE": 200000 },
  },
  // Indicateur 3 — Prime élevée à la souscription
  ind3: {
    faible: { "RM/RF": 1000, "RE": 400 },
    moyen: { "RM/RF": 2500, "RE": 1000 },
    retraite: { "RM/RF": 3000, "RE": 2000 },
    eleve: { "RM/RF": 6000, "RE": 3000 },
  },
  // Indicateur 4 — Rachat (valeur contrat)
  ind4: {
    faible: { "RM/RF": 20000, "RE": 10000 },
    moyen: { "RM/RF": 30000, "RE": 15000 },
    retraite: { "RM/RF": 50000, "RE": 30000 },
    eleve: { "RM/RF": 100000, "RE": 50000 },
  },
  // Indicateur 5 — Augmentation capital (Ratio basé sur le risque)
  ind5: {
    "RM/RF": 2,
    "RE": 1.25
  },
  // Indicateur 8 — Capital Bayti incohérent
  ind8: {
    faible: 400000,
    moyen: 800000,
    eleve: 1000000,
    retraite: 400000, // Mis à faible par défaut si non précisé
  },
  // Indicateur 10 — Paiement espèces
  ind10: {
    seuil: 5000
  }
}

// ─── NOUVELLE FONCTION : checkAlert ────────────────────────────────────────────
// Prend un profil simplifié et retourne toutes les alertes déclenchées

export function checkAlert(profile) {
  const groupe = getGroupe(profile.activite || "salarié");
  const risque = profile.niveauRisque || "RM/RF";
  const indicators = [];

  const genResult = (id, label, condition, regle, valeurs, seuil, gravite = "haute") => ({
    id,
    label,
    alerte: condition,
    regle,
    valeurs,
    seuil: typeof seuil === "number" ? seuil.toLocaleString("fr-TN") + " DT" : seuil,
    gravite
  });

  // 1. Pays GAFI
  indicators.push(genResult(1, "Pays Liste GAFI", !!profile.paysGafi,
    "Souscription d'un contrat par un client ressortissant d'un pays sur la liste du GAFI",
    `Pays GAFI: ${profile.paysGafi ? "Oui" : "Non"}`, "Vrai", "critique"));

  // 2. Capital Assuré Élevé
  const s2 = SEUILS.ind2[groupe]?.[risque];
  const is2 = (profile.typeOperation === "souscription" || profile.typeOperation === "augmentation") && profile.capitalAssure > s2;
  indicators.push(genResult(2, "Somme des capitaux assuré supérieur à", is2,
    `Capital assuré > seuil selon profil (${groupe} / ${risque})`,
    `${(profile.capitalAssure || 0).toLocaleString("fr-TN")} DT`, s2));

  // 3. Prime Élevée
  const s3 = SEUILS.ind3[groupe]?.[risque];
  const is3 = (profile.typeOperation === "souscription" || profile.typeOperation === "prime") && profile.prime > s3;
  indicators.push(genResult(3, "Prime supérieure à", is3,
    `Prime versée > seuil selon profil (${groupe} / ${risque})`,
    `${(profile.prime || 0).toLocaleString("fr-TN")} DT`, s3));

  // 4. Rachat Élevé
  const s4 = SEUILS.ind4[groupe]?.[risque];
  const is4 = profile.typeOperation === "rachat" && profile.valeurRachat > s4;
  indicators.push(genResult(4, "Rachat d'un contrat d'assurance vie", is4,
    `Valeur de rachat > seuil selon profil (${groupe} / ${risque})`,
    `${(profile.valeurRachat || 0).toLocaleString("fr-TN")} DT`, s4));

  // 5. Augmentation Capital
  const s5 = SEUILS.ind5[risque];
  const is5 = profile.typeOperation === "augmentation" && profile.augmentationCapital > s5;
  indicators.push(genResult(5, "Augmentation de la valeur des capitaux assurés", is5,
    `Augmentation de capital > ratio selon risque (${risque})`,
    `Ratio: x${profile.augmentationCapital || 0}`, `> ${s5}x`));

  // 6. Rachat Précoce
  indicators.push(genResult(6, "Rachat total ou partiel précoce", !!profile.rachatMoins90j,
    "Rachat demandé moins de 90 jours après la souscription",
    `Rachat < 90j: ${profile.rachatMoins90j ? "Oui" : "Non"}`, "< 90 jours", "critique"));

  // 7. Changement Bénéficiaire
  indicators.push(genResult(7, "Changement fréquent du bénéficiaire", !!profile.changementBeneficiaire,
    "≥ 3 modifications du bénéficiaire durant la vie du contrat",
    `Changements fréquents: ${profile.changementBeneficiaire ? "Oui" : "Non"}`, "≥ 3 fois", "moyenne"));

  // 8. Capital Bayti Incohérent
  const s8 = SEUILS.ind8[groupe];
  const is8 = !!profile.baytIIcoherent;
  indicators.push(genResult(8, "Capital assuré Produit Bayti incohérent", is8,
    `Incohérent avec profil (${groupe}) — Seuil ref: ${s8.toLocaleString("fr-TN")} DT`,
    `Incohérence: ${profile.baytIIcoherent ? "Oui" : "Non"}`, "Vrai"));

  // 9. Souscriptions Multiples
  indicators.push(genResult(9, "Souscriptions multiples court délai", !!profile.souscriptionsMultiples,
    "≥ 3 contrats de vie ou capitalisation en vigueur sur une durée < 3 ans",
    `Multiples: ${profile.souscriptionsMultiples ? "Oui" : "Non"}`, "≥ 3 contrats / 3 ans", "moyenne"));

  // 10. Paiement Espèces
  const s10 = SEUILS.ind10.seuil;
  const is10 = (profile.paiementEspeces || 0) > s10;
  indicators.push(genResult(10, "Paiement en espèce", is10,
    `Versement en espèces > seuil fixe`,
    `${(profile.paiementEspeces || 0).toLocaleString("fr-TN")} DT`, s10, "critique"));

  return {
    alert: indicators.some(i => i.alerte),
    alertes: indicators.filter(i => i.alerte),
    indicators,
    groupe,
  };
}

