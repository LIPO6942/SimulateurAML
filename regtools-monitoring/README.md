# RegTools — Monitoring LCB-FT

Application de simulation et backtesting des 13 indicateurs de monitoring réglementaire (LCB-FT) pour le secteur assurance.

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
├── engine.js     → Moteur de règles LCB-FT (13 indicateurs)
├── data.js       → Données exemples et valeurs par défaut
└── styles.css    → Styles globaux
```

## Les 13 indicateurs

| # | Indicateur | Type |
|---|-----------|------|
| 1 | Souscription produit Vie + risque élevé | Booléen |
| 2 | Client pays liste GAFI | Booléen |
| 3 | Capital assuré > seuil selon profil | Seuil dynamique |
| 4 | Prime > seuil selon profil | Seuil dynamique |
| 5 | Valeur rachat > seuil selon profil | Seuil dynamique |
| 6 | Augmentation capitaux > ratio (×2 ou ×1.25) | Ratio |
| 7 | Rachat < 90 jours | Booléen |
| 8 | Bénéficiaire pays risque élevé | Booléen |
| 9 | Changement fréquent bénéficiaire | Booléen |
| 10 | Capital Bayti incohérent avec profil | Booléen |
| 11 | Souscriptions multiples court délai | Booléen |
| 12 | Paiement espèces > 3 000 DT | Seuil fixe |
| 13 | Paiement via plusieurs comptes | Booléen |

## Seuils dynamiques (ind. 3, 4, 5)

Les seuils varient selon le **groupe d'activité** et le **niveau de risque** :

| Groupe | Activités | Capital != RE | Capital RE |
|--------|-----------|--------------|------------|
| Faible | Élève, étudiant, sans profession, indépendant | 50 000 DT | 30 000 DT |
| Moyen  | Salarié, fonctionnaire | 150 000 DT | 40 000 DT |
| Élevé  | PM, chef d'entreprise, profession libérale | 500 000 DT | 200 000 DT |

## Modifier les règles

Toutes les règles métier sont dans `src/engine.js`. Pour ajuster un seuil, modifiez l'objet `SEUILS`. Pour ajouter un indicateur, ajoutez un bloc dans la fonction `evaluerIndicateurs()`.
