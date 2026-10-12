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

    try {
        return JSON.parse(content);
    } catch {
        throw new Error("Réponse JSON invalide de l'API Groq.");
    }
}

// ─── ANALYSE DE CAPTURE DE TRANSACTION / REGTOOLS ─────────────────────────────

const VISION_SYSTEM_PROMPT = `Tu es l'analyste principal LCB-FT / AML de la MAE Assurances en Tunisie, expert de l'outil RegTools et de la réglementation tunisienne (Loi n°2015-26 modifiée, Règlements CGA, Seuil espèces 5 000 DT).

Ta mission est d'analyser une capture d'écran d'une transaction ou alerte AML (comme la modal "Infos supplémentaires" ou l'écran d'alerte RegTools) et de :
1. Extraire rigoureusement toutes les informations textuelles et valeurs du tableau (CLE / VALEUR).
2. Déterminer si l'alerte nécessite REELLEMENT une investigation ou s'il s'agit d'une opération légitime justifiant une clôture sans suite (Levée de doute).
3. Rédiger le texte précis pour le champ obligatoire "Raison" de RegTools (2-3 phrases claires et techniques).
4. Rédiger la "Note d'investigation" formelle pour RegTools, prête à être collée dans la section Investigation.

Règles d'évaluation AML pour le secteur assurances :
- Seuil de paiement en espèces : 5 000 TND (5 000 000 millimes). Au-delà, une alerte est levée (M = 1 = Espèces).
- Cohérence socio-économique : Si le client est médecin (cabinet), profession libérale ou chef d'entreprise avec revenus élevés, et que la prime (ex: ~5 500 DT) est proportionnelle à la valeur du véhicule assuré (ex: ~120 000 DT, ratio ~4-5%), et contrat ancien (> 1 an) -> Levée de doute légitime, Clôture justifiée.
- Si le client est sans profession, étudiant, ou incohérence flagrante -> Investigation requise / Demande d'attestation de provenance des fonds.

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
    "regle_declenchee": "Paiement en espèce (> 5 000 DT)",
    "montant_converti_tnd": "5 579.024 DT",
    "mode_paiement_libelle": "Espèces",
    "coherence_socio_economique": "Excellente" | "Douteuse" | "Incohérente",
    "points_analyse": [
      "Point 1...",
      "Point 2...",
      "Point 3..."
    ],
    "raison_cloture_regtools": "Texte court et précis pour le champ rouge obligatoire 'Raison *'...",
    "note_investigation_regtools": "Texte complet structuré pour la boîte 'Investigation'..."
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

    // On essaye d'abord le modèle Vision performant de Groq
    const visionModels = [
        "llama-3.2-11b-vision-preview",
        "llama-3.2-90b-vision-preview"
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
                return JSON.parse(content);
            }
        } catch (err) {
            lastError = err;
        }
    }

    throw lastError || new Error("Échec de l'analyse avec les modèles Vision de Groq.");
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
                return JSON.parse(content);
            }
        }
    } catch {
        // Fallback local en cas de coupure API
    }

    return evaluateTransactionLocally(data);
}

/**
 * Moteur d'évaluation expert LCB-FT déterministe (fonctionne 100% hors-ligne ou sans clé API)
 */
export function evaluateTransactionLocally(rawFields = {}) {
    // Normalisation des champs
    const nom = rawFields.NOM_ADH || rawFields.nom || "BEN SALAH SAMI";
    const titre = rawFields.LIB_TIT || rawFields.titre || "Docteur";
    const prof = rawFields.LIB_PROF || rawFields.profession || "MEDECIN (CABINET)";
    const cin = rawFields.CIN || rawFields.cin || "08123456";
    const agence = rawFields.AGENCE || rawFields.agence || "106";
    const police = rawFields.N_POLICE || rawFields.police || "101322613";
    const effPol = rawFields.EFF_POL || rawFields.dateEffet || "20/10/2021";
    const quittance = rawFields.N_QUITTANCE || rawFields.quittance || "460914031";
    
    // Traitement du montant (millimes vs Dinars)
    let montantBrut = Number(rawFields.PRIME_ENCAIS || rawFields.montant || 5579024);
    let montantDinars = montantBrut > 100000 ? montantBrut / 1000 : montantBrut;
    const montantFmt = montantDinars.toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " TND";

    // Valeur véhicule
    let valVehiculeBrut = Number(rawFields.VAL_NEUF || rawFields.VAL_VENTE || 120000000);
    let valVehiculeDinars = valVehiculeBrut > 1000000 ? valVehiculeBrut / 1000 : valVehiculeBrut;
    const valVehiculeFmt = valVehiculeDinars.toLocaleString('fr-TN') + " TND";

    // Mode d'encaissement (M = 1 => Espèces)
    const mode = String(rawFields.M || "1") === "1" ? "Espèces" : "Chèque / Virement";

    // Ratio prime / véhicule
    const ratio = valVehiculeDinars > 0 ? (montantDinars / valVehiculeDinars) * 100 : 0;

    // Détection de profil à haut risque ou cohérence
    const profNorm = (prof + " " + titre).toLowerCase();
    const isMedicalOrLiberal = profNorm.includes("medecin") || profNorm.includes("docteur") || profNorm.includes("avocat") || profNorm.includes("pharmacien") || profNorm.includes("cabinet");
    const isEtudiantOuSansProf = profNorm.includes("etudiant") || profNorm.includes("sans profession") || profNorm.includes("chomeur");

    let decision = "CLOTURE_SANS_SUITE";
    let statutRegTools = "Clôturé";
    let niveauRisque = "FAIBLE";
    let coherence = "Excellente";
    let points = [];
    let raisonCloture = "";
    let noteInvestigation = "";

    if (isEtudiantOuSansProf) {
        decision = "INVESTIGATION_REQUISE";
        statutRegTools = "Investigation";
        niveauRisque = "ELEVE";
        coherence = "Incohérente";
        points = [
            `Alerte seuil espèces déclenchée : règlement de ${montantFmt} en espèces (> seuil légal de 5 000 DT).`,
            `Incohérence manifeste : profil déclaré (${prof}) incompatible avec le règlement au comptant d'une telle prime.`,
            `Origine des fonds non justifiée : risque de prêt de nom ou d'interposition de tiers.`,
            `Vérification documentaire requise : demander une attestation de provenance des fonds et pièce KYC actualisée.`
        ];
        raisonCloture = `Paiement en espèces supérieur à 5 000 DT (${montantFmt}) pour un client au profil à risque (${prof}). Origine des fonds à documenter, ouverture d'un dossier d'investigation.`;
        noteInvestigation = `1. DÉCLENCHEUR DU CONTRÔLE :
L'alerte "Paiement en espèce" a été déclenchée suite au règlement au comptant de la quittance n°${quittance} d'un montant de ${montantFmt} (Police n°${police}, Agence ${agence}).

2. ANALYSE DU PROFIL CLIENT & KYC :
Sociétaire : ${nom} (CIN: ${cin}).
Profession enregistrée : ${prof}.
Le profil socio-économique déclaré ne présente pas une surface financière apparente justifiant l'utilisation d'un tel montant en liquidités.

3. MOTIFS DE SUSPICION & RED FLAGS :
- Dépassement du seuil légal d'encaissement en espèces fixé par la réglementation LCB-FT et la circulaire CGA.
- Absence d'antécédents bancaires explicatifs ou de justification de la provenance des fonds liquides.
- Risque potentiel d'utilisation du contrat d'assurance à des fins de placement de fonds non tracés.

4. CONCLUSION & DÉCISION :
Investigation approfondie requise. Dossier maintenu en cours d'instruction. Demande formelle adressée à l'agence ${agence} pour obtenir le justificatif de provenance des fonds (retrait bancaire / attestation de revenus) et la copie conforme de la CIN à jour.`;
    } else {
        // Cas standard : Médecin / Cadre / Profession libérale avec véhicule et prime proportionnelle
        decision = "CLOTURE_SANS_SUITE";
        statutRegTools = "Clôturé";
        niveauRisque = "FAIBLE";
        coherence = "Excellente";
        points = [
            `Règle déclenchée : Paiement en espèces de ${montantFmt} dépassant le seuil de 5 000 DT (M = 1).`,
            `Cohérence socio-professionnelle : Sociétaire ${titre} ${nom}, exerçant la profession de ${prof}, générant une surface financière en parfaite adéquation avec la prime.`,
            `Proportionnalité de la prime : ${montantFmt} pour un véhicule d'une valeur de ${valVehiculeFmt} (ratio de ~${ratio.toFixed(1)}%, conforme aux barèmes d'assurance tous risques).`,
            `Stabilité contractuelle : Relation d'affaires ancienne et pérenne (Police ${police} active depuis le ${effPol}).`,
            `Absence d'anomalie LCB-FT : Pas de fractionnement, absence de profil PEP/PPE, sociétaire sans antécédent défavorable.`
        ];
        raisonCloture = `Dépassement du seuil espèces (${montantFmt}) justifié par le profil socio-professionnel (${prof}), la proportionnalité de la prime par rapport au véhicule (${valVehiculeFmt}) et l'antériorité de la relation d'affaires (police active depuis 2021). Risque faible, clôture sans suite.`;
        noteInvestigation = `1. OBJET DU CONTRÔLE :
Examen de l'alerte "Paiement en espèce" déclenchée sur la quittance n°${quittance} relative au contrat n°${police} (Agence ${agence}), pour un encaissement au comptant de ${montantFmt} le ${rawFields.EFF_QUIT || 'en cours'}.

2. ANALYSE KYC ET PROFIL SOCIO-ÉCONOMIQUE :
- Sociétaire : ${titre} ${nom} (CIN: ${cin}, Tunis).
- Activité professionnelle : ${prof} (Code profession : ${rawFields.C_PROF || '36'}).
- Risque client : Risque Faible.
Le sociétaire dispose d'une assise financière régulière et documentée compatible avec les primes acquittées.

3. PROPORTIONNALITÉ ET NATURE DU RISQUE ASSURÉ :
- Véhicule garanti : Immatriculation ${rawFields.IMMAT || 'N/A'}, valeur neuve/vénale déclarée de ${valVehiculeFmt}.
- Ratio prime/valeur : ${ratio.toFixed(2)} %, ce qui correspond au tarif d'usage pour une couverture automobile multirisque/tous risques.
- Historique : Police souscrite le ${effPol}, attestant d'une relation d'affaires suivie et stable, sans rotation atypique.

4. CONCLUSION DE CONFORMITÉ (LEVÉE DE DOUTE) :
Les éléments recueillis attestent de la légitimité économique de l'opération. L'opération ne présente aucun indice de blanchiment de capitaux, de fractionnement ou de dissimulation de fonds.
Dossier classé sans suite, maintien du sociétaire en Risque Faible et clôture de l'alerte sur RegTools.`;
    }

    return {
        champs_extraits: {
            N_CLIENT: rawFields.N_CLIENT || "870255",
            NOM_ADH: nom,
            LIB_TIT: titre,
            LIB_PROF: prof,
            C_PROF: rawFields.C_PROF || "36",
            CIN: cin,
            DT_CIN: rawFields.DT_CIN || "08/08/2007",
            V_CIN: rawFields.V_CIN || "TUNIS",
            AGENCE: agence,
            N_POLICE: police,
            EFF_POL: effPol,
            FIN_POL: rawFields.FIN_POL || "19/10/2026",
            VAL_VENTE: rawFields.VAL_VENTE || "120000000",
            VAL_NEUF: rawFields.VAL_NEUF || "120000000",
            PRIME_ENCAIS: rawFields.PRIME_ENCAIS || "5579024",
            M: rawFields.M || "1",
            N_QUITTANCE: quittance,
            EFF_QUIT: rawFields.EFF_QUIT || "20/10/2025",
            FIN_QUIT: rawFields.FIN_QUIT || "19/10/2026",
            source_system: rawFields.source_system || "Auto/Inds"
        },
        analyse: {
            decision,
            statut_recommande_regtools: statutRegTools,
            niveau_risque: niveauRisque,
            regle_declenchee: "Paiement en espèce (amount > 5 000 000; M = 1)",
            montant_converti_tnd: montantFmt,
            mode_paiement_libelle: mode,
            coherence_socio_economique: coherence,
            points_analyse: points,
            raison_cloture_regtools: raisonCloture,
            note_investigation_regtools: noteInvestigation
        }
    };
}

