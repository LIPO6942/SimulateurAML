import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  analyzeTransactionImageWithGroq,
  evaluateTransactionDataWithGroq,
  evaluateTransactionLocally,
  getGroqApiKey,
  setGroqApiKey
} from './groqService.js';

// Données d'exemple anonymisées correspondant au cas d'usage réel
const EXEMPLE_CAPTURE_REELLE = {
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
  source_system: "Auto/Inds"
};

export default function TransactionCaptureAnalyzer() {
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [pasteNotice, setPasteNotice] = useState(null);
  const [apiKey, setApiKey] = useState(getGroqApiKey());
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState(null);
  const [extractedFields, setExtractedFields] = useState(EXEMPLE_CAPTURE_REELLE);
  const [showFieldsEditor, setShowFieldsEditor] = useState(false);
  const [result, setResult] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
  const dropZoneRef = useRef(null);

  // Initialisation automatique avec l'exemple pour avoir un résultat dès le départ
  useEffect(() => {
    const defaultEval = evaluateTransactionLocally(EXEMPLE_CAPTURE_REELLE);
    setResult(defaultEval);
  }, []);

  const handleImageFile = useCallback((file) => {
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setImagePreview(dataUrl);
      setImageBase64(dataUrl);
      setPasteNotice("✓ Capture d'écran collée avec succès !");
      setTimeout(() => setPasteNotice(null), 3000);
    };
    reader.readAsDataURL(file);
  }, []);

  // Détection d'une image dans les données du presse-papier
  const processClipboardData = useCallback((clipboardData) => {
    if (!clipboardData) return false;

    // 1. Examiner les fichiers directs (ex: capture d'écran Windows Snipping Tool)
    if (clipboardData.files && clipboardData.files.length > 0) {
      for (let i = 0; i < clipboardData.files.length; i++) {
        const file = clipboardData.files[i];
        if (file.type && file.type.startsWith('image/')) {
          handleImageFile(file);
          return true;
        }
      }
    }

    // 2. Examiner les items du presse-papier (e.clipboardData.items)
    if (clipboardData.items && clipboardData.items.length > 0) {
      for (let i = 0; i < clipboardData.items.length; i++) {
        const item = clipboardData.items[i];
        if (item.type && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            handleImageFile(file);
            return true;
          }
        }
      }
    }

    return false;
  }, [handleImageFile]);

  // Écoute globale de l'événement "Coller" (Ctrl+V) n'importe où dans la page
  useEffect(() => {
    const onPaste = (e) => {
      const clipboardData = e.clipboardData || window.clipboardData;
      if (processClipboardData(clipboardData)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('paste', onPaste, true);
    document.addEventListener('paste', onPaste, true);
    return () => {
      window.removeEventListener('paste', onPaste, true);
      document.removeEventListener('paste', onPaste, true);
    };
  }, [processClipboardData]);

  // Bouton pour coller directement via l'API presse-papier du navigateur
  const handlePasteFromClipboardApi = async () => {
    try {
      if (!navigator.clipboard?.read) {
        setPasteNotice("Appuyez simplement sur Ctrl + V sur votre clavier pour coller.");
        setTimeout(() => setPasteNotice(null), 4000);
        return;
      }
      const clipboardItems = await navigator.clipboard.read();
      let foundImage = false;
      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            handleImageFile(blob);
            foundImage = true;
            break;
          }
        }
        if (foundImage) break;
      }
      if (!foundImage) {
        setError("Aucune image trouvée dans le presse-papier. Faites d'abord une capture avec Win + Shift + S.");
      }
    } catch (err) {
      console.warn("Erreur presse-papier:", err);
      // Fallback
      setPasteNotice("Presse-papier prêt : appuyez sur Ctrl + V sur votre clavier !");
      setTimeout(() => setPasteNotice(null), 4000);
      if (dropZoneRef.current) dropZoneRef.current.focus();
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) handleImageFile(file);
  };

  const handleSaveApiKey = () => {
    setGroqApiKey(apiKey);
    setShowKeyInput(false);
  };

  const handleFieldChange = (key, value) => {
    const updated = { ...extractedFields, [key]: value };
    setExtractedFields(updated);
  };

  // Lancement de l'analyse IA Groq (Vision si image présente, sinon Text)
  const handleRunAIAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      if (imageBase64 && apiKey) {
        setLoadingStep("Lecture visuelle de la capture via Groq Vision (llama-3.2)...");
        const aiResult = await analyzeTransactionImageWithGroq(imageBase64);
        if (aiResult.champs_extraits) {
          setExtractedFields(prev => ({ ...prev, ...aiResult.champs_extraits }));
        }
        setResult(aiResult);
      } else {
        setLoadingStep("Évaluation LCB-FT en cours...");
        const aiResult = await evaluateTransactionDataWithGroq(extractedFields);
        setResult(aiResult);
      }
    } catch (err) {
      console.warn("Erreur IA, bascule sur le moteur local :", err);
      setError(`Notice IA : ${err.message}. Résultat calculé via le moteur réglementaire interne.`);
      const localResult = evaluateTransactionLocally(extractedFields);
      setResult(localResult);
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  // Réévaluation instantanée locale (sans appel réseau)
  const handleRunLocalAnalysis = () => {
    setError(null);
    const localResult = evaluateTransactionLocally(extractedFields);
    setResult(localResult);
  };

  // Réinitialiser avec l'exemple type (Médecin - Espèces)
  const handleLoadRealExample = () => {
    setExtractedFields(EXEMPLE_CAPTURE_REELLE);
    setImagePreview(null);
    setImageBase64(null);
    setError(null);
    const localResult = evaluateTransactionLocally(EXEMPLE_CAPTURE_REELLE);
    setResult(localResult);
  };

  const copyToClipboard = async (text, fieldName) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2500);
    }
  };

  const analyse = result?.analyse || {};
  const isCloture = analyse.decision === "CLOTURE_SANS_SUITE";

  return (
    <div className="analyzer-container anim-up">
      {/* ─── BANDEAU SUPÉRIEUR ────────────────────────────────────────────── */}
      <div className="analyzer-header card">
        <div className="analyzer-header-content">
          <div>
            <div className="badge-tag">NOUVEAU · ASSISTANT REGTOOLS</div>
            <h2 className="analyzer-title">
              📸 Analyseur Intelligent de Capture (RegTools & Quittances)
            </h2>
            <p className="analyzer-subtitle">
              Collez la capture d'écran du tableau <strong>Infos supplémentaires</strong> ou de l'alerte RegTools.
              L'outil extrait les données, analyse la légitimité AML de la transaction et génère immédiatement 
              la <strong>Raison de clôture</strong> et la <strong>Note d'investigation</strong> à reporter dans RegTools.
            </p>
          </div>
          <div className="analyzer-header-actions">
            <button
              className="btn-sec"
              onClick={() => setShowKeyInput(!showKeyInput)}
              title="Configurer la clé API Groq"
            >
              🔑 Clé Groq {apiKey ? "✓" : "⚠️"}
            </button>
            <button
              className="btn-accent"
              onClick={handleLoadRealExample}
              title="Recharger l'exemple type (Médecin - Paiement espèces)"
            >
              🔄 Exemple Quittance (Médecin)
            </button>
          </div>
        </div>

        {/* Configuration de la clé API Groq */}
        {showKeyInput && (
          <div className="api-key-box anim-fade">
            <div className="api-key-header">
              <strong>Configuration de la clé API Groq (Optionnel mais recommandé)</strong>
              <small>Permet d'utiliser les modèles Vision LLaMA pour lire directement vos captures.</small>
            </div>
            <div className="api-key-input-row">
              <input
                type="password"
                placeholder="gsk_..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="fld-inp"
              />
              <button className="run" onClick={handleSaveApiKey}>Enregistrer</button>
              <button className="btn-sec" onClick={() => setShowKeyInput(false)}>Fermer</button>
            </div>
          </div>
        )}
      </div>

      {/* ─── ZONE D'IMPORTATION / CAPTURE D'ÉCRAN ─────────────────────────── */}
      <div className="analyzer-drop-zone-card card">
        {pasteNotice && (
          <div className="paste-success-alert anim-fade">
            <span>{pasteNotice}</span>
          </div>
        )}
        <div className="drop-zone-grid">
          <div
            ref={dropZoneRef}
            className={`drop-zone ${imagePreview ? 'has-image' : ''}`}
            tabIndex={0}
            title="Cliquez ici et faites Ctrl + V pour coller votre capture d'écran"
            onPaste={(e) => {
              const cb = e.clipboardData || window.clipboardData;
              if (processClipboardData(cb)) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) handleImageFile(file);
            }}
          >
            {imagePreview ? (
              <div className="image-preview-wrapper">
                <img src={imagePreview} alt="Aperçu capture" className="captured-image" />
                <button
                  className="remove-img-btn"
                  onClick={() => {
                    setImagePreview(null);
                    setImageBase64(null);
                  }}
                  title="Supprimer cette capture"
                >
                  ✕ Supprimer
                </button>
                <div className="image-overlay-info">
                  ✓ Capture chargée depuis le presse-papier
                </div>
              </div>
            ) : (
              <div className="drop-zone-placeholder">
                <div className="drop-icon">📋</div>
                <div className="drop-main-text">
                  <strong>Collez directement avec Ctrl + V</strong>
                </div>
                <div className="drop-sub-text">
                  Exactement comme coller du texte : faites votre capture d'écran puis tapez <strong>Ctrl + V</strong> n'importe où !
                </div>
                <div style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    className="btn-accent paste-btn-large"
                    onClick={handlePasteFromClipboardApi}
                    title="Cliquez pour coller directement l'image présente dans votre presse-papier"
                  >
                    📋 Coller la capture du presse-papier
                  </button>
                </div>
                <label className="browse-file-sublink">
                  ou importer une image depuis l'ordinateur
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                  />
                </label>
              </div>
            )}
          </div>

          <div className="drop-zone-side">
            <div className="side-tips">
              <h4>💡 Comment l'utiliser en 3 secondes :</h4>
              <ol>
                <li>Sur votre écran RegTools, faites <code>Win + Shift + S</code> pour capturer la fenêtre.</li>
                <li>Cliquez sur cette page et faites <strong>Ctrl + V</strong>.</li>
                <li>Cliquez sur <strong>« Analyser la capture »</strong> : vos textes sont prêts !</li>
              </ol>
            </div>

            <div className="analyzer-cta-buttons">
              <button
                className="run main-analyze-btn"
                onClick={handleRunAIAnalysis}
                disabled={loading}
              >
                {loading ? "⏳ Analyse en cours..." : "🚀 Analyser la transaction"}
              </button>
              <button
                className="btn-sec"
                onClick={handleRunLocalAnalysis}
                title="Évaluation déterministe immédiate"
              >
                ⚡ Réévaluer immédiatement
              </button>
            </div>

            {loading && (
              <div className="loading-indicator">
                <div className="spinner"></div>
                <span>{loadingStep || "Traitement des données de conformité..."}</span>
              </div>
            )}

            {error && (
              <div className="notice-box">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── RÉSULTATS DÉCISIONNELS & GÉNÉRATION DE TEXTES POUR REGTOOLS ──── */}
      {result && (
        <div className="analyzer-results-section anim-up">
          {/* CARTE VERDICT PRINCIPAL */}
          <div className={`verdict-banner ${isCloture ? 'verdict-banner-success' : 'verdict-banner-warning'}`}>
            <div className="verdict-banner-left">
              <div className="verdict-icon">
                {isCloture ? "🟢" : "🔴"}
              </div>
              <div>
                <div className="verdict-tag">VERDICT DU CONTRÔLE AML</div>
                <h3 className="verdict-heading">
                  {isCloture 
                    ? "CLÔTURE DU DOSSIER RECOMMANDÉE (Soupçon écarté / Faux positif)" 
                    : "INVESTIGATION REQUISE (Demande de justificatif ou escalade)"}
                </h3>
                <div className="verdict-meta">
                  Règle : <strong>{analyse.regle_declenchee || "Paiement en espèce"}</strong> · 
                  Montant : <strong>{analyse.montant_converti_tnd || "5 579.024 DT"}</strong> · 
                  Mode : <strong>{analyse.mode_paiement_libelle || "Espèces (M=1)"}</strong> · 
                  Risque : <span className={`risk-badge risk-${analyse.niveauRisque?.toLowerCase()}`}>{analyse.niveauRisque || "FAIBLE"}</span>
                </div>
              </div>
            </div>
            <div className="verdict-banner-right">
              <div className="statut-recommande-box">
                <div className="statut-recommande-lbl">Statut à choisir dans RegTools :</div>
                <div className="statut-recommande-val">
                  {analyse.statut_recommande_regtools === "Clôturé" ? "✓ Clôturé" : "⚠ Investigation"}
                </div>
              </div>
            </div>
          </div>

          {/* GRILLE DES DEUX TEXTES À COPIER DIRECTEMENT DANS REGTOOLS */}
          <div className="copy-cards-grid">
            {/* CARTE 1 : RAISON DE CLÔTURE (CHAMP ROUGE REGTOOLS) */}
            <div className="copy-card card highlight-card">
              <div className="copy-card-header">
                <div>
                  <div className="target-field-tag red-tag">Champ obligatoire RegTools : Raison *</div>
                  <h3 className="copy-card-title">📝 Raison de clôture</h3>
                  <p className="copy-card-desc">
                    À coller directement dans le champ en rouge <em>« La raison est obligatoire »</em>
                  </p>
                </div>
                <button
                  className={`copy-action-btn ${copiedField === 'raison' ? 'copied' : ''}`}
                  onClick={() => copyToClipboard(analyse.raison_cloture_regtools, 'raison')}
                >
                  {copiedField === 'raison' ? '✓ Raison copiée !' : '📋 Copier la Raison'}
                </button>
              </div>
              <div className="copy-text-box">
                {analyse.raison_cloture_regtools}
              </div>
            </div>

            {/* CARTE 2 : NOTE D'INVESTIGATION (SECTION INVESTIGATION REGTOOLS) */}
            <div className="copy-card card highlight-card">
              <div className="copy-card-header">
                <div>
                  <div className="target-field-tag blue-tag">Encadré RegTools : Investigation</div>
                  <h3 className="copy-card-title">🔍 Note d'investigation détaillée</h3>
                  <p className="copy-card-desc">
                    À coller dans la zone <em>« Écrire une note... »</em> pour archiver l'analyse
                  </p>
                </div>
                <button
                  className={`copy-action-btn ${copiedField === 'note' ? 'copied' : ''}`}
                  onClick={() => copyToClipboard(analyse.note_investigation_regtools, 'note')}
                >
                  {copiedField === 'note' ? '✓ Note copiée !' : '📋 Copier la Note'}
                </button>
              </div>
              <div className="copy-text-box note-box">
                <pre>{analyse.note_investigation_regtools}</pre>
              </div>
            </div>
          </div>

          {/* DÉTAILS DE L'ANALYSE DE COHÉRENCE */}
          <div className="card analysis-details-card">
            <div className="card-hd">
              <h3 className="card-tit">⚖️ Points clés du diagnostic réglementaire</h3>
              <button
                className="btn-link"
                onClick={() => setShowFieldsEditor(!showFieldsEditor)}
              >
                {showFieldsEditor ? "Masquer les données du tableau" : "🔍 Voir / Modifier les données extraites du tableau"}
              </button>
            </div>
            
            <ul className="points-list">
              {analyse.points_analyse?.map((pt, idx) => (
                <li key={idx} className="point-item">
                  <span className="point-bullet">✓</span>
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* TABLEAU ÉDITABLE DES CHAMPS EXTRAITS DE LA CAPTURE */}
          {showFieldsEditor && (
            <div className="card fields-table-card anim-up">
              <div className="card-hd">
                <div>
                  <h3 className="card-tit">📊 Champs extraits du tableau (Infos supplémentaires)</h3>
                  <small className="card-desc">
                    Vous pouvez modifier une valeur (ex: changer la profession en « SANS PROFESSION ») puis cliquer sur Réévaluer pour observer le changement de verdict.
                  </small>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="run" onClick={handleRunLocalAnalysis}>
                    ⚡ Recalculer le verdict
                  </button>
                </div>
              </div>

              <div className="fields-grid">
                {Object.entries(extractedFields).map(([key, val]) => (
                  <div key={key} className="field-item">
                    <label className="field-lbl">{key}</label>
                    <input
                      type="text"
                      className="fld-inp field-input-sm"
                      value={val ?? ""}
                      onChange={(e) => handleFieldChange(key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
