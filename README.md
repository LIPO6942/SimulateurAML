# RegTools — Monitoring LCB-FT

Application de simulation et backtesting des 10 scénarios de monitoring réglementaire (LCB-FT) pour le secteur assurance.

## Démarrage rapide

```bash
# Installer les dépendances
npm install

# Lancer en mode développement
npm run dev

# Build de production
npm run build
```

## Structure du projet

```
src/
├── main.jsx      → Point d'entrée React
├── App.jsx       → Composant principal (UI + navigation)
├── engine.js     → Moteur de règles LCB-FT (10 scénarios)
├── data.js       → Données exemples et valeurs par défaut
└── styles.css    → Styles globaux
```

## Les 10 Scénarios

| # | Scénario | Gravité |
|---|----------|---------|
| 1 | Pays Liste GAFI | Critique |
| 2 | Somme des capitaux assuré supérieur à | Haute |
| 3 | Prime supérieure à | Haute |
| 4 | Rachat d'un contrat d'assurance vie | Haute |
| 5 | Augmentation de la valeur des capitaux assurés | Haute |
| 6 | Rachat total ou partiel précoce (< 90j) | Critique |
| 7 | Changement fréquent du bénéficiaire | Moyenne |
| 8 | Capital assuré Produit Bayti incohérent | Haute |
| 9 | Souscriptions multiples court délai | Moyenne |
| 10 | Paiement en espèce (> 5 000 DT) | Critique |

## Seuils dynamiques (Sen. 2, 3, 4)

Les seuils varient selon le **groupe d'activité** et le **niveau de risque** (RM/RF vs RE) :

| Groupe | Activités | Risque RM/RF | Risque RE |
|--------|-----------|--------------|-----------|
| Faible | Élève, étudiant, sans profession, indépendant | 50 000 DT | 30 000 DT |
| Moyen  | Salarié, fonctionnaire | 150 000 DT | 80 000 DT |
| Retraité | Retraité | 200 000 DT | 160 000 DT |
| Élevé  | PM, chef d'entreprise, profession libérale | 500 000 DT | 200 000 DT |

## Modifier les règles

Toutes les règles métier sont dans `src/engine.js`. Pour ajuster un seuil, modifiez l'objet `SEUILS`. Pour modifier un scénario, intervenez dans la fonction `checkAlert()`.
