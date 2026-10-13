import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  analyzeTransactionImageWithGroq,
  evaluateTransactionDataWithGroq,
  evaluateTransactionLocally,
  getGroqApiKey,
  setGroqApiKey,
  parseTableText,
  formatFieldsToText,
  EXEMPLE_DOCTEUR,
  EXEMPLE_TAXI
} from './groqService.js';

export default function TransactionCaptureAnalyzer() {
  const [inputMode, setInputMode] = useState("text"); // "text" ou "image"
  const [extractedFields, setExtractedFields] = useState(EXEMPLE_TAXI);
  const [pastedText, setPastedText] = useState(() => formatFieldsToText(EXEMPLE_TAXI));
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [pasteNotice, setPasteNotice] = useState(null);
  const [apiKey, setApiKey] = useState(getGroqApiKey());
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState(null);
  const [showFieldsEditor, setShowFieldsEditor] = useState(false);
  const [result, setResult] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
  const dropZoneRef = useRef(null);
  const textAreaRef = useRef(null);

  // Initialisation automatique avec l'exemple pour avoir un résultat dès le départ
  useEffect(() => {
    const defaultEval = evaluateTransactionLocally(EXEMPLE_TAXI);
    setResult(defaultEval);
  }, []);

  // Application de nouvelles données extraites (texte ou image)
  const applyExtractedFields = useCallback((fields, noticeMsg = null) => {
    setExtractedFields(fields);
    setPastedText(formatFieldsToText(fields));
    const evalRes = evaluateTransactionLocally(fields);
    setResult(evalRes);
    if (noticeMsg) {
      setPasteNotice(noticeMsg);
      setTimeout(() => setPasteNotice(null), 3500);
    }
  }, []);

  // Détection et parsing du texte (tableau TSV copié, etc.)
  const handlePastedTextContent = useCallback((text) => {
    if (!text || typeof text !== 'string') return false;
    const parsed = parseTableText(text);
    if (parsed && Object.keys(parsed).length >= 2) {
      const count = Object.keys(parsed).length;
      applyExtractedFields(parsed, `✓ Données du tableau collées avec succès (${count} champs extraits) !`);
      setInputMode("text");
      return true;
    }
    return false;
  }, [applyExtractedFields]);

  // Optimisation de l'image (redimensionnement si > 1800px ou > 2 Mo pour l'API Groq)
  const compressImageIfNeeded = (dataUrl, maxDimension = 1800, quality = 0.85) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const needResize = width > maxDimension || height > maxDimension;
        if (!needResize && dataUrl.length < 2 * 1024 * 1024) {
          resolve(dataUrl);
          return;
        }

        if (needResize) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const handleImageFile = useCallback((file) => {
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const rawDataUrl = e.target.result;
      setImagePreview(rawDataUrl);
      try {
        const optimized = await compressImageIfNeeded(rawDataUrl);
        setImageBase64(optimized);
      } catch {
        setImageBase64(rawDataUrl);
      }
      setInputMode("image");
      setPasteNotice("✓ Capture d'écran chargée avec succès !");
      setTimeout(() => setPasteNotice(null), 3000);
    };
    reader.readAsDataURL(file);
  }, []);

  // Détection globale (image OU texte tabulé) dans les données du presse-papier
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

    // 3. Examiner le texte du presse-papier (tableau copié depuis RegTools / Excel / Web)
    const textData = clipboardData.getData ? clipboardData.getData('text/plain') : null;
    if (textData && textData.trim()) {
      if (handlePastedTextContent(textData)) {
        return true;
      }
    }

    return false;
  }, [handleImageFile, handlePastedTextContent]);

  // Écoute globale de l'événement "Coller" (Ctrl+V) n'importe où dans la page
  useEffect(() => {
    const onPaste = (e) => {
      // Si l'utilisateur est déjà en train de taper dans un champ texte standard autre que la zone globale
      const targetTag = e.target?.tagName?.toLowerCase();
      const isInput = targetTag === 'input' && e.target.type !== 'file';
      if (isInput) return; // Laisser le comportement natif d'un input classique

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
      // Priorité au texte si on est en mode texte
      if (navigator.clipboard?.readText) {
        try {
          const text = await navigator.clipboard.readText();
          if (text && handlePastedTextContent(text)) {
            return;
          }
        } catch (e) {
          console.warn("Lecture presse-papier texte non autorisée :", e);
        }
      }

      // Recherche d'image
      if (navigator.clipboard?.read) {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              handleImageFile(blob);
              return;
            }
          }
        }
      }

      setPasteNotice("Presse-papier prêt : appuyez sur Ctrl + V sur votre clavier !");
      setTimeout(() => setPasteNotice(null), 3500);
    } catch (err) {
      console.warn("Erreur presse-papier:", err);
      setPasteNotice("Presse-papier prêt : appuyez sur Ctrl + V sur votre clavier !");
      setTimeout(() => setPasteNotice(null), 3500);
      if (inputMode === 'text' && textAreaRef.current) {
        textAreaRef.current.focus();
      } else if (dropZoneRef.current) {
        dropZoneRef.current.focus();
      }
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
    setPastedText(formatFieldsToText(updated));
  };

  // Modification directe du textarea
  const handleTextareaChange = (text) => {
    setPastedText(text);
    const parsed = parseTableText(text);
    if (parsed && Object.keys(parsed).length > 0) {
      setExtractedFields(parsed);
      const evalRes = evaluateTransactionLocally(parsed);
      setResult(evalRes);
    }
  };

  // Chargement de l'exemple Chauffeur de Taxi (Badri Issam - 70 DT)
  const handleLoadTaxiExample = () => {
    applyExtractedFields(EXEMPLE_TAXI, "✓ Exemple Chauffeur de Taxi (Badri Issam) chargé !");
    setInputMode("text");
    setImagePreview(null);
    setImageBase64(null);
    setError(null);
  };

  // Chargement de l'exemple Médecin (Dr Ben Salah - 5 579 DT)
  const handleLoadDoctorExample = () => {
    applyExtractedFields(EXEMPLE_DOCTEUR, "✓ Exemple Quittance Médecin chargé !");
    setInputMode("text");
    setImagePreview(null);
    setImageBase64(null);
    setError(null);
  };

  const handleClearText = () => {
    setPastedText("");
    setExtractedFields({});
    setResult(null);
    if (textAreaRef.current) textAreaRef.current.focus();
  };

  // Lancement de l'analyse IA Groq (Vision si image présente, sinon Text/LLaMA)
  const handleRunAIAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      if (inputMode === 'image' && imageBase64 && apiKey) {
        setLoadingStep("Lecture visuelle de la capture via Groq Vision (Qwen 3.8 27B)...");
        const aiResult = await analyzeTransactionImageWithGroq(imageBase64);
        if (aiResult.champs_extraits) {
          const merged = { ...extractedFields, ...aiResult.champs_extraits };
          setExtractedFields(merged);
          setPastedText(formatFieldsToText(merged));
        }
        setResult(aiResult);
      } else {
        setLoadingStep("Évaluation experte LCB-FT en cours...");
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
  const fieldCount = Object.keys(extractedFields).length;

  return (
    <div className="analyzer-container anim-up">
      {/* ─── BANDEAU SUPÉRIEUR ────────────────────────────────────────────── */}
      <div className="analyzer-header card">
        <div className="analyzer-header-content">
          <div>
            <div className="badge-tag">ASSISTANT REGTOOLS & CONFORMITÉ AML</div>
            <h2 className="analyzer-title">
              📋 Analyseur Intelligent de Données & Captures RegTools
            </h2>
            <p className="analyzer-subtitle">
              Collez directement le <strong>tableau de données (CLÉ / VALEUR)</strong> copié depuis RegTools pour une précision à 100%, ou une <strong>capture d'écran</strong>. 
              L'outil analyse immédiatement la légitimité AML de la transaction et génère la <strong>Raison de clôture</strong> et la <strong>Note d'investigation</strong> à reporter dans RegTools.
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
              onClick={handleLoadTaxiExample}
              title="Charger l'exemple réel Chauffeur de Taxi (Badri Issam - 70 DT)"
            >
              🚕 Exemple Taxi (Badri Issam)
            </button>
            <button
              className="btn-sec"
              onClick={handleLoadDoctorExample}
              title="Charger l'exemple Médecin (Dr Ben Salah - Espèces > 5 000 DT)"
            >
              🩺 Exemple Médecin
            </button>
          </div>
        </div>

        {/* Configuration de la clé API Groq */}
        {showKeyInput && (
          <div className="api-key-box anim-fade">
            <div className="api-key-header">
              <strong>Configuration de la clé API Groq (Optionnel)</strong>
              <small>Permet d'utiliser les modèles LLM LLaMA / Qwen pour enrichir l'argumentaire juridique.</small>
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

      {/* ─── ZONE D'IMPORTATION : TEXTE OU CAPTURE D'ÉCRAN ─────────────────── */}
      <div className="analyzer-drop-zone-card card">
        {pasteNotice && (
          <div className="paste-success-alert anim-fade">
            <span>{pasteNotice}</span>
          </div>
        )}

        {/* ONGLETS DE SÉLECTION DU MODE DE SAISIE */}
        <div className="input-mode-tabs">
          <button
            type="button"
            className={`input-mode-btn ${inputMode === 'text' ? 'active' : ''}`}
            onClick={() => setInputMode('text')}
          >
            📋 Coller le texte du tableau <span className="mode-badge-rec">100% Précis</span>
          </button>
          <button
            type="button"
            className={`input-mode-btn ${inputMode === 'image' ? 'active' : ''}`}
            onClick={() => setInputMode('image')}
          >
            📸 Capture d'écran (Image)
          </button>
        </div>

        <div className="drop-zone-grid">
          {/* PANNEAU DE GAUCHE : SAISIE TEXTE OU IMAGE */}
          {inputMode === 'text' ? (
            <div className="paste-text-wrapper">
              <div className="paste-text-toolbar">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-accent"
                    onClick={handlePasteFromClipboardApi}
                    title="Coller directement le texte présent dans votre presse-papier"
                  >
                    📋 Coller du presse-papier
                  </button>
                  <button
                    type="button"
                    className="btn-sec"
                    onClick={handleClearText}
                    title="Effacer le contenu de la zone de texte"
                  >
                    🧹 Effacer
                  </button>
                </div>
                <div className="detected-fields-pill">
                  ✓ {fieldCount} champ{fieldCount > 1 ? 's' : ''} détecté{fieldCount > 1 ? 's' : ''}
                </div>
              </div>

              <textarea
                ref={textAreaRef}
                className="paste-textarea"
                rows={12}
                value={pastedText}
                onChange={(e) => handleTextareaChange(e.target.value)}
                placeholder={`Collez ici le tableau copié depuis RegTools (CLÉ / VALEUR)\n\nExemple :\nCLÉ\tVALEUR\nN_CLIENT\t670047\nLIB_PROF\tCHAUFFEUR DE TAXI\nPRIME_ENCAIS\t70416\n...`}
              />

              {/* Puces de prévisualisation en temps réel */}
              <div className="quick-preview-chips">
                <span className="preview-chip">👤 Sociétaire: <strong>{extractedFields.NOM_ADH || "N/A"}</strong></span>
                <span className="preview-chip">💼 Profession: <strong>{extractedFields.LIB_PROF || "N/A"}</strong></span>
                <span className="preview-chip">💰 Prime: <strong>{result?.analyse?.montant_converti_tnd || (extractedFields.PRIME_ENCAIS ? extractedFields.PRIME_ENCAIS + ' millimes' : "N/A")}</strong></span>
                <span className="preview-chip">💳 Mode: <strong>{String(extractedFields.M) === "1" ? "Espèces (M=1)" : "Autre"}</strong></span>
                <span className="preview-chip">📑 Police: <strong>{extractedFields.N_POLICE || "N/A"}</strong></span>
                <span className="preview-chip">🏢 Agence: <strong>{extractedFields.AGENCE || "N/A"}</strong></span>
                {extractedFields.STATUT_CON && (
                  <span className="preview-chip">⚠️ Statut contrat: <strong>{extractedFields.STATUT_CON}</strong></span>
                )}
              </div>
            </div>
          ) : (
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
                  <div className="drop-icon">📸</div>
                  <div className="drop-main-text">
                    <strong>Collez la capture d'écran avec Ctrl + V</strong>
                  </div>
                  <div className="drop-sub-text">
                    Faites votre capture d'écran (Win + Shift + S) puis tapez <strong>Ctrl + V</strong> n'importe où !
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <button
                      type="button"
                      className="btn-accent paste-btn-large"
                      onClick={handlePasteFromClipboardApi}
                      title="Cliquez pour coller l'image présente dans votre presse-papier"
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
          )}

          {/* PANNEAU DE DROITE : ASTUCES & ACTIONS RAPIDES */}
          <div className="drop-zone-side">
            <div className="side-tips">
              <h4>💡 Comment l'utiliser en 3 secondes :</h4>
              <ol>
                <li>
                  <strong>Méthode Texte (Recommandée & 100% fidèle) :</strong> Sélectionnez le tableau dans RegTools avec la souris, tapez <code>Ctrl + C</code>, puis faites <strong>Ctrl + V</strong> ici.
                </li>
                <li>
                  <strong>Méthode Image :</strong> Faites <code>Win + Shift + S</code>, puis <strong>Ctrl + V</strong> ici.
                </li>
                <li>
                  Les résultats s'affichent instantanément avec la <strong>Raison</strong> et la <strong>Note</strong> prêtes à être copiées dans RegTools !
                </li>
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
                  Montant : <strong>{analyse.montant_converti_tnd || "70.416 TND"}</strong> · 
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
