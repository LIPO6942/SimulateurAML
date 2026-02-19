// ─── GROQ AI SERVICE — Smart-AML Decision Support ──────────────────────────
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `Rôle et Expertise :
Tu es l'Expert Principal en Conformité LBA/FT de la MAE Assurances (Tunisie). Ta mission est d'analyser les données clients/transactions via la fonctionnalité "Smart-AML Decision Support" pour déterminer la nécessité d'une Déclaration de Soupçon (DS) et rédiger l'argumentaire juridique associé.

Référentiel Juridique (Base de Connaissances) :
Tes analyses doivent être fondées sur :
- Loi n°2015-26 (modifiée par la loi 2019-09) relative à la LBA/FT en Tunisie.
- Règlement du CGA n°2019-02 (Vigilance dans le secteur des assurances).
- Manuel de Procédures MAE-AML v1 (2024) et Lignes Directrices du CGA (2023/2025).

Instructions de Rédaction (Format Narratif goAML) :
Si une déclaration est recommandée, tu dois obligatoirement générer un champ analyse_detaillee_goaml de plus de 200 mots. Ce texte doit être rédigé de manière professionnelle et structuré comme suit :
- Exposé des faits : Description factuelle du client et de la transaction (qui, quoi, où, comment).
- Analyse de la suspicion : Explication des raisons du soupçon (incohérence revenus/primes, comportement suspect, seuils cash dépassés, etc.).
- Qualification juridique : Citation explicite des articles de loi et des typologies de blanchiment spécifiques au secteur des assurances.

Format de Sortie (JSON Uniquement) :
Tu dois répondre UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ou après. Le format est :
{
  "fonctionnalite": "Smart-AML Decision Support",
  "verdict": {
    "decision": "OUI_A_LA_CTAF" | "OUI_A_LA_CNLCT" | "INVESTIGATION_REQUISE" | "NON",
    "niveau_risque": "FAIBLE" | "MOYEN" | "ELEVE" | "CRITIQUE"
  },
  "motif_officiel_goaml": "Catégorie exacte selon la nomenclature CTAF",
  "analyse_detaillee_goaml": "ICI LE TEXTE DE PLUS DE 200 MOTS...",
  "references_reglementaires": ["..."],
  "actions_immediates": ["..."]
}

Contraintes techniques :
- Langue : Français juridique formel.
- Objectif : Fournir un texte prêt à être copié-collé dans le portail web de la CTAF.`;

/**
 * Construit le message utilisateur à partir des données client et des alertes.
 */
function buildUserMessage(clientData, alertResults) {
    const alertList = alertResults.alertes && alertResults.alertes.length > 0
        ? alertResults.alertes.map(a =>
            `  - Scénario ${a.id} (${a.label}) — Gravité: ${a.gravite} — Valeur: ${a.valeurs} — Seuil: ${a.seuil}`
        ).join("\n")
        : "  Aucune alerte déclenchée.";

    const allIndicators = alertResults.indicators
        ? alertResults.indicators.map(i =>
            `  [${i.alerte ? "⚠️ ALERTE" : "✅ OK"}] S${i.id}: ${i.label} — ${i.valeurs} (seuil: ${i.seuil})`
        ).join("\n")
        : "";

    return `Analyse le profil client suivant et génère le rapport Smart-AML :

--- PROFIL CLIENT ---
Nom: ${clientData.prenom ? clientData.prenom + ' ' : ''}${clientData.nom || 'Non renseigné'}
Pays: ${clientData.pays || 'Non renseigné'}
Activité: ${clientData.activite || 'Non renseigné'}
Niveau de risque LCB: ${clientData.niveauRisque || 'Non renseigné'}
Type d'opération: ${clientData.typeOperation || 'Non renseigné'}
Capital assuré: ${clientData.capitalAssure?.toLocaleString('fr-TN') || 0} DT
Prime versée: ${clientData.prime?.toLocaleString('fr-TN') || 0} DT
Valeur de rachat: ${clientData.valeurRachat?.toLocaleString('fr-TN') || 0} DT
Augmentation de capital: ${clientData.augmentationCapital?.toLocaleString('fr-TN') || 0} DT
Paiement en espèces: ${clientData.paiementEspeces?.toLocaleString('fr-TN') || 0} DT
Date de souscription: ${clientData.dateSouscription || 'N/A'}
Date de l'opération: ${clientData.dateOperation || 'N/A'}
Nb contrats actifs (< 3 ans): ${clientData.nbContrats3Ans || 0}
Changement de bénéficiaire: ${clientData.changementBeneficiaire ? 'Oui' : 'Non'}
Incohérence Bayt II: ${clientData.baytIIcoherent ? 'Oui' : 'Non'}
Groupe d'activité: ${alertResults.groupe || 'N/A'}

--- ALERTES DÉCLENCHÉES ---
${alertList}

--- TOUS LES INDICATEURS ---
${allIndicators}

Génère le rapport JSON complet.`;
}

/**
 * Appelle l'API Groq pour générer le rapport Smart-AML.
 */
export async function generateAMLReport(clientData, alertResults) {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY;
    if (!apiKey) {
        throw new Error("Clé API Groq manquante. Vérifiez que VITE_GROQ_API_KEY est configurée dans vos variables d'environnement.");
    }

    const userMessage = buildUserMessage(clientData, alertResults);

    const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userMessage },
            ],
            temperature: 0,
            max_tokens: 4096,
            response_format: { type: "json_object" },
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Erreur Groq API (${response.status}): ${err}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
        throw new Error("Réponse vide de l'API Groq.");
    }

    try {
        return JSON.parse(content);
    } catch {
        throw new Error("Réponse JSON invalide de l'API Groq.");
    }
}
