// ─── MOTEUR DE RÈGLES LCB-FT ──────────────────────────────────────────────────

const GROUPE = {
  faible: ["élève", "etudiant", "étudiant", "sans profession", "travailleur indépendant", "travailleur independant"],
  moyen:  ["salarié", "salarie", "fonctionnaire"],
  eleve:  ["pm", "chef d'entreprise", "chef dentreprise", "profession libérale", "profession liberale"],
};

export function getGroupe(activite) {
   const a = activite.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
   if (GROUPE.faible.some(x => a.includes(x.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) return "faible";
   if (GROUPE.eleve.some(x => a.includes(x.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) return "eleve";
   return "moyen";
 }

 export const SEUILS = {
    ind3: {
        faible: { "!=": 50000, "RE": 30000 },
        moyen: { "!=": 150000, "RE": 40000 },
        eleve: { "!=": 500000, "RE": 200000 },
    },
    ind4: {
        faible: { "!=": 5000, "RE": 3000 },
        moyen: { "!=": 15000, "RE": 4000 },
        eleve: { "!=": 50000, "RE": 20000 },
    },
    ind5: {
        faible: { "!=": 25000, "RE": 15000 },
        moyen: { "!=": 75000, "RE": 20000 },
        eleve: { "!=": 250000, "RE": 100000 },
    },
    ind6: {
      "faible": 2,
      "moyen": 2,
      "eleve": 1.25
    },
    ind12: {
      seuil: 3000
    }
}

function genererResultat(id, alerte, gravite, label, regle, valeurs, seuil, detail = "") {
  return { id, alerte, gravite, label, regle, valeurs, seuil, detail };
}

export function evaluerIndicateurs(c) {
    const groupe = getGroupe(c.activite);
    let resultats = [];

    // Indicateur 1
    const ind1_alerte = c.produitVie && c.niveauRisqueElevé;
    resultats.push(genererResultat(1, ind1_alerte, 'moyenne', 'Produit Vie + Risque Élevé', 'Souscription produit de vie ET client classé à risque élevé', `Produit vie: ${c.produitVie}, Risque élevé: ${c.niveauRisqueElevé}`, 'Les 2 vrais', ''));

    // Indicateur 2
    resultats.push(genererResultat(2, c.paysGafi, 'critique', 'Pays Liste GAFI', "Client est résident d'un pays sur la liste du GAFI", `Pays GAFI: ${c.paysGafi}`, 'Vrai', ''));

    // Indicateur 3
    const seuil3 = SEUILS.ind3[groupe]?.[c.niveauRisque];
    const ind3_alerte = c.typeOperation === 'souscription' && c.capitalAssure > seuil3;
    resultats.push(genererResultat(3, ind3_alerte, 'haute', 'Capital Assuré Élevé', 'Capital assuré > Seuil selon profil', `${c.capitalAssure?.toLocaleString('fr-TN')} DT`, `> ${seuil3?.toLocaleString('fr-TN')} DT`, `Groupe: ${groupe}, Risque: ${c.niveauRisque}`));

    // Indicateur 4
    const seuil4 = SEUILS.ind4[groupe]?.[c.niveauRisque];
    const ind4_alerte = c.typeOperation === 'souscription' && c.prime > seuil4;
    resultats.push(genererResultat(4, ind4_alerte, 'moyenne', 'Prime Anormale', 'Prime versée > Seuil selon profil', `${c.prime?.toLocaleString('fr-TN')} DT`, `> ${seuil4?.toLocaleString('fr-TN')} DT`, `Groupe: ${groupe}, Risque: ${c.niveauRisque}`));

    // Indicateur 5
    const seuil5 = SEUILS.ind5[groupe]?.[c.niveauRisque];
    const ind5_alerte = c.typeOperation === 'rachat' && c.valeurRachat > seuil5;
    resultats.push(genererResultat(5, ind5_alerte, 'haute', 'Rachat Important', 'Valeur de rachat > Seuil selon profil', `${c.valeurRachat?.toLocaleString('fr-TN')} DT`, `> ${seuil5?.toLocaleString('fr-TN')} DT`, `Groupe: ${groupe}, Risque: ${c.niveauRisque}`));
    
    // Indicateur 6
    const ratio6 = SEUILS.ind6[groupe];
    const ind6_alerte = c.augmentationCapital >= ratio6;
    resultats.push(genererResultat(6, ind6_alerte, 'haute', 'Augmentation de Capital', 'Augmentation de capital > Ratio selon profil', `Ratio: x${c.augmentationCapital}`, `> x${ratio6}`, `Groupe: ${groupe}`));

    // Indicateur 7
    resultats.push(genererResultat(7, c.rachatMoins90j, 'critique', 'Rachat Précoce', 'Rachat demandé moins de 90 jours après la souscription', `Rachat < 90j: ${c.rachatMoins90j}`, 'Vrai', ''));

    // Indicateur 8
    resultats.push(genererResultat(8, c.beneficiairePaysRisque, 'critique', 'Bénéficiaire à Risque', 'Bénéficiaire est dans un pays à haut risque', `Bénéf. pays risque: ${c.beneficiairePaysRisque}`, 'Vrai', ''));

    // Indicateur 9
    resultats.push(genererResultat(9, c.changementBeneficiaire, 'moyenne', 'Changement de Bénéficiaire', 'Changements fréquents/injustifiés du bénéficiaire', `Chg bénéficiaire: ${c.changementBeneficiaire}`, 'Vrai', ''));

    // Indicateur 10
    resultats.push(genererResultat(10, c.baytIIcoherent, 'haute', 'Incohérence Bayti II', 'Capital souscrit pour Bayti II incohérent avec le profil', `Incohérence Bayti: ${c.baytIIcoherent}`, 'Vrai', ''));
    
    // Indicateur 11
    resultats.push(genererResultat(11, c.souscriptionsMultiples, 'moyenne', 'Souscriptions Multiples', 'Souscriptions multiples sur une courte période', `Souscriptions mult.: ${c.souscriptionsMultiples}`, 'Vrai', ''));

    // Indicateur 12
    const seuil12 = SEUILS.ind12.seuil;
    const ind12_alerte = c.paiementEspeces > seuil12;
    resultats.push(genererResultat(12, ind12_alerte, 'critique', 'Paiement en Espèces', 'Part du paiement en espèces > Seuil fixe', `${c.paiementEspeces?.toLocaleString('fr-TN')} DT`, `> ${seuil12?.toLocaleString('fr-TN')} DT`, ''));

    // Indicateur 13
    resultats.push(genererResultat(13, c.plusieursComptes, 'moyenne', 'Comptes Multiples', 'Paiement via plusieurs comptes sans justification', `Comptes multiples: ${c.plusieursComptes}`, 'Vrai', ''));

    return resultats;
}
