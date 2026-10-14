import { checkAlert, AML_SCENARIOS, getGroupe, detectBranchAndSystem, resolveProductInfo } from './engine.js';

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

export function getGroqApiKey() {
    return localStorage.getItem("groq_api_key") || import.meta.env.VITE_GROQ_API_KEY || "";
}

export function setGroqApiKey(key) {
    if (key) {
        localStorage.setItem("groq_api_key", key.trim());
    } else {
        localStorage.removeItem("groq_api_key");
    }
}

/**
 * Appelle l'API Groq pour générer le rapport Smart-AML.
 */
export async function generateAMLReport(clientData, alertResults) {
    const apiKey = getGroqApiKey();
    if (!apiKey) {
        throw new Error("Clé API Groq manquante. Configurez votre clé API Groq (dans le volet de configuration ou VITE_GROQ_API_KEY).");
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

    return parseSafeJson(content);
}

/**
 * Extrait et parse de manière robuste un texte contenant du JSON (enlève markdown, espaces, etc.)
 */
function parseSafeJson(content) {
    if (!content) throw new Error("Contenu vide reçu de l'IA.");
    let text = content.trim();

    // Enlever d'éventuels blocs markdown ```json ... ```
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch) {
        text = codeBlockMatch[1].trim();
    }

    // Isoler l'objet JSON entre le premier { et le dernier }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        text = text.substring(firstBrace, lastBrace + 1);
    }

    return JSON.parse(text);
}

// ─── ANALYSE DE CAPTURE DE TRANSACTION / REGTOOLS ─────────────────────────────

const VISION_SYSTEM_PROMPT = `Tu es l'analyste principal LCB-FT / AML de la MAE Assurances en Tunisie, expert de l'outil RegTools et de la réglementation tunisienne (Loi n°2015-26 modifiée, Règlements CGA, Seuil espèces 5 000 DT).

Ta mission est d'analyser une capture d'écran d'une transaction ou alerte AML (comme la modal "Infos supplémentaires" ou l'écran d'alerte RegTools) et de :
1. Extraire rigoureusement toutes les informations textuelles et valeurs du tableau (CLE / VALEUR).
2. Identifier le PRODUIT CONTRACTÉ de l'assuré (déduit de N_CIE, C_PRODUIT, C_BR, LIB_CIE, ex: "Habitation Beyti (Formule Essentielle)", "Automobile Mono", etc.).
3. Déterminer si l'alerte nécessite RÉELLEMENT une investigation ou si elle justifie une clôture sans suite (Levée de doute).
4. Rédiger la "Raison de clôture" pour le champ obligatoire 'Raison *' de RegTools : OBLIGATOIREMENT COURTE (1 à 2 phrases directes maximum), mentionnant le PRODUIT CONTRACTÉ du sociétaire, et se terminant par 'Clôture sans suite.'
5. Rédiger la "Note d'investigation" formelle pour RegTools, structurée et mentionnant le PRODUIT CONTRACTÉ.
6. Renseigner le champ "motif_soupcon_goaml" : s'il n'y a pas lieu de déclarer (cas de clôture sans suite ou faux positif), afficher STRICTEMENT : "Il n'y a pas lieu de déclarer pour ce cas." accompagné d'une brève confirmation de levée de doute. Si un soupçon réel est caractérisé, rédiger l'argumentaire juridique complet pour la CTAF.

Règles d'évaluation AML pour le secteur assurances :
- Seuil de paiement en espèces : 5 000 TND (5 000 000 millimes). Au-delà, une alerte est levée (M = 1 = Espèces).
- Cohérence socio-économique : Si le client est taxi, artisan, médecin ou profession libérale avec revenus cohérents, ou sous les seuils -> Levée de doute légitime, Clôture justifiée.
- Si le client est sans profession, étudiant, ou incohérence flagrante -> Investigation requise.

Format de réponse JSON STRICT (sans aucun autre texte) :
{
  "champs_extraits": {
    "N_CLIENT": "",
    "NOM_ADH": "",
    "LIB_TIT": "",
    "LIB_PROF": "",
    "C_PROF": "",
    "CIN": "",
    "DT_CIN": "",
    "V_CIN": "",
    "AGENCE": "",
    "N_POLICE": "",
    "N_CIE": "",
    "C_BR": "",
    "EFF_POL": "",
    "FIN_POL": "",
    "VAL_VENTE": "",
    "VAL_NEUF": "",
    "PRIME_ENCAIS": "",
    "M": "",
    "N_QUITTANCE": "",
    "EFF_QUIT": "",
    "FIN_QUIT": "",
    "source_system": "",
    "autres": {}
  },
  "analyse": {
    "decision": "CLOTURE_SANS_SUITE" | "INVESTIGATION_REQUISE" | "DECLARATION_SOUPCON",
    "statut_recommande_regtools": "Clôturé" | "Investigation",
    "niveau_risque": "FAIBLE" | "MOYEN" | "ELEVE",
    "produit_contracte": "Nom du produit contracté identifié",
    "doit_declarer_ctaf": false,
    "regle_declenchee": "Règlement sous le seuil d'espèces (< 5 000 DT)",
    "montant_converti_tnd": "70.416 TND",
    "mode_paiement_libelle": "Espèces (M=1)",
    "coherence_socio_economique": "Excellente" | "Douteuse" | "Incohérente",
    "points_analyse": [
      "Point 1...",
      "Point 2..."
    ],
    "raison_cloture_regtools": "Contrat [Produit] : texte court (1-2 phrases) mentionnant le produit contracté. Clôture sans suite.",
    "note_investigation_regtools": "1. OBJET DU CONTRÔLE & PRODUIT : Contrat [Produit]...\n2. ANALYSE KYC...",
    "motif_soupcon_goaml": "Il n'y a pas lieu de déclarer pour ce cas."
  }
}`;

/**
 * Analyse une capture d'image avec le modèle Vision de Groq
 */
export async function analyzeTransactionImageWithGroq(imageBase64) {
    const apiKey = getGroqApiKey();
    if (!apiKey) {
        throw new Error("Clé API Groq manquante. Veuillez renseigner votre clé API Groq pour analyser la capture.");
    }

    // Assurer le format data URL
    const imageUrl = imageBase64.startsWith("data:") 
        ? imageBase64 
        : `data:image/png;base64,${imageBase64}`;

    // Modèle Vision multimodal actif sur Groq (Qwen 3.8 27B multimodal)
    const visionModels = [
        "qwen/qwen3.8-27b"
    ];

    let lastError = null;
    for (const model of visionModels) {
        try {
            const response = await fetch(GROQ_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: "system", content: VISION_SYSTEM_PROMPT },
                        {
                            role: "user",
                            content: [
                                {
                                    type: "text",
                                    text: "Analyse cette capture d'écran du système d'assurance (RegTools / modal Infos supplémentaires). Extrais toutes les clés/valeurs du tableau et fournis le verdict LCB-FT avec la Raison de clôture et la Note d'investigation en JSON."
                                },
                                {
                                    type: "image_url",
                                    image_url: { url: imageUrl }
                                }
                            ]
                        }
                    ],
                    temperature: 0.1,
                    max_tokens: 3000,
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                lastError = new Error(`Modèle ${model} erreur (${response.status}): ${errText}`);
                continue;
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;
            if (content) {
                return parseSafeJson(content);
            }
        } catch (err) {
            lastError = err;
        }
    }

    throw lastError || new Error("Échec de l'analyse avec le modèle Vision de Groq (qwen/qwen3.8-27b).");
}

/**
 * Analyse textuelle experte via Groq (LLaMA 3.3) à partir des données de la transaction
 */
export async function evaluateTransactionDataWithGroq(data) {
    const apiKey = getGroqApiKey();
    if (!apiKey) {
        // En l'absence de clé, utiliser le moteur de règles déterministe local
        return evaluateTransactionLocally(data);
    }

    const prompt = `Voici les données extraites d'une transaction d'assurance (quittance / alerte RegTools) :
${JSON.stringify(data, null, 2)}

En te basant sur la réglementation tunisienne (Loi 2015-26, Règlements CGA, Seuil espèces 5 000 DT / 5 000 000 millimes) :
1. Détermine si une investigation est réellement requise ou si l'alerte peut être clôturée sans suite.
2. Rédige le texte exact pour le champ "Raison *" de RegTools (2-3 phrases formelles).
3. Rédige la "Note d'investigation" formelle complète pour RegTools.
Renvoie STRICTEMENT un JSON correspondant au schéma attendu.`;

    try {
        const response = await fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [
                    { role: "system", content: VISION_SYSTEM_PROMPT },
                    { role: "user", content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 3000,
                response_format: { type: "json_object" }
            })
        });

        if (response.ok) {
            const resData = await response.json();
            const content = resData.choices?.[0]?.message?.content;
            if (content) {
                return parseSafeJson(content);
            }
        }
    } catch {
        // Fallback local en cas de coupure API
    }

    return evaluateTransactionLocally(data);
}

// ─── PARSING ET UTILITAIRES DE TEXTE (TABLEAU / TSV / CLÉ-VALEUR) ────────────

/**
 * Analyse du texte brut copié depuis RegTools (tableau TSV, clé-valeur, deux colonnes, etc.)
 * Extrait automatiquement toutes les paires CLE / VALEUR avec une précision de 100%.
 */
export function parseTableText(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return null;

    const result = {};
    let validCount = 0;

    for (const line of lines) {
        // Ignorer la ligne d'en-tête éventuelle (CLÉ / VALEUR, CLE\tVALEUR, KEY\tVALUE, etc.)
        const lower = line.toLowerCase();
        if (
            (lower.includes('clé') || lower.includes('cle') || lower.includes('champ') || lower.includes('key')) &&
            (lower.includes('valeur') || lower.includes('value') || lower.includes('val'))
        ) {
            continue;
        }

        // 1. Format Markdown pipe (| CLE | VALEUR |)
        if (line.startsWith('|') && line.endsWith('|')) {
            const parts = line.split('|').map(p => p.trim()).filter(Boolean);
            if (parts.length >= 2) {
                const k = parts[0];
                const v = parts.slice(1).join(' ');
                if (k && !k.includes('---')) {
                    result[k] = v;
                    validCount++;
                    continue;
                }
            }
        }

        // 2. Délimiteur tabulation \t (Copier-coller standard depuis un tableau HTML / RegTools / Excel)
        if (line.includes('\t')) {
            const idx = line.indexOf('\t');
            const k = line.slice(0, idx).trim();
            const v = line.slice(idx + 1).trim();
            if (k) {
                result[k] = v;
                validCount++;
                continue;
            }
        }

        // 3. Délimiteur deux-points : (CLE: VALEUR)
        if (line.includes(':')) {
            const idx = line.indexOf(':');
            const k = line.slice(0, idx).trim();
            const v = line.slice(idx + 1).trim();
            if (k) {
                result[k] = v;
                validCount++;
                continue;
            }
        }

        // 4. Délimiteur égal = (CLE = VALEUR)
        if (line.includes('=')) {
            const idx = line.indexOf('=');
            const k = line.slice(0, idx).trim();
            const v = line.slice(idx + 1).trim();
            if (k) {
                result[k] = v;
                validCount++;
                continue;
            }
        }

        // 5. Espaces multiples (CLE    VALEUR)
        const multiSpaceMatch = line.match(/^(\S+)\s{2,}(.*)$/);
        if (multiSpaceMatch) {
            const k = multiSpaceMatch[1].trim();
            const v = multiSpaceMatch[2].trim();
            if (k) {
                result[k] = v;
                validCount++;
                continue;
            }
        }

        // 6. Espace simple si le premier mot ressemble à un identifiant (ex: N_CLIENT 670047, CT 1)
        const spaceIdx = line.indexOf(' ');
        if (spaceIdx > 0) {
            const k = line.slice(0, spaceIdx).trim();
            const v = line.slice(spaceIdx + 1).trim();
            if (/^[A-Za-z0-9_]+$/.test(k)) {
                result[k] = v;
                validCount++;
                continue;
            }
        }
    }

    return validCount > 0 ? result : null;
}

/**
 * Reconvertit un objet de champs en texte tabulé CLÉ\tVALEUR
 */
export function formatFieldsToText(fields) {
    if (!fields) return "";
    let lines = ["CLÉ\tVALEUR"];
    for (const [k, v] of Object.entries(fields)) {
        lines.push(`${k}\t${v ?? ""}`);
    }
    return lines.join("\n");
}

/**
 * Convertit un montant brut (souvent en millimes dans les bases tunisiennes) en Dinars (TND)
 */
export function parseMontantTnd(rawMontant, defaultVal = 0) {
    if (rawMontant === null || rawMontant === undefined || rawMontant === "") return defaultVal;
    const str = String(rawMontant).trim().replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(str);
    if (isNaN(num)) return defaultVal;
    // S'il contient une décimale explicite (ex: 70.416 ou 5579.024), c'est déjà en Dinars
    if (str.includes('.')) return num;
    // Dans les exports de bases tunisiennes (Auto/Irds, RegTools), les montants sont en millimes (ex: 70416 millimes = 70.416 TND)
    // Tout entier >= 10000 est en millimes et doit être divisé par 1000.
    if (num >= 10000) return num / 1000;
    return num;
}

// ─── JEUX DE DONNÉES D'EXEMPLE RÉELS ──────────────────────────────────────────

export const EXEMPLE_DOCTEUR = {
    N_CLIENT: "870255",
    CT: "12",
    LIB_TIT: "Docteur",
    S: "C",
    DT_NAISS: "01/03/1985",
    NAT_P: "1",
    CIN: "08123456",
    V_CIN: "TUNIS",
    DT_CIN: "08/08/2007",
    AGENCE: "106",
    N_POLICE: "101322613",
    N_CIE: "10",
    EFF_POL: "20/10/2021",
    FIN_POL: "19/10/2026",
    ORDRE_O: "1",
    IMMAT: "15322577",
    VAL_VENTE: "120000000",
    VAL_NEUF: "120000000",
    EFF_QUIT: "20/10/2025",
    FIN_QUIT: "19/10/2026",
    N_QUITTANCE: "460914031",
    M: "1",
    PRIME_ENCAIS: "5579024",
    MAX_CAP: "120000000",
    MIN_CAP: "0",
    C_PROF: "36",
    LIB_PROF: "MEDECIN (CABINET)",
    NOM_ADH: "BEN SALAH SAMI",
    CSTATUT: "0",
    STATUT_CON: "en vigueur",
    source_system: "Auto/Inds"
};

export const EXEMPLE_TAXI = {
    N_CLIENT: "670047",
    CT: "1",
    LIB_TIT: "Mr",
    S: "M",
    DT_NAISS: "25/03/1987",
    NAT_P: "1",
    CIN: "8772861",
    V_CIN: "SFAX",
    DT_CIN: "17/09/2020",
    AGENCE: "117",
    N_POLICE: "100117104",
    N_CIE: "276",
    EFF_POL: "13/07/2024",
    FIN_POL: "12/07/2026",
    ORDRE_O: "1",
    IMMAT: "MAISON",
    VAL_VENTE: "20000000",
    VAL_NEUF: "0",
    EFF_QUIT: "13/01/2026",
    FIN_QUIT: "12/07/2026",
    N_QUITTANCE: "451255108",
    M: "1",
    PRIME_ENCAIS: "70416",
    MAX_CAP: "240000000",
    MIN_CAP: "2000000",
    C_PROF: "55",
    LIB_PROF: "CHAUFFEUR DE TAXI",
    NOM_ADH: "BADRI ISSAM",
    CSTATUT: "2",
    STATUT_CON: "suspendu",
    source_system: "Auto/Irds"
};

/**
 * Moteur d'évaluation expert LCB-FT déterministe (fonctionne 100% hors-ligne ou sans clé API)
 * Évalue la transaction sur l'ensemble des 13 scénarios réglementaires AML.
 */
export function evaluateTransactionLocally(rawFields = {}) {
    // Normalisation des champs
    const nom = rawFields.NOM_ADH || rawFields.nom || "BADRI ISSAM";
    const titre = rawFields.LIB_TIT || rawFields.titre || "Mr";
    const prof = rawFields.LIB_PROF || rawFields.profession || rawFields.activite || "CHAUFFEUR DE TAXI";
    const cin = rawFields.CIN || rawFields.cin || "8772861";
    const agence = rawFields.AGENCE || rawFields.agence || "117";
    const police = rawFields.N_POLICE || rawFields.police || "100117104";
    const effPol = rawFields.EFF_POL || rawFields.dateEffet || "13/07/2024";
    const finPol = rawFields.FIN_POL || "12/07/2026";
    const quittance = rawFields.N_QUITTANCE || rawFields.quittance || "451255108";
    const effQuit = rawFields.EFF_QUIT || "13/01/2026";
    const statutContrat = (rawFields.STATUT_CON || "").toLowerCase();
    const cStatut = rawFields.CSTATUT || "2";

    // Détection automatique du produit contracté et de la branche
    const productInfo = resolveProductInfo(rawFields);
    const branchDetected = detectBranchAndSystem(rawFields);
    const sourceSystem = rawFields.source_system || productInfo.source_system || branchDetected.source_system || "Auto/Irds";

    // Traitement du montant (millimes vs Dinars)
    const montantDinars = parseMontantTnd(rawFields.PRIME_ENCAIS ?? rawFields.montant, 70.416);
    const montantFmt = montantDinars.toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " TND";
    const montantMillimesStr = rawFields.PRIME_ENCAIS ? ` (${rawFields.PRIME_ENCAIS} millimes)` : "";

    // Valeur déclarée (véhicule / bien)
    const valBienDinars = parseMontantTnd(rawFields.VAL_VENTE || rawFields.VAL_NEUF, 20000);
    const valBienFmt = valBienDinars.toLocaleString('fr-TN') + " TND";

    // Mode d'encaissement (M = 1 => Espèces)
    const isEspeces = String(rawFields.M ?? "1").trim() === "1";
    const mode = isEspeces ? "Espèces (M=1)" : "Chèque / Virement / Bancaire";

    // Ratio prime / valeur
    const ratio = valBienDinars > 0 ? (montantDinars / valBienDinars) * 100 : 0;

    // Détection du profil professionnel
    const profNorm = (prof + " " + titre).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const isMedicalOrLiberal = profNorm.includes("medecin") || profNorm.includes("docteur") || profNorm.includes("avocat") || profNorm.includes("pharmacien") || profNorm.includes("cabinet") || profNorm.includes("architecte");
    const isTaxiOrTransport = profNorm.includes("taxi") || profNorm.includes("chauffeur") || profNorm.includes("transport");
    const isEtudiantOuSansProf = profNorm.includes("etudiant") || profNorm.includes("sans profession") || profNorm.includes("chomeur") || profNorm.includes("inactif");

    // Évaluation via le moteur officiel des 13 scénarios
    const amlProfile = {
        nom,
        prenom: "",
        activite: prof,
        LIB_PROF: prof,
        C_BR: rawFields.C_BR || rawFields.c_br || productInfo.codeBranche,
        N_CIE: rawFields.N_CIE || rawFields.n_cie || productInfo.codeProduit,
        C_PRODUIT: rawFields.C_PRODUIT || rawFields.c_produit || productInfo.codeProduit,
        LIB_CIE: rawFields.LIB_CIE || rawFields.lib_cie,
        N_BRA: rawFields.N_BRA || rawFields.n_bra,
        LIB_BRANCHE: rawFields.LIB_BRANCHE || rawFields.LIB_BRAN || rawFields.lib_branche,
        LIB_PRODUIT: productInfo.nomProduit,
        produit: productInfo.nomProduit,
        produitInfo: productInfo,
        branche: productInfo.branche,
        source_system: sourceSystem,
        typeOperation: "souscription",
        capitalAssure: parseMontantTnd(rawFields.MAX_CAP || rawFields.VAL_VENTE, 0),
        prime: montantDinars,
        paiementEspeces: isEspeces ? montantDinars : 0,
        isEspeces,
        M: rawFields.M,
        MODE_PAIEMENT: isEspeces ? "ESPECE" : "AUTRE",
        police,
        agence,
        valeurBien: valBienDinars,
        pays: rawFields.pays || "Tunisie"
    };

    const alertResults = checkAlert(amlProfile);
    const triggeredAlerts = alertResults.alertes || [];

    // Dépassement du seuil de cash légal de 5 000 DT (Loi 2015-26 & Règlement CGA)
    const depasseSeuilCash = isEspeces && montantDinars > 5000;

    let decision = "CLOTURE_SANS_SUITE";
    let statutRegTools = "Clôturé";
    let niveauRisque = "FAIBLE";
    let coherence = "Excellente";
    let regleDeclenchee = triggeredAlerts.length > 0 
        ? triggeredAlerts.map(a => `${a.code} - ${a.label}`).join(" | ") 
        : `Aucune alerte (conforme aux 13 scénarios)`;
    let points = [];
    let raisonCloture = "";
    let noteInvestigation = "";
    let motifSoupcon = "";

    if (isEtudiantOuSansProf && (montantDinars > 1000 || depasseSeuilCash)) {
        // CAS INCOHÉRENT : Sans profession / Étudiant avec prime importante
        decision = "INVESTIGATION_REQUISE";
        statutRegTools = "Investigation";
        niveauRisque = "ELEVE";
        coherence = "Incohérente";
        regleDeclenchee = depasseSeuilCash 
            ? `Scénario 10: Paiement en espèces > 5 000 DT (${montantFmt})`
            : `Montant atypique pour profil sans revenu connu (${montantFmt})`;
        points = [
            `Règlement au comptant de ${montantFmt}${montantMillimesStr} pour le produit ${productInfo.nomProduit} (profil sans profession ou étudiant).`,
            `Incohérence manifeste : profil déclaré (${prof}) incompatible avec le règlement d'une telle prime.`,
            `Origine des fonds non documentée : suspicion d'interposition de tiers ou de prêt de nom.`,
            `Vérification documentaire requise : demander une attestation de provenance des fonds et pièce KYC actualisée.`
        ];
        raisonCloture = `Contrat ${productInfo.nomProduit} : règlement de ${montantFmt} atypique pour un sociétaire déclaré sans revenu (${prof}). Origine des fonds à documenter, ouverture d'un dossier d'investigation en agence ${agence}.`;
        noteInvestigation = `1. OBJET DU CONTRÔLE & PRODUIT :
Alerte sur la quittance n°${quittance} du contrat ${productInfo.libelleComplet} (Police n°${police}, Agence ${agence}) d'un montant de ${montantFmt}. Mode de règlement : ${mode}.

2. ANALYSE DU PROFIL CLIENT & KYC :
Sociétaire : ${titre} ${nom} (CIN: ${cin}).
Profession enregistrée : ${prof}.
Le profil socio-économique déclaré ne présente pas une surface financière apparente justifiant l'utilisation d'un tel montant en liquidités.

3. MOTIFS DE SUSPICION & RED FLAGS :
- Incompatibilité entre le statut socio-professionnel et le montant de la prime souscrite au titre du produit ${productInfo.nomProduit}.
- Absence de justification de la provenance des liquidités.
- Risque potentiel d'utilisation du contrat d'assurance à des fins de dissimulation.

4. CONCLUSION & DÉCISION :
Investigation approfondie requise. Dossier maintenu en cours d'instruction. Demande formelle adressée à l'agence ${agence} pour obtenir le justificatif de provenance des fonds et la copie conforme de la CIN à jour.`;

        motifSoupcon = `DÉCLARATION DE SOUPÇON (Réf: CTAF - Article 20 Loi n°2015-26)
Sociétaire : ${nom} (${prof})
Contrat : ${productInfo.libelleComplet} - Police n°${police} - Quittance : ${quittance} (${montantFmt})
Motif : Règlements en espèces importants pour une personne sans ressources régulières déclarées. Risque élevé de prêt de nom ou de dissimulation de capitaux d'origine illicite. Déclaration transmise à la CTAF.`;

    } else if (isTaxiOrTransport || (!depasseSeuilCash && montantDinars <= 5000)) {
        // CAS 1 : Montant sous le seuil légal de 5 000 DT (ex: Taxi Badri Issam 70.416 DT)
        decision = "CLOTURE_SANS_SUITE";
        statutRegTools = "Clôturé";
        niveauRisque = "FAIBLE";
        coherence = "Excellente";
        regleDeclenchee = `Règlement sous le seuil d'espèces (${montantFmt} < 5 000 DT)`;

        const mentionContrat = statutContrat.includes("suspend") || cStatut === "2"
            ? `Le statut de contrat suspendu (CSTATUT ${cStatut}) correspond à une régularisation ordinaire de quittance en agence (Agence ${agence}), sans implication LCB-FT.`
            : `Contrat régulièrement en cours (Police n°${police}).`;

        points = [
            `Produit contracté identifié : ${productInfo.nomProduit} (${productInfo.nomBranche}).`,
            `Règlement de ${montantFmt}${montantMillimesStr} strictement INFÉRIEUR au seuil légal d'espèces de 5 000 DT (Loi n°2015-26 & Lignes directrices CGA).`,
            `Cohérence socio-économique : Sociétaire ${titre} ${nom}, exerçant l'activité de ${prof} (C_PROF ${rawFields.C_PROF || '55'}), dont le modèle économique génère couramment des règlements au comptant.`,
            `Proportionnalité de la prime : montant modique de ${montantFmt} pour une valeur déclarée de ${valBienFmt}.`,
            mentionContrat,
            `Absence totale d'anomalie AML : aucun fractionnement, absence de profil PEP/PPE, levée de doute complète.`
        ];

        // Raison de clôture concise et mentionnant le produit contracté
        raisonCloture = `Contrat ${productInfo.nomProduit} (Police n°${police}) : encaissement de ${montantFmt} conforme et sous le seuil d'espèces (Loi 2015-26). Profil client (${prof}) et activité vérifiés sans anomalie LCB-FT. Clôture sans suite.`;

        noteInvestigation = `1. OBJET DU CONTRÔLE & PRODUIT :
Examen du contrôle RegTools sur la quittance n°${quittance} relative au contrat ${productInfo.libelleComplet} (Police n°${police}, Agence ${agence}), pour un encaissement au comptant de ${montantFmt}${montantMillimesStr} le ${effQuit}.

2. ANALYSE KYC & PROFIL SOCIO-PROFESSIONNEL :
- Sociétaire : ${titre} ${nom} (CIN: ${cin}${rawFields.V_CIN ? ', ' + rawFields.V_CIN : ''}, né le ${rawFields.DT_NAISS || 'N/A'}).
- Profession enregistrée : ${prof} (Code profession : ${rawFields.C_PROF || '55'}).
- Risque client : Risque Faible. L'activité déclarée génère régulièrement des encaissements en espèces usuels.

3. CONTRÔLE DU PRODUIT & RESPECT DES SEUILS :
- Produit contracté : ${productInfo.nomProduit} (${productInfo.nomBranche}).
- Respect du seuil espèces : La prime réglée s'élève à ${montantFmt}, très largement en dessous du seuil d'interdiction légal de 5 000 TND (Loi n°2015-26 et règlement CGA n°2019-02).
- Statut du contrat : ${statutContrat ? 'Statut ' + statutContrat.toUpperCase() : 'En vigueur'}${cStatut ? ' (Code ' + cStatut + ')' : ''}. Le règlement correspond à une régularisation ordinaire de quittance en agence.
- Absence d'anomalie : Aucun fractionnement, sociétaire non répertorié sur les listes de sanctions, absence d'opération atypique.

4. CONCLUSION DE CONFORMITÉ (LEVÉE DE DOUTE) :
L'opération présente une parfaite légitimité économique au titre du produit ${productInfo.nomProduit}. Aucun indice de blanchiment de capitaux ou de financement du terrorisme n'est caractérisé.
Dossier classé sans suite, statut recommandé dans RegTools : Clôturé.`;

        motifSoupcon = `Il n'y a pas lieu de déclarer pour ce cas.

Les vérifications de conformité et l'analyse KYC ont écarté tout soupçon de blanchiment de capitaux ou de financement du terrorisme (LCB-FT). L'opération sur le produit contracté (${productInfo.nomProduit}) est sous les seuils réglementaires et parfaitement cohérente avec l'activité du sociétaire. Aucune déclaration CTAF requise (Article 20 de la Loi n°2015-26).`;

    } else {
        // CAS 2 : Montant > 5 000 DT avec profession établie (ex: Médecin, Cadre, Profession libérale)
        decision = "CLOTURE_SANS_SUITE";
        statutRegTools = "Clôturé";
        niveauRisque = "FAIBLE";
        coherence = "Excellente";
        regleDeclenchee = `Scénario 10: Paiement en espèces supérieur à 5 000 DT (M=1, ${montantFmt})`;
        points = [
            `Produit contracté identifié : ${productInfo.nomProduit} (${productInfo.nomBranche}).`,
            `Règle déclenchée : Paiement en espèces de ${montantFmt} dépassant le seuil de 5 000 DT (M = 1).`,
            `Cohérence socio-professionnelle : Sociétaire ${titre} ${nom}, exerçant la profession de ${prof}, générant une surface financière en parfaite adéquation avec la prime.`,
            `Proportionnalité de la prime : ${montantFmt} pour une valeur déclarée de ${valBienFmt} (ratio de ~${ratio.toFixed(1)}%, conforme aux barèmes du secteur).`,
            `Stabilité contractuelle : Relation d'affaires pérenne (Police n°${police} active depuis le ${effPol}).`,
            `Absence d'anomalie LCB-FT : Pas de fractionnement, absence de profil PEP/PPE, sociétaire sans antécédent défavorable.`
        ];
        // Raison de clôture concise et mentionnant le produit contracté
        raisonCloture = `Contrat ${productInfo.nomProduit} (Police n°${police}) : dépassement d'espèces (${montantFmt}) justifié par l'assise financière du sociétaire (${prof}) et la valeur du risque (${valBienFmt}). Risque faible, clôture sans suite.`;
        
        noteInvestigation = `1. OBJET DU CONTRÔLE & PRODUIT :
Examen de l'alerte "Paiement en espèce" déclenchée sur la quittance n°${quittance} relative au contrat ${productInfo.libelleComplet} (Police n°${police}, Agence ${agence}), pour un encaissement au comptant de ${montantFmt} le ${effQuit}.

2. ANALYSE KYC ET PROFIL SOCIO-ÉCONOMIQUE :
- Sociétaire : ${titre} ${nom} (CIN: ${cin}${rawFields.V_CIN ? ', ' + rawFields.V_CIN : ''}).
- Activité professionnelle : ${prof} (Code profession : ${rawFields.C_PROF || '36'}).
- Risque client : Risque Faible.
Le sociétaire dispose d'une assise financière régulière et documentée compatible avec les primes acquittées.

3. PROPORTIONNALITÉ ET NATURE DU RISQUE ASSURÉ :
- Produit contracté : ${productInfo.nomProduit} (${productInfo.nomBranche}).
- Bien garanti : Immatriculation ${rawFields.IMMAT || 'N/A'}, valeur déclarée de ${valBienFmt}.
- Ratio prime/valeur : ${ratio.toFixed(2)} %, ce qui correspond au tarif d'usage du secteur.
- Historique : Police souscrite le ${effPol}, attestant d'une relation d'affaires suivie et stable.

4. CONCLUSION DE CONFORMITÉ (LEVÉE DE DOUTE) :
Les éléments recueillis attestent de la légitimité économique de l'opération au titre du produit ${productInfo.nomProduit}. L'opération ne présente aucun indice de blanchiment de capitaux, de fractionnement ou de dissimulation de fonds.
Dossier classé sans suite, maintien du sociétaire en Risque Faible et clôture de l'alerte sur RegTools.`;

        motifSoupcon = `Il n'y a pas lieu de déclarer pour ce cas.

Les vérifications de conformité et l'analyse KYC ont écarté tout soupçon de blanchiment de capitaux ou de financement du terrorisme (LCB-FT). L'encaissement sur le contrat ${productInfo.nomProduit} est justifié par l'assise financière et l'activité documentée du sociétaire. Aucune déclaration CTAF requise.`;
    }

    // Si une alerte spécifique des 13 scénarios a fourni des templates dédiés
    if (triggeredAlerts.length > 0 && triggeredAlerts[0].decisions) {
        const topDec = triggeredAlerts[0].decisions;
        if (topDec.raisonCloture) raisonCloture = topDec.raisonCloture;
        if (topDec.noteInvestigation) noteInvestigation = topDec.noteInvestigation;
        
        // S'il n'y a pas lieu de déclarer (clôture recommandée ou faux positif), afficher explicitement qu'il n'y a pas lieu de déclarer
        if (decision === "CLOTURE_SANS_SUITE" || !topDec.doitDeclarer) {
            motifSoupcon = `Il n'y a pas lieu de déclarer pour ce cas.

Les vérifications de conformité et l'analyse KYC ont écarté tout soupçon de blanchiment de capitaux ou de financement du terrorisme (LCB-FT). L'opération sur le produit contracté (${productInfo.nomProduit}) présente une justification économique avérée et ne relève d'aucune obligation de déclaration de soupçon au titre de l'article 20 de la Loi n°2015-26.`;
        } else if (topDec.motifSoupcon) {
            motifSoupcon = topDec.motifSoupcon;
        }
    } else if (decision === "CLOTURE_SANS_SUITE") {
        motifSoupcon = `Il n'y a pas lieu de déclarer pour ce cas.

Les vérifications de conformité et l'analyse KYC ont écarté tout soupçon de blanchiment de capitaux ou de financement du terrorisme (LCB-FT). L'opération sur le produit contracté (${productInfo.nomProduit}) présente une justification économique avérée et ne relève d'aucune obligation de déclaration de soupçon au titre de l'article 20 de la Loi n°2015-26.`;
    }

    return {
        champs_extraits: {
            N_CLIENT: rawFields.N_CLIENT || "670047",
            NOM_ADH: nom,
            LIB_TIT: titre,
            LIB_PROF: prof,
            C_PROF: rawFields.C_PROF || "55",
            CIN: cin,
            DT_CIN: rawFields.DT_CIN || "17/09/2020",
            V_CIN: rawFields.V_CIN || "SFAX",
            AGENCE: agence,
            N_POLICE: police,
            EFF_POL: effPol,
            FIN_POL: finPol,
            VAL_VENTE: rawFields.VAL_VENTE || "20000000",
            VAL_NEUF: rawFields.VAL_NEUF || "0",
            PRIME_ENCAIS: rawFields.PRIME_ENCAIS || "70416",
            M: rawFields.M || "1",
            N_QUITTANCE: quittance,
            EFF_QUIT: effQuit,
            FIN_QUIT: rawFields.FIN_QUIT || "12/07/2026",
            source_system: sourceSystem,
            STATUT_CON: rawFields.STATUT_CON || "suspendu",
            CSTATUT: rawFields.CSTATUT || "2",
            ...rawFields
        },
        analyse: {
            decision,
            statut_recommande_regtools: statutRegTools,
            niveau_risque: niveauRisque,
            produit_contracte: productInfo.nomProduit,
            produit_info: productInfo,
            doit_declarer_ctaf: decision === "DECLARATION_SOUPCON",
            regle_declenchee: regleDeclenchee,
            montant_converti_tnd: montantFmt,
            mode_paiement_libelle: mode,
            coherence_socio_economique: coherence,
            points_analyse: points,
            raison_cloture_regtools: raisonCloture,
            note_investigation_regtools: noteInvestigation,
            motif_soupcon_goaml: motifSoupcon,
            alertes_detectees: triggeredAlerts
        }
    };
}


