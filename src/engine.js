// ─── MOTEUR DE RÈGLES LCB-FT ──────────────────────────────────────────────────

const GROUPE = {
  faible: ["élève", "etudiant", "étudiant", "sans profession", "travailleur indépendant", "travailleur independant"],
  moyen:  ["salarié", "salarie", "fonctionnaire"],
  elevé:  ["pm", "chef d'entreprise", "chef dentreprise", "profession libérale", "profession liberale"],
};

export function getGroupe(activite) {
  const a = activite.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (GROUPE.faible.some(x => a.includes(x.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) return "faible";
  if (GROUPE.elevé.some(x => a.includes(x.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) return "elevé";
  return "moyen";
}

export const SEUILS = {
  ind3: {
    faible: { "!= RE": 50000,  "RE": 30000  },
    moyen:  { "!= RE": 150000, "RE": 40000  },
    elevé:  { "!= RE": 500000, "RE": 200000 },
  },
  ind4: {
    faible: { "!= RE": 1000, "RE": 400  },
    moyen:  { "!= RE": 2500, "RE": 1000 },
    elevé:  { "!= RE": 6000, "RE": 3000 },
  },
  ind5: {
    faible: { "!= RE": 20000,  "RE": 10000 },
    moyen:  { "!= RE": 30000,  "RE": 15000 },
    elevé:  { "!= RE": 100000, "RE": 50000 },
  },
  ind6: { "!= RE": 2, "RE": 1.25 },
};

export function evaluerIndicateurs(c) {
  const groupe = getGroupe(c.activite);
  const re = c.niveauRisque;
  const fmt = (n) => n.toLocaleString("fr-TN") + " DT";
  const results = [];

  // IND 1 — Souscription produit Vie + risque élevé
  const i1 = c.typeOperation === "souscription" && c.produitVie && c.niveauRisqueElevé;
  results.push({
    id: 1,
    label: "Souscription contrat Vie par client à risque élevé",
    regle: "Opération = Souscription ET Produit = Vie ET Niveau risque = Élevé",
    valeurs: `Produit Vie: ${c.produitVie ? "Oui" : "Non"} | Risque élevé: ${c.niveauRisqueElevé ? "Oui" : "Non"}`,
    seuil: "Tout cas vérifié → alerte",
    alerte: i1,
    gravite: "haute",
    detail: i1 ? "Conditions réunies → ALERTE" : "Conditions non réunies → OK",
  });

  // IND 2 — Pays GAFI
  results.push({
    id: 2,
    label: "Client ressortissant d'un pays liste GAFI",
    regle: "Nationalité ou résidence dans un pays liste GAFI",
    valeurs: `Pays GAFI: ${c.paysGafi ? "Oui" : "Non"}`,
    seuil: "Tout client GAFI → alerte",
    alerte: c.paysGafi,
    gravite: "critique",
    detail: c.paysGafi ? "Client GAFI → ALERTE" : "Hors GAFI → OK",
  });

  // IND 3 — Capital assuré
  if (c.typeOperation === "souscription") {
    const seuil = SEUILS.ind3[groupe][re];
    const a = c.capitalAssure > seuil;
    results.push({
      id: 3,
      label: "Capital assuré supérieur au seuil selon profil",
      regle: `Souscription + Capital > seuil (groupe: ${groupe}, risque: ${re})`,
      valeurs: `Capital saisi: ${fmt(c.capitalAssure)}`,
      seuil: `Seuil: ${fmt(seuil)}`,
      alerte: a,
      gravite: re === "RE" ? "haute" : "critique",
      detail: `${fmt(c.capitalAssure)} ${a ? ">" : "≤"} ${fmt(seuil)} → ${a ? "ALERTE" : "OK"}`,
    });
  }

  // IND 4 — Prime
  if (c.typeOperation === "souscription") {
    const seuil = SEUILS.ind4[groupe][re];
    const a = c.prime > seuil;
    results.push({
      id: 4,
      label: "Prime supérieure au seuil selon profil",
      regle: `Souscription + Prime > seuil (groupe: ${groupe}, risque: ${re})`,
      valeurs: `Prime saisie: ${fmt(c.prime)}`,
      seuil: `Seuil: ${fmt(seuil)}`,
      alerte: a,
      gravite: re === "RE" ? "haute" : "critique",
      detail: `${fmt(c.prime)} ${a ? ">" : "≤"} ${fmt(seuil)} → ${a ? "ALERTE" : "OK"}`,
    });
  }

  // IND 5 — Rachat
  if (c.typeOperation === "rachat") {
    const seuil = SEUILS.ind5[groupe][re];
    const a = c.valeurRachat > seuil;
    results.push({
      id: 5,
      label: "Valeur rachat supérieure au seuil selon profil",
      regle: `Rachat + Valeur > seuil (groupe: ${groupe}, risque: ${re})`,
      valeurs: `Valeur rachat: ${fmt(c.valeurRachat)}`,
      seuil: `Seuil: ${fmt(seuil)}`,
      alerte: a,
      gravite: re === "RE" ? "haute" : "critique",
      detail: `${fmt(c.valeurRachat)} ${a ? ">" : "≤"} ${fmt(seuil)} → ${a ? "ALERTE" : "OK"}`,
    });
  }

  // IND 6 — Augmentation capitaux
  if (c.augmentationCapital > 0) {
    const seuil = SEUILS.ind6[re];
    const a = c.augmentationCapital > seuil;
    results.push({
      id: 6,
      label: "Augmentation des capitaux assurés",
      regle: `Ratio augmentation > ×${seuil} (risque: ${re})`,
      valeurs: `Ratio: ×${c.augmentationCapital}`,
      seuil: `Seuil: ×${seuil}`,
      alerte: a,
      gravite: "haute",
      detail: `×${c.augmentationCapital} ${a ? ">" : "≤"} ×${seuil} → ${a ? "ALERTE" : "OK"}`,
    });
  }

  // IND 7 — Rachat < 90 jours
  results.push({
    id: 7,
    label: "Rachat total ou partiel < 90 jours",
    regle: "Rachat < 90 jours après souscription",
    valeurs: `Rachat < 90j: ${c.rachatMoins90j ? "Oui" : "Non"}`,
    seuil: "90 jours",
    alerte: c.rachatMoins90j,
    gravite: "haute",
    detail: c.rachatMoins90j ? "Délai < 90j → ALERTE" : "Délai ≥ 90j → OK",
  });

  // IND 8 — Bénéficiaire pays risque élevé
  results.push({
    id: 8,
    label: "Bénéficiaire dans un pays à risque élevé",
    regle: "Bénéficiaire résident d'un pays à risque élevé",
    valeurs: `Bénéficiaire pays risque: ${c.beneficiairePaysRisque ? "Oui" : "Non"}`,
    seuil: "Tout bénéficiaire pays risque",
    alerte: c.beneficiairePaysRisque,
    gravite: "critique",
    detail: c.beneficiairePaysRisque ? "Bénéficiaire pays risque → ALERTE" : "Bénéficiaire hors zone risque → OK",
  });

  // IND 9 — Changement fréquent bénéficiaire
  results.push({
    id: 9,
    label: "Changement fréquent du bénéficiaire",
    regle: "Modifications répétées du bénéficiaire désigné",
    valeurs: `Changement fréquent: ${c.changementBeneficiaire ? "Oui" : "Non"}`,
    seuil: "Tout changement fréquent",
    alerte: c.changementBeneficiaire,
    gravite: "haute",
    detail: c.changementBeneficiaire ? "Changements fréquents → ALERTE" : "Stabilité bénéficiaire → OK",
  });

  // IND 10 — Bayti incohérent
  results.push({
    id: 10,
    label: "Capital Bayti incohérent avec profil client",
    regle: "Capital produit Bayti ne correspond pas au profil socioéconomique",
    valeurs: `Incohérence Bayti: ${c.baytIIcoherent ? "Oui" : "Non"}`,
    seuil: "Incohérence détectée",
    alerte: c.baytIIcoherent,
    gravite: "moyenne",
    detail: c.baytIIcoherent ? "Incohérence détectée → ALERTE" : "Profil cohérent → OK",
  });

  // IND 11 — Souscriptions multiples
  results.push({
    id: 11,
    label: "Souscriptions multiples en court délai",
    regle: "Plusieurs souscriptions dans un court intervalle de temps",
    valeurs: `Souscriptions multiples: ${c.souscriptionsMultiples ? "Oui" : "Non"}`,
    seuil: "Toute multiplicité",
    alerte: c.souscriptionsMultiples,
    gravite: "haute",
    detail: c.souscriptionsMultiples ? "Multiplicité détectée → ALERTE" : "Souscription unique → OK",
  });

  // IND 12 — Paiement espèces
  const seuil12 = 3000;
  const a12 = c.paiementEspeces > seuil12;
  results.push({
    id: 12,
    label: "Paiement en espèces > 3 000 DT",
    regle: "Règlement cash supérieur au plafond légal",
    valeurs: `Espèces: ${fmt(c.paiementEspeces)}`,
    seuil: `Plafond: ${fmt(seuil12)}`,
    alerte: a12,
    gravite: "critique",
    detail: `${fmt(c.paiementEspeces)} ${a12 ? ">" : "≤"} ${fmt(seuil12)} → ${a12 ? "ALERTE" : "OK"}`,
  });

  // IND 13 — Plusieurs comptes
  results.push({
    id: 13,
    label: "Paiement via plusieurs comptes bancaires",
    regle: "Fragmentation du paiement sur plusieurs comptes",
    valeurs: `Plusieurs comptes: ${c.plusieursComptes ? "Oui" : "Non"}`,
    seuil: "Fragmentation détectée",
    alerte: c.plusieursComptes,
    gravite: "moyenne",
    detail: c.plusieursComptes ? "Fragmentation détectée → ALERTE" : "Compte unique → OK",
  });

  return results;
}
