import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from './firebase.js';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, setDoc, writeBatch } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getGroupe, SEUILS, checkAlert, AML_SCENARIOS, BRANCHES_MAPPING, detectBranchAndSystem } from './engine.js';
import { CLIENT_VIDE } from './data.js';
import './styles.css';
import { debounce } from 'lodash';
import * as XLSX from 'xlsx';
import { generateAMLReport } from './groqService.js';
import TransactionCaptureAnalyzer from './TransactionCaptureAnalyzer.jsx';

const auth = getAuth();

const AuthGate = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="loading-screen">Chargement...</div>;
  }

  return user ? <App /> : <LoginScreen />;
};

const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      setError('Email ou mot de passe invalide.');
      console.error(error)
    }
  };

  const handleSignUp = async () => {
    setError(null);
    if (password.length < 6) {
      setError('Le mot de passe doit faire au moins 6 caractères.');
      return;
    }
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      setError('Impossible de créer le compte. L\'email est peut-être déjà utilisé ou invalide.');
      console.error(error)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-box">
        <div className="hdr-ico">S</div>
        <h2>Simulateur Indicateurs AML</h2>
        <p>Veuillez vous connecter pour accéder au simulateur.</p>
        <form onSubmit={handleSignIn}>
          <Field label="Adresse e-mail" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.com" />
          <Field label="Mot de passe" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="run">Se connecter</button>
        </form>
        <p className="signup-text">Pas encore de compte ? <button onClick={handleSignUp} className="link-btn">Créez-en un.</button></p>
      </div>
    </div>
  );
};

function App() {

  const [clients, setClients] = useState([]);
  const [history, setHistory] = useState([]);
  const [simResults, setSimResults] = useState({});
  const [theme, setTheme] = useState("dark");
  const [selId, setSelId] = useState(null);
  const [form, setForm] = useState(null);
  const [tab, setTab] = useState("alerte");
  const [bulkData, setBulkData] = useState([]);
  const [globalError, setGlobalError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, nom }

  useEffect(() => {
    if (!auth.currentUser) return;

    const handleSnapshotError = (err, context) => {
      console.error(`Erreur de lecture (${context}):`, err);
      setGlobalError(`Impossible de charger les données (${context}). Vérifiez vos règles de sécurité Firestore et la connexion.`)
    }

    const unsubscribeClients = onSnapshot(collection(db, 'clients'),
      snapshot => setClients(snapshot.docs.map(doc => {
        const data = doc.data();
        return { ...data, id: doc.id }; // L'ID Firestore gagne toujours sur le champ 'id' éventuel de la data
      })),
      err => handleSnapshotError(err, 'clients')
    );
    const unsubscribeHistory = onSnapshot(collection(db, 'history'),
      snapshot => setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))),
      err => handleSnapshotError(err, 'history')
    );
    const unsubscribeResults = onSnapshot(collection(db, 'simResults'),
      snapshot => {
        const resultsData = {};
        snapshot.docs.forEach(doc => { 
          resultsData[doc.id] = {
            results: doc.data().results,
            riskScore: doc.data().riskScore
          }; 
        });
        setSimResults(resultsData);
      },
      err => handleSnapshotError(err, 'simulations')
    );

    return () => { unsubscribeClients(); unsubscribeHistory(); unsubscribeResults(); };
  }, []);

  const toggleTheme = () => setTheme(p => p === 'light' ? 'dark' : 'light');
  useEffect(() => { document.body.setAttribute('data-theme', theme); }, [theme]);

  const selectClient = useCallback((c) => {
    if (!c) return;
    setSelId(c.id);
    setForm({ ...c });
    setTab("alerte");
  }, []);

  useEffect(() => {
    if (clients.length > 0 && !selId) {
      selectClient(clients[0]);
    } else if (clients.length > 0 && selId) {
      const selectedInList = clients.find(c => c.id === selId);
      if (selectedInList) {
        setForm(prev => ({ ...prev, ...selectedInList }));
      }
      else selectClient(clients[0])
    } else if (clients.length === 0) {
      setForm(null);
      setSelId(null);
    }
  }, [clients, selId, selectClient]);

  const addClient = async () => {
    setGlobalError(null);
    try {
      // S'assurer qu'on ne stocke pas de champ 'id' à l'intérieur du document
      const { id, ...cleanData } = CLIENT_VIDE;
      const newClient = {
        ...cleanData,
        nom: `Nouveau client ${clients.length + 1}`,
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'clients'), newClient);
      selectClient({ id: docRef.id, ...newClient });
    } catch (e) {
      console.error("Error adding client: ", e);
      setGlobalError(`Erreur d'ajout de client: ${e.message}`);
    }
  };

  const deleteClient = async (e, idToDelete) => {
    e.stopPropagation();
    const client = clients.find(c => c.id === idToDelete);
    setConfirmDelete({ id: idToDelete, nom: client?.nom || idToDelete });
  };

  const doDeleteClient = async () => {
    // Capturer l'ID pour éviter les effets de bord d'état asynchrone
    const target = confirmDelete;
    setConfirmDelete(null);

    if (!target || !target.id || String(target.id).trim() === '') {
      console.error("Tentative de suppression avec un ID invalide:", target);
      setGlobalError(`Erreur: Identifiant client invalide (${JSON.stringify(target?.id)})`);
      return;
    }

    const idToDelete = String(target.id).trim();
    setGlobalError(null);

    try {
      console.log("Suppression du client:", idToDelete);
      // Utilisation explicite du chemin complet pour éviter toute ambiguïté
      await deleteDoc(doc(db, "clients", idToDelete));
      await deleteDoc(doc(db, "simResults", idToDelete));

      // Si c'était le client sélectionné, on déselectionne
      if (selId === idToDelete) {
        setSelId(null);
        setForm(null);
      }
    } catch (e) {
      console.error("Erreur Firestore lors de la suppression:", e);
      setGlobalError(`Erreur de suppression: ${e.message} (ID: ${JSON.stringify(idToDelete)})`);
    }
  };

  const debouncedUpdate = useMemo(() =>
    debounce(async (id, field, value) => {
      if (!id || String(id).trim() === "") return;
      setGlobalError(null);
      try {
        const docRef = doc(db, 'clients', String(id).trim());
        // Ne jamais mettre à jour le champ 'id' lui-même dans le document
        if (field === 'id') return;
        await updateDoc(docRef, { [field]: value });
      } catch (e) {
        console.error("Error updating client: ", e);
        setGlobalError(`Erreur de mise à jour: ${e.message}`);
      }
    }, 400),
    []);

  const updateFormField = (key, value) => {
    if (!form) return;
    setForm(prevForm => {
      const newForm = { ...prevForm, [key]: value };
      debouncedUpdate(newForm.id, key, value);
      return newForm;
    });
  };

  const lancerSim = async () => {
    if (!form || !form.id) {
      setGlobalError("Aucun client sélectionné pour lancer la simulation.");
      return;
    }
    setGlobalError(null);
    try {
      const { indicators: results, riskScore } = checkAlert(form);
      const batch = writeBatch(db);

      const resultsRef = doc(db, 'simResults', form.id);
      batch.set(resultsRef, { results, riskScore });

      const historyRef = doc(collection(db, 'history'));
      batch.set(historyRef, {
        clientId: form.id,
        clientName: form.nom,
        timestamp: new Date().toISOString(),
        results,
        riskScore
      });

      await batch.commit();
      setTab("resultats");
    } catch (e) {
      console.error("Error running simulation: ", e);
      setGlobalError(`Erreur de simulation: ${e.message}`);
    }
  };

  const runAll = async () => {
    setGlobalError(null);
    try {
      const batch = writeBatch(db);
      clients.forEach(c => {
        const { indicators: results, riskScore } = checkAlert(c);
        const resRef = doc(db, "simResults", c.id);
        batch.set(resRef, { results, riskScore });

        const histRef = doc(collection(db, "history"));
        batch.set(histRef, {
          clientId: c.id,
          clientName: c.nom,
          timestamp: new Date().toISOString(),
          results,
          riskScore
        });
      });
      await batch.commit();
      alert(`${clients.length} clients ont été analysés avec succès !`);
    } catch (e) {
      console.error("Error running all simulations: ", e);
      setGlobalError(`Erreur d'analyse globale: ${e.message}`);
    }
  };

  const getDot = (id) => {
    const simData = simResults[id];
    if (!simData || !simData.results) return "cli-dot d-ok";
    const alerts = simData.results.filter(x => x.alerte);
    if (!alerts.length) return "cli-dot d-ok";
    if (alerts.some(x => x.gravite === "critique")) return "cli-dot d-hi";
    return "cli-dot d-med";
  };

  const curSim = selId ? simResults[selId] : null;
  const curInds = curSim ? curSim.results : null;
  const curRiskScore = curSim ? curSim.riskScore : null;
  const curAlerts = curInds ? curInds.filter(x => x.alerte) : [];
  const grp = form ? getGroupe(form.activite) : null;

  return (
    <div className="app">
      <Header theme={theme} toggleTheme={toggleTheme} />
      <Sidebar
        clients={clients}
        selId={selId}
        selectClient={selectClient}
        addClient={addClient}
        deleteClient={deleteClient}
        getDot={getDot}
        onImport={(newClients) => {
          const withResults = newClients.map(c => ({
            ...c,
            analysis: checkAlert(c)
          }));
          setBulkData(withResults);
          setTab("batch");
        }}
      />
      <main className="main">
        <ErrorDisplay message={globalError} onClose={() => setGlobalError(null)} />
        {confirmDelete && (
          <div className="confirm-overlay">
            <div className="confirm-box">
              <div className="confirm-title">Supprimer le client ?</div>
              <div className="confirm-msg">Cette action est irréversible. Le client <strong>{confirmDelete.nom}</strong> et toutes ses simulations seront supprimés.</div>
              <div className="confirm-actions">
                <button className="confirm-cancel" onClick={() => setConfirmDelete(null)}>Annuler</button>
                <button className="confirm-ok" onClick={doDeleteClient}>🗑️ Supprimer</button>
              </div>
            </div>
          </div>
        )}
        {tab === "capture" ? (
          <>
            <div className="tabs">
              <Tab id="alerte" label="🔎 Simulation d'alerte" currentTab={tab} setTab={setTab} />
              <Tab id="capture" label="📸 Capture RegTools" currentTab={tab} setTab={setTab} />
              <Tab id="resultats" label={`Derniers résultats ${curInds ? `· ${curAlerts.length} alerte${curAlerts.length !== 1 ? "s" : ""}` : ""}`} currentTab={tab} setTab={setTab} />
              <Tab id="global" label="Vue globale" currentTab={tab} setTab={setTab} />
              <Tab id="history" label={`Historique (${history.length})`} currentTab={tab} setTab={setTab} />
              <Tab id="config" label="⚙️ Configuration des seuils" currentTab={tab} setTab={setTab} />
              {bulkData.length > 0 && <Tab id="batch" label={`📊 Analyse de masse (${bulkData.length})`} currentTab={tab} setTab={setTab} />}
              {curInds && <Tab id="smart" label="🤖 Smart-AML" currentTab={tab} setTab={setTab} />}
            </div>
            <div className="cnt">
              <TransactionCaptureAnalyzer />
            </div>
          </>
        ) : clients.length > 0 && form ? (
          <>
            <div className="tabs">
              <Tab id="alerte" label="🔎 Simulation d'alerte" currentTab={tab} setTab={setTab} />
              <Tab id="capture" label="📸 Capture RegTools" currentTab={tab} setTab={setTab} />
              <Tab id="resultats" label={`Derniers résultats ${curInds ? `· ${curAlerts.length} alerte${curAlerts.length !== 1 ? "s" : ""}` : ""}`} currentTab={tab} setTab={setTab} />
              <Tab id="global" label="Vue globale" currentTab={tab} setTab={setTab} />
              <Tab id="history" label={`Historique (${history.length})`} currentTab={tab} setTab={setTab} />
              <Tab id="config" label="⚙️ Configuration des seuils" currentTab={tab} setTab={setTab} />
              {bulkData.length > 0 && <Tab id="batch" label={`📊 Analyse de masse (${bulkData.length})`} currentTab={tab} setTab={setTab} />}
              {curInds && <Tab id="smart" label="🤖 Smart-AML" currentTab={tab} setTab={setTab} />}
            </div>
            <div className="cnt">
              {tab === "alerte" && <AlertSimPanel
                activeClient={form}
                selId={selId}
                updateField={updateFormField}
                addClient={addClient}
                lancerHistorique={lancerSim}
              />}
              {tab === "resultats" && <ResultPanel results={curInds} client={form} riskScore={curRiskScore} />}
              {tab === "global" && <GlobalPanel clients={clients} results={simResults} runAll={runAll} selectClient={selectClient} setTab={setTab} />}
              {tab === "history" && <HistoryPanel history={history} />}
              {tab === "config" && <SettingsPanel />}
              {tab === "batch" && <BulkAnalysisView data={bulkData} onClear={() => { setBulkData([]); setTab("alerte"); }} />}
              {tab === "smart" && <SmartAMLPanel client={form} results={curInds} />}
            </div>
          </>
        ) : (
          <WelcomePanel addClient={addClient} setTab={setTab} />
        )}
      </main>
    </div>
  );
}

export default AuthGate;

const ErrorDisplay = ({ message, onClose }) => {
  if (!message) return null;
  return (
    <div className="error-banner">
      <span>{message}</span>
      <button onClick={onClose} className="close-btn">&times;</button>
    </div>
  );
};

const Header = ({ theme, toggleTheme }) => {
  const user = auth.currentUser;
  return (
    <header className="hdr">
      <div className="hdr-ico">S</div>
      <div>
        <div className="hdr-t">Simulateur Indicateurs AML</div>
        <div className="hdr-s">Monitoring LCB-FT</div>
      </div>
      <div className="hdr-r">
        <div className='user-info'>
          {user.email}
        </div>
        <button onClick={() => signOut(auth)} className='logout-btn'>Déconnexion</button>
        <button className="theme-toggle" onClick={toggleTheme} title="Changer de thème">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>
    </header>
  );
};

const Sidebar = ({ clients, selId, selectClient, addClient, deleteClient, getDot, onImport }) => {
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);

      const imported = data.map(row => {
        const obj = { ...CLIENT_VIDE };
        // Mémorisation de l'ensemble des données d'origine
        Object.assign(obj, row);

        Object.keys(row).forEach(key => {
          const k = key.trim().toLowerCase();
          const val = row[key];

          // 1. Branche & Système (C_BR, N_CIE, LIB_CIE, N_BRA, LIB_BRANCHE)
          if (k === 'c_br') obj.C_BR = String(val).toUpperCase().trim();
          if (k === 'n_cie') obj.N_CIE = String(val).trim();
          if (k === 'lib_cie') obj.LIB_CIE = String(val).trim();
          if (k === 'n_bra') obj.N_BRA = String(val).trim();
          if (k === 'lib_branche' || k === 'lib_bran') obj.LIB_BRANCHE = String(val).trim();

          // 2. Sociétaire & KYC
          if (k === 'nom' || k === 'nom_adh') obj.nom = val;
          if (k === 'prenom' || k === 'prénom') obj.prenom = val;
          if (k === 'n_client') obj.id = String(val);
          if (k === 'cin') obj.cin = String(val);
          if (k === 'pays') obj.pays = val;
          if (k === 'activite' || k === 'lib_prof') obj.activite = val;
          if (k === 'c_prof') obj.C_PROF = val;
          if (k === 'risque' || k === 'riskvalue') obj.niveauRisque = String(val).includes('Elev') ? 'RE' : 'RM/RF';

          // 3. Montants (Gestion automatique des montants)
          if (k === 'capital' || k === 'max_cap') obj.capitalAssure = Number(val);
          if (k === 'prime' || k === 'prime_encais') obj.prime = Number(val);
          if (k === 'val_vente' || k === 'val_neuf') obj.valeurBien = Number(val);
          if (k === 'rachat') obj.valeurRachat = Number(val);
          if (k === 'augmentation') obj.augmentationCapital = Number(val);
          if (k === 'especes' || k === 'amount') obj.paiementEspeces = Number(val);

          // 4. Mode de paiement
          if (k === 'm') {
            obj.M = String(val);
            if (String(val).trim() === '1') {
              obj.isEspeces = true;
              obj.paiementEspeces = obj.prime || obj.paiementEspeces;
            }
          }
          if (k === 'mode_paiement') {
            obj.MODE_PAIEMENT = val;
            if (String(val).toUpperCase().includes('ESPEC')) obj.isEspeces = true;
          }

          // 5. Dates & Contrat
          if (k === 'n_police') obj.police = val;
          if (k === 'n_quittance') obj.quittance = val;
          if (k === 'agence') obj.agence = val;
          if (k === 'datesouscription' || k === 'eff_pol') obj.dateSouscription = val;
          if (k === 'dateoperation' || k === 'eff_quit') obj.dateOperation = val;
          if (k === 'nbcontrats') obj.nbContrats3Ans = Number(val);
        });

        // Détection et normalisation automatique de la branche via le référentiel complet (A, B, C, I, M, N, G, E)
        const branchDetected = detectBranchAndSystem(obj);
        obj.C_BR = obj.C_BR || branchDetected.code;
        obj.branche = obj.branche || branchDetected.branche;
        obj.source_system = obj.source_system || branchDetected.source_system;
        obj.brancheNom = branchDetected.nom;
        if (branchDetected.code === 'B' && obj.baytIIcoherent === undefined) {
          obj.baytIIcoherent = false;
        }

        return obj;
      });
      onImport(imported);
    };
    reader.readAsBinaryString(file);
  };

  return (
    <aside className="sb">
      <div className="sb-hd">
        <div className="sb-lbl">Portefeuille ({clients.length} clients)</div>
      </div>
      <div className="sb-list">
        {clients.map(c => (
          <div key={c.id} className={`cli ${selId === c.id ? "active" : ""}`} onClick={() => selectClient(c)}>
            <div className="cli-av">{c.nom.charAt(0).toUpperCase()}</div>
            <div className="cli-info">
              <div className="cli-nm">{c.nom}</div>
              <div className="cli-id">{c.id}</div>
            </div>
            <div className={getDot(c.id)} />
            <button className="cli-del" onClick={(e) => deleteClient(e, c.id)} title="Supprimer client">🗑️</button>
          </div>
        ))}
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="sb-add" onClick={addClient}>+ Ajouter un client</button>
        <label className="sb-add" style={{ background: 'var(--text-accent)', textAlign: 'center', cursor: 'pointer' }}>
          📂 Importer Excel / CSV
          <input type="file" accept=".csv, .xlsx, .xls" onChange={handleFile} style={{ display: 'none' }} />
        </label>
      </div>
    </aside>
  );
};

const Tab = ({ id, label, currentTab, setTab }) => (
  <div className={`tab ${currentTab === id ? "on" : ""}`} onClick={() => setTab(id)}>{label}</div>
);

const WelcomePanel = ({ addClient, setTab }) => (
  <div className="welcome-panel">
    <h2>Bienvenue sur le Simulateur AML</h2>
    <p>Gérez vos clients ou analysez directement une capture d'écran d'alerte RegTools.</p>
    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 15, flexWrap: 'wrap' }}>
      <button className="run" onClick={addClient}>+ Créer un client</button>
      {setTab && (
        <button className="btn-accent" onClick={() => setTab("capture")}>
          📸 Analyser une capture RegTools
        </button>
      )}
    </div>
  </div>
);



const ResultPanel = ({ results, client, riskScore }) => {
  const [copiedKey, setCopiedKey] = useState(null);

  if (!results) return (
    <div className="empty-state">
      <h3>Aucune simulation lancée pour ce client.</h3>
      <p>Allez dans l'onglet "Simulation d'alerte" et cliquez sur "Lancer le Test".</p>
    </div>
  );
  const alerts = results.filter(r => r.alerte);
  const getVerdict = () => {
    if (alerts.length === 0) return { label: "Conforme", chip: "c-grn" };
    if (alerts.some(a => a.gravite === 'critique')) return { label: "Critique", chip: "c-red" };
    if (alerts.some(a => a.gravite === 'haute')) return { label: "Haute", chip: "c-ora" };
    return { label: "Moyenne", chip: "c-yel" };
  };
  const verdict = getVerdict();

  const getRiskScoreColor = (niveau) => {
    switch (niveau) {
      case "critique": return "c-red";
      case "haute": return "c-ora";
      case "moyenne": return "c-yel";
      default: return "c-grn";
    }
  };

  const copyText = (txt, key) => {
    if (!txt) return;
    navigator.clipboard.writeText(txt);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  return (
    <div>
      <div className="panel-t">Résultats d'évaluation — Matrice des 13 Scénarios</div>
      <div className="verdict-box">
        <div className={`vc ${alerts.length === 0 ? "vc-ok" : "vc-al"}`}>
          <div className="vc-n">{alerts.length}</div>
          <div className="vc-sub">{alerts.length === 0 ? "✓ CONFORME" : "⚠ ALERTE(S)"}</div>
        </div>
        <div>
          <div className="vd-nm">{client.nom}</div>
          <div className="vd-meta">{client.id} · {client.activite} · Risque: {client.niveauRisque}</div>
          <div className="vd-chips">
            <span className={`chip ${verdict.chip}`}>Risque Global: {verdict.label}</span>
            {riskScore && (
              <span className={`chip ${getRiskScoreColor(riskScore.niveau)}`}>
                Score de risque: {riskScore.percentage}% ({riskScore.niveau})
              </span>
            )}
          </div>
        </div>
      </div>

      <table className="ind-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Scénario Officiel</th>
            <th>Valeur constatée</th>
            <th>Seuil réglementaire</th>
            <th style={{ textAlign: "center" }}>Verdict</th>
          </tr>
        </thead>
        <tbody>
          {results.map(ind => (
            <tr key={ind.id} className={ind.alerte ? "row-alerte" : ""}>
              <td>
                <div className="ind-id" style={{ fontWeight: 'bold' }}>
                  {ind.code ? ind.code.replace('SCEN_', 'S') : `S${ind.id}`}
                </div>
              </td>
              <td>
                <div className="ind-label" style={{ fontWeight: ind.alerte ? 700 : 500 }}>
                  {ind.label}
                </div>
                <div className="ind-rule" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {ind.regle}
                </div>
              </td>
              <td><div className="ind-vals">{ind.valeurs}</div></td>
              <td>
                <div className="seuil-lbl">{ind.seuil}</div>
                {ind.detail && <div className={ind.alerte ? "detail-al" : "detail-ok"}>{ind.detail}</div>}
              </td>
              <td style={{ textAlign: "center" }}>
                {ind.alerte
                  ? <span className={`v-ALERTE g-${ind.gravite.slice(0, 1)}`}>⚠ {ind.gravite.toUpperCase()}</span>
                  : <span className="v-OK">✓ OK</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ─── VOLET DÉCISIONNEL & LIVRABLES REGTOOLS / CTAF ────────────────── */}
      {alerts.length > 0 && (
        <div className="card anim-up" style={{ marginTop: 24, borderTop: '4px solid var(--text-accent)' }}>
          <div className="card-hd">
            <div>
              <h3 className="card-tit" style={{ margin: 0 }}>
                ⚖️ Livrables de décision pour les {alerts.length} alerte{alerts.length > 1 ? 's' : ''} déclenchée{alerts.length > 1 ? 's' : ''}
              </h3>
              <p className="card-desc">
                Textes réglementaires générés automatiquement, prêts à être copiés dans RegTools ou le portail CTAF.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
            {alerts.map((al, idx) => {
              const dec = al.decisions || {};
              const kCloture = `cloture_${al.id}`;
              const kInvest = `invest_${al.id}`;
              const kSoupcon = `soupcon_${al.id}`;

              return (
                <div key={al.id} style={{ background: 'var(--bg-accent)', padding: 14, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`chip ${al.gravite === 'critique' ? 'c-red' : 'c-ora'}`}>
                        {al.code}
                      </span>
                      <strong>{al.label}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-accent btn-sm"
                        onClick={() => copyText(dec.raisonCloture, kCloture)}
                        title="Copier la raison de clôture sans suite"
                      >
                        {copiedKey === kCloture ? '✓ Raison copiée !' : '📋 Copier Raison Clôture'}
                      </button>
                      <button
                        type="button"
                        className="btn-sec btn-sm"
                        onClick={() => copyText(dec.noteInvestigation, kInvest)}
                        title="Copier la note d'investigation"
                      >
                        {copiedKey === kInvest ? '✓ Note copiée !' : '🔍 Copier Note Investigation'}
                      </button>
                      <button
                        type="button"
                        className="btn-sec btn-sm"
                        style={{ color: '#dc2626', borderColor: '#dc2626' }}
                        onClick={() => copyText(dec.motifSoupcon, kSoupcon)}
                        title="Copier l'argumentaire pour la CTAF"
                      >
                        {copiedKey === kSoupcon ? '✓ CTAF copié !' : '🚨 Copier Motif CTAF'}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ background: 'var(--bg-sec)', padding: 10, borderRadius: 6, fontSize: '0.85rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        Champ RegTools « Raison * » (Clôture) :
                      </div>
                      <div style={{ color: 'var(--text-primary)', fontStyle: 'italic' }}>
                        {dec.raisonCloture}
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg-sec)', padding: 10, borderRadius: 6, fontSize: '0.85rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        Encadré RegTools « Note d'investigation » :
                      </div>
                      <div style={{ color: 'var(--text-primary)', maxHeight: 100, overflowY: 'auto', whiteSpace: 'pre-line' }}>
                        {dec.noteInvestigation}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const SettingsPanel = () => {
  const [activeTab, setActiveTab] = useState("referentiel"); // "referentiel" ou "seuils"
  const [seuils, setSeuils] = useState(SEUILS);
  const [modified, setModified] = useState(false);

  const handleSeuilChange = (indicateur, groupe, risque, valeur) => {
    const newSeuils = JSON.parse(JSON.stringify(seuils));
    if (risque) {
      newSeuils[indicateur][groupe][risque] = Number(valeur);
    } else {
      newSeuils[indicateur][groupe] = Number(valeur);
    }
    setSeuils(newSeuils);
    setModified(true);
  };

  const handleSave = () => {
    setModified(false);
    alert("Seuils sauvegardés avec succès !");
  };

  const handleReset = () => {
    setSeuils(SEUILS);
    setModified(false);
    alert("Seuils réinitialisés à la valeur par défaut !");
  };

  const exportMappingToExcel = () => {
    try {
      const rows = [];
      Object.values(BRANCHES_MAPPING).forEach(b => {
        b.cies.forEach(c => {
          const branchesList = c.lib_branches ? c.lib_branches.join(", ") : (c.lib_branche || "Standard");
          rows.push({
            "Code Branche (C_BR)": b.code,
            "Branche d'assurance": b.nom,
            "Catégorie": b.branche,
            "Système Source RegTools": b.source_system,
            "Code Compagnie (N_CIE)": c.n_cie,
            "Libellé Compagnie (LIB_CIE)": c.lib_cie,
            "Produits détaillés (LIB_BRANCHE)": branchesList,
            "Scénarios AML Déclenchés": b.scenarios.join(", ")
          });
        });
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 10 },
        { wch: 36 },
        { wch: 12 },
        { wch: 22 },
        { wch: 12 },
        { wch: 18 },
        { wch: 60 },
        { wch: 35 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Mapping Produits & AML");
      XLSX.writeFile(wb, "Referentiel_Mapping_Branches_Produits_AML.xlsx");
    } catch (err) {
      console.error("Erreur export Excel:", err);
      alert("Erreur lors de l'exportation vers Excel.");
    }
  };

  const exportMappingToPDF = () => {
    try {
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert("Veuillez autoriser les fenêtres pop-up de votre navigateur pour générer le PDF.");
        return;
      }

      const rowsHtml = Object.values(BRANCHES_MAPPING).map(b => {
        const ciesHtml = b.cies.map(c => `<div><strong>${c.n_cie}</strong> — ${c.lib_cie}</div>`).join('');
        const prodsHtml = b.cies.flatMap(c => c.lib_branches || [c.lib_branche]).filter(Boolean).join(', ');
        const scenHtml = b.scenarios.map(s => `<span style="display:inline-block;background:#fee2e2;color:#991b1b;padding:1px 5px;border-radius:3px;font-weight:700;font-size:9px;margin:1px;">${s}</span>`).join(' ');
        const catBadge = b.branche === 'Vie'
          ? '<span style="background:#fef3c7;color:#b45309;padding:2px 6px;border-radius:4px;font-weight:700;font-size:10px;">Vie</span>'
          : '<span style="background:#dcfce7;color:#15803d;padding:2px 6px;border-radius:4px;font-weight:700;font-size:10px;">Non-Vie</span>';

        return `
          <tr>
            <td style="text-align:center;font-weight:bold;font-size:13px;color:#1d4ed8;">${b.code}</td>
            <td><strong>${b.nom}</strong></td>
            <td style="text-align:center;">${catBadge}</td>
            <td><code>${b.source_system}</code></td>
            <td style="font-size:10px;">${ciesHtml}</td>
            <td style="color:#334155;font-size:10px;">${prodsHtml}</td>
            <td>${scenHtml}</td>
          </tr>
        `;
      }).join('');

      const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Référentiel Officiel du Mapping des Produits & Branches - AML</title>
  <style>
    @page { size: landscape; margin: 10mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; padding: 15px; color: #0f172a; font-size: 11px; }
    .hdr { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 12px; }
    .hdr-t { font-size: 16px; font-weight: 800; color: #1e3a8a; }
    .hdr-s { font-size: 11px; color: #64748b; margin-top: 2px; }
    .badge-d { background: #eff6ff; color: #1d4ed8; padding: 4px 8px; border-radius: 4px; font-weight: 700; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10px; }
    th, td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; color: #0f172a; font-weight: 700; text-transform: uppercase; font-size: 9px; }
    tr:nth-child(even) { background: #f8fafc; }
    .ftr { margin-top: 15px; font-size: 9px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 6px; display: flex; justify-content: space-between; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="hdr">
    <div>
      <div class="hdr-t">RÉFÉRENTIEL OFFICIEL DU MAPPING DES PRODUITS & BRANCHES D'ASSURANCE</div>
      <div class="hdr-s">Dispositif de Surveillance LCB-FT / RegTools & Matrice des 13 Scénarios Réglementaires</div>
    </div>
    <div style="text-align:right;">
      <span class="badge-d">Date d'édition : ${new Date().toLocaleDateString('fr-TN')}</span>
      <div style="font-size:9px;color:#64748b;margin-top:4px;">13 Branches & Sous-produits intégrés</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40px;text-align:center;">C_BR</th>
        <th style="width:160px;">Branche d'assurance</th>
        <th style="width:65px;text-align:center;">Catégorie</th>
        <th style="width:110px;">Système Source</th>
        <th style="width:140px;">Codes N_CIE & LIB_CIE</th>
        <th>Produits détaillés (LIB_BRANCHE)</th>
        <th style="width:140px;">Scénarios AML</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="ftr">
    <div>MAE Assurances — Direction de la Conformité & Contrôle Permanent LCB-FT (Loi n°2015-26 & Règlement CGA 2019-02)</div>
    <div>Export Automatisé Simulateur AML</div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 300);
    };
  </script>
</body>
</html>`;

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    } catch (err) {
      console.error("Erreur export PDF:", err);
      alert("Erreur lors de la génération du document PDF.");
    }
  };

  return (
    <div>
      <div className="panel-t">Référentiel & Configuration des 13 Scénarios AML</div>
      <p className="panel-desc">
        L'ensemble des 13 scénarios réglementaires est mémorisé dans le fichier <code>src/scenariosConfig.js</code> pour modification ultérieure.
      </p>

      {/* Onglets de configuration */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`input-mode-btn ${activeTab === 'referentiel' ? 'active' : ''}`}
          onClick={() => setActiveTab('referentiel')}
        >
          📚 Référentiel des 13 Scénarios (Fichier scenariosConfig.js)
        </button>
        <button
          type="button"
          className={`input-mode-btn ${activeTab === 'mapping' ? 'active' : ''}`}
          onClick={() => setActiveTab('mapping')}
        >
          🏛️ Dictionnaire de Mapping des Branches (C_BR, N_CIE, N_BRA)
        </button>
        <button
          type="button"
          className={`input-mode-btn ${activeTab === 'seuils' ? 'active' : ''}`}
          onClick={() => setActiveTab('seuils')}
        >
          ⚙️ Ajustement rapide des seuils
        </button>
      </div>

      {activeTab === 'referentiel' ? (
        <div className="scenarios-matrix anim-up">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {AML_SCENARIOS.map(sc => (
              <div key={sc.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="chip" style={{ background: 'var(--text-accent)', color: '#fff', fontWeight: 700 }}>
                      {sc.code}
                    </span>
                    <strong style={{ fontSize: '1rem' }}>{sc.description}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span className="chip c-grn">Branche: {sc.branche}</span>
                    <span className={`chip ${sc.gravite === 'critique' ? 'c-red' : 'c-ora'}`}>
                      Gravité: {sc.gravite}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                  <strong>Déclencheur (Trigger) :</strong> <code>{JSON.stringify(sc.declencheur)}</code>
                </div>

                {sc.sousRegles?.length > 0 && (
                  <div style={{ marginTop: 8, background: 'var(--bg-accent)', padding: 10, borderRadius: 6, fontSize: '0.82rem' }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      Sous-règles ({sc.sousRegles.length}) :
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {sc.sousRegles.map((sr, i) => (
                        <li key={i} style={{ marginBottom: 2 }}>
                          <strong>Règle {sr.id} :</strong> {sr.label} {sr.seuilDT ? `(Seuil: ${sr.seuilDT.toLocaleString('fr-TN')} DT)` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : activeTab === 'mapping' ? (
        <div className="card anim-up" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem' }}>
                🏛️ Dictionnaire de Mapping Complet : Branches d'Assurance & Système de Gestion
              </h3>
              <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                Correspondance entre les colonnes de votre base de données d'assurance (<code>C_BR</code>, <code>N_CIE</code>, <code>LIB_CIE</code>, <code>N_BRA</code>, <code>LIB_BRANCHE</code>) et les moteurs d'alerte AML (13 Scénarios réglementaires).
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                style={{ background: '#107c41', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: '0.88rem', cursor: 'pointer', borderRadius: 6, color: '#fff', border: 'none', fontWeight: 600 }}
                onClick={exportMappingToExcel}
                title="Exporter l'ensemble du référentiel sous format Excel (.xlsx)"
              >
                📗 Exporter vers Excel (.xlsx)
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ background: '#dc2626', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: '0.88rem', cursor: 'pointer', borderRadius: 6, color: '#fff', border: 'none', fontWeight: 600 }}
                onClick={exportMappingToPDF}
                title="Générer un rapport PDF prêt à imprimer ou enregistrer en PDF"
              >
                📄 Exporter vers PDF (.pdf)
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="bulk-table" style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th style={{ width: 60, textAlign: 'center' }}>C_BR</th>
                  <th>Branche d'assurance</th>
                  <th>Catégorie</th>
                  <th>Système source RegTools</th>
                  <th>Codes N_CIE & LIB_CIE</th>
                  <th>Produits & LIB_BRANCHE</th>
                  <th>Scénarios AML Déclenchés</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(BRANCHES_MAPPING).map(b => (
                  <tr key={b.code}>
                    <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                      <span className="chip" style={{ background: 'var(--text-accent)', color: '#fff', fontSize: '0.9rem' }}>
                        {b.code}
                      </span>
                    </td>
                    <td>
                      <strong>{b.nom}</strong>
                    </td>
                    <td>
                      <span className={`chip ${b.branche === 'Vie' ? 'c-yel' : 'c-grn'}`}>
                        {b.branche}
                      </span>
                    </td>
                    <td>
                      <code>{b.source_system}</code>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {b.cies.map((c, i) => (
                          <span key={i} style={{ fontSize: '0.8rem' }}>
                            <strong>{c.n_cie}</strong> — {c.lib_cie}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxHeight: 80, overflowY: 'auto' }}>
                        {b.cies.flatMap(c => c.lib_branches || [c.lib_branche]).filter(Boolean).join(', ')}
                      </div>
                    </td>
                    <td>
                      <div className="scenario-chips">
                        {b.scenarios.map(s => (
                          <span key={s} className="chip-id grav-haute" style={{ fontSize: '0.75rem' }}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 20, background: 'var(--bg-accent)', padding: 14, borderRadius: 8, fontSize: '0.84rem' }}>
            <strong>💡 Principes d'intégration & Règles de gestion AML (13 Branches) :</strong>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
              <li><strong>Branches Non-Vie / IRDS (<code>A</code>, <code>I</code>, <code>M</code>, <code>C</code>, <code>N</code>, <code>Q</code>, <code>R</code>, <code>T</code>, <code>G</code>) :</strong> Rattachées au système opérationnel <code>Auto/Irds</code>. Évaluées automatiquement sur les <strong>Scénarios 01</strong> (Capitaux assurés), <strong>02</strong> (Primes de souscription) et <strong>10</strong> (Paiements en espèces &gt; 1 000 DT / 3 000 DT / 5 000 DT).</li>
              <li><strong>Branche Temporaire Décès Dégressif & Emprunteur (<code>V</code> - Codes 700 TD_DEGRESS, 701 PREVOYANCE) :</strong> Assurance Vie Emprunteur (crédits BNA, conventions SONEDE, OMMP, RNTA, OACA, CNRPS, ONAS, Éducation). Capitaux décès dégressifs adossés à des financements. Surveillance des bénéficiaires délégués (Scénario 07) et règlements espèces (Scénario 10).</li>
              <li><strong>Branche Risques Techniques (<code>Q</code> - Codes 260 BDM, 261 TRC, 263 TRI, 267 TRE, 268 EDC) :</strong> Chantiers BTP, engins et bris de machines. Capitaux garantis colossaux (souvent &gt; 10M DT). Surveillance des capitaux assurés et des grands comptes.</li>
              <li><strong>Branche Responsabilité Civile & Risques Divers (<code>R</code> - Codes 220 VOL, 230 RC, 231 DECENNALE, 240 DDE, 250 BDG, 290 RC_COMPT) :</strong> RC Professionnelles (avocats, experts-comptables, médecins, architectes) et RC Décennale. Évaluée sur les capitaux et primes.</li>
              <li><strong>Branche Transport & Plaisance (<code>T</code> - Codes 500-502 FAC_VOYAGE / ABONNEMENT, 503 PLAISANCE) :</strong> Cargaisons maritimes, aériennes, terrestres et corps de navires. Zone hautement sensible aux embargos internationaux et pavillons à risque (Scénario 04 GAFI).</li>
              <li><strong>Branche Prévoyance & Décès (<code>P</code> - Codes 650 PREVOYANC, 655 MIXTE, 656 PREVOYA_ES, 660 Coll_Deces, 665 IDR) :</strong> Branche Vie / Prévoyance. Surveillance particulière des changements de clause bénéficiaire (<strong>Scénario 07</strong>) et du paiement en espèces (<strong>Scénario 10</strong>, seuil 5 000 DT).</li>
              <li><strong>Branche Incendie (<code>I</code> - Code 300 INC) :</strong> Risques Simples et Risques Industriels / Pertes d'exploitation. Soumise aux seuils Non-Vie très élevés pour personnes morales et industriels.</li>
              <li><strong>Branche Multirisques Professionnelles (<code>M</code> - Code 280 MULTI_PROF / MAPL) :</strong> Commerçants, artisans et professions libérales. Évaluée avec les seuils de référence du <strong>Groupe 4</strong>.</li>
              <li><strong>Branche Corporels & Voyage (<code>C</code> - Codes 205-213) :</strong> Individuelle Accident (208, 210) et Assistance Voyage SAFER (211-213). Surveillance des capitaux décès/invalidité et des souscriptions voyage cash.</li>
              <li><strong>Branche Agricole (<code>N</code> - Code 350 Agricole) :</strong> Forfait agricole, serres, cheptel et récoltes.</li>
              <li><strong>Branche Habitation (<code>B</code> - Codes 271-277 BEYTI) :</strong> Système source <code>auto</code>, déclenche spécifiquement le <strong>Scénario 08</strong> (Incohérence du capital multirisque habitation) en plus de S01, S02, S10.</li>
              <li><strong>Branche Vie & Épargne (<code>E</code> - Codes 600-604 EPARGNE) :</strong> Système source <code>vie encaissement / vie decaissement</code>. Déclenche exclusivement les scénarios d'épargne (<strong>S03, S05, S06, S07, S09, S11, S12, S13</strong>) et les seuils d'espèces Vie (5 000 DT).</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="settings-grid anim-up">
          {/* Indicateur 2: Capital Assuré */}
          <div className="setting-card">
            <div className="setting-header">
              <h3>Scénario 01 & 11: Capitaux Assurés Élevés</h3>
              <span className="chip c-ora">Haute Gravité</span>
            </div>
            <div className="setting-content">
              <div className="seuil-table">
                <div className="seuil-row">
                  <div className="seuil-label">Groupe</div>
                  <div className="seuil-label">RM/RF</div>
                  <div className="seuil-label">RE</div>
                </div>
                {Object.keys(seuils.ind2).map(groupe => (
                  <div key={groupe} className="seuil-row">
                    <div className="seuil-label">{groupe.charAt(0).toUpperCase() + groupe.slice(1)}</div>
                    <input
                      type="number"
                      value={seuils.ind2[groupe]["RM/RF"]}
                      onChange={(e) => handleSeuilChange("ind2", groupe, "RM/RF", e.target.value)}
                      className="seuil-input"
                    />
                    <input
                      type="number"
                      value={seuils.ind2[groupe]["RE"]}
                      onChange={(e) => handleSeuilChange("ind2", groupe, "RE", e.target.value)}
                      className="seuil-input"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Indicateur 3: Prime Élevée */}
          <div className="setting-card">
            <div className="setting-header">
              <h3>Scénario 02 & 12: Primes Élevées</h3>
              <span className="chip c-ora">Haute Gravité</span>
            </div>
            <div className="setting-content">
              <div className="seuil-table">
                <div className="seuil-row">
                  <div className="seuil-label">Groupe</div>
                  <div className="seuil-label">RM/RF</div>
                  <div className="seuil-label">RE</div>
                </div>
                {Object.keys(seuils.ind3).map(groupe => (
                  <div key={groupe} className="seuil-row">
                    <div className="seuil-label">{groupe.charAt(0).toUpperCase() + groupe.slice(1)}</div>
                    <input
                      type="number"
                      value={seuils.ind3[groupe]["RM/RF"]}
                      onChange={(e) => handleSeuilChange("ind3", groupe, "RM/RF", e.target.value)}
                      className="seuil-input"
                    />
                    <input
                      type="number"
                      value={seuils.ind3[groupe]["RE"]}
                      onChange={(e) => handleSeuilChange("ind3", groupe, "RE", e.target.value)}
                      className="seuil-input"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Indicateur 4: Rachat */}
          <div className="setting-card">
            <div className="setting-header">
              <h3>Scénario 03: Rachat de Contrat Vie</h3>
              <span className="chip c-ora">Haute Gravité</span>
            </div>
            <div className="setting-content">
              <div className="seuil-table">
                <div className="seuil-row">
                  <div className="seuil-label">Groupe</div>
                  <div className="seuil-label">RM/RF</div>
                  <div className="seuil-label">RE</div>
                </div>
                {Object.keys(seuils.ind4).map(groupe => (
                  <div key={groupe} className="seuil-row">
                    <div className="seuil-label">{groupe.charAt(0).toUpperCase() + groupe.slice(1)}</div>
                    <input
                      type="number"
                      value={seuils.ind4[groupe]["RM/RF"]}
                      onChange={(e) => handleSeuilChange("ind4", groupe, "RM/RF", e.target.value)}
                      className="seuil-input"
                    />
                    <input
                      type="number"
                      value={seuils.ind4[groupe]["RE"]}
                      onChange={(e) => handleSeuilChange("ind4", groupe, "RE", e.target.value)}
                      className="seuil-input"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Indicateur 10: Paiement Espèces */}
          <div className="setting-card">
            <div className="setting-header">
              <h3>Scénario 10: Paiement en Espèces</h3>
              <span className="chip c-red">Critique</span>
            </div>
            <div className="setting-content">
              <div className="seuil-single">
                <div className="seuil-label">Seuil (DT) - Article 13 Loi 2015-26</div>
                <input
                  type="number"
                  value={seuils.ind10.seuil}
                  onChange={(e) => handleSeuilChange("ind10", "seuil", null, e.target.value)}
                  className="seuil-input large"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'seuils' && (
        <div className="settings-actions">
          <button className="btn-secondary" onClick={handleReset} disabled={!modified}>
            🔄 Réinitialiser
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={!modified}>
            💾 Sauvegarder les modifications
          </button>
        </div>
      )}
    </div>
  );
};

const GlobalPanel = ({ clients, results, runAll, selectClient, setTab }) => {
  const getVerdict = (simData) => {
    if (!simData || !simData.results) return { label: 'non analysé', class: 'v-SKIP' };
    const alerts = simData.results.filter(x => x.alerte);
    if (alerts.length === 0) return { label: '✓ Conforme', class: 'v-OK' };
    if (alerts.some(x => x.gravite === "critique")) return { label: '⚠ Critique', class: 'v-ALERTE g-c' };
    if (alerts.some(x => x.gravite === "haute")) return { label: '⚠ Haute', class: 'v-ALERTE g-h' };
    return { label: 'Moyenne', class: 'v-ALERTE g-m' };
  };

  const getRiskScoreLabel = (riskScore) => {
    if (!riskScore) return null;
    return `${riskScore.percentage}% (${riskScore.niveau})`;
  };

  const getRiskScoreClass = (riskScore) => {
    if (!riskScore) return '';
    switch (riskScore.niveau) {
      case 'critique': return 'v-ALERTE g-c';
      case 'haute': return 'v-ALERTE g-h';
      case 'moyenne': return 'v-ALERTE g-m';
      default: return 'v-OK';
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div className="panel-t" style={{ margin: 0 }}>Vue globale — Backtesting portefeuille</div>
        <button className="run-all" onClick={runAll}>▶ Analyser tous les clients</button>
      </div>
      <div className="stat-g">
        <StatBox label="Clients" value={clients.length} />
        <StatBox label="Analysés" value={Object.keys(results).length} />
        <StatBox label="Cas Critiques" value={Object.values(results).filter(simData => 
          simData.results?.some(x => x.alerte && x.gravite === "critique")
        ).length} color="var(--text-danger)" />
        <StatBox label="Alertes totales" value={Object.values(results).reduce((s, simData) => 
          s + (simData.results?.filter(x => x.alerte).length || 0), 0
        )} color="var(--text-warning)" />
      </div>
      <table className="btch-table">
        <thead><tr><th>Client</th><th>Infos</th><th style={{ textAlign: "center" }}>Alertes</th><th style={{ textAlign: "center" }}>Score de Risque</th><th style={{ textAlign: "center" }}>Verdict Global</th></tr></thead>
        <tbody>
          {clients.map(c => {
            const simData = results[c.id];
            const v = getVerdict(simData);
            const nb = simData?.results ? simData.results.filter(x => x.alerte).length : null;
            const riskScoreLabel = getRiskScoreLabel(simData?.riskScore);
            const riskScoreClass = getRiskScoreClass(simData?.riskScore);
            return (
              <tr key={c.id} onClick={() => { selectClient(c); if (simData) setTab("resultats"); }}>
                <td>
                  <div className="cli-nm">{c.nom}</div>
                  <div className="cli-id">{c.id}</div>
                </td>
                <td><span className={`chip ${c.niveauRisque === 'RE' ? 'c-yel' : 'c-grn'}`}>{c.niveauRisque}</span></td>
                <td style={{ textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, fontWeight: 700, color: nb === null ? "var(--text-placeholder)" : nb === 0 ? "var(--text-success)" : "var(--text-danger)" }}>
                  {nb ?? '—'}
                </td>
                <td style={{ textAlign: "center" }}>
                  {riskScoreLabel ? <span className={riskScoreClass}>{riskScoreLabel}</span> : '—'}
                </td>
                <td style={{ textAlign: "center" }}><span className={v.class}>{v.label}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const HistoryPanel = ({ history }) => {
  if (history.length === 0) return (
    <div className="empty-state">
      <h3>Aucune simulation dans l'historique.</h3>
      <p>Lancez une simulation depuis l'onglet "Simulation d'alerte" ou "Vue globale" pour la voir apparaître ici.</p>
    </div>
  );

  return (
    <div>
      <div className="panel-t">Historique des simulations</div>
      <table className="btch-table">
        <thead>
          <tr>
            <th>Date & Heure</th>
            <th>Client</th>
            <th style={{ textAlign: "center" }}># Alertes</th>
            <th style={{ textAlign: "center" }}>Verdict</th>
          </tr>
        </thead>
        <tbody>
          {history.map(h => {
            const alerts = h.results.filter(r => r.alerte);
            const getVerdict = () => {
              if (alerts.length === 0) return { label: '✓ Conforme', class: 'v-OK' };
              if (alerts.some(x => x.gravite === "critique")) return { label: '⚠ Critique', class: 'v-ALERTE g-c' };
              if (alerts.some(x => x.gravite === "haute")) return { label: '⚠ Haute', class: 'v-ALERTE g-h' };
              return { label: 'Moyenne', class: 'v-ALERTE g-m' };
            };
            const v = getVerdict();

            return (
              <tr key={h.id}>
                <td>
                  <div className="cli-nm">{new Date(h.timestamp).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                </td>
                <td>
                  <div className="cli-nm">{h.clientName}</div>
                  <div className="cli-id">{h.clientId}</div>
                </td>
                <td style={{ textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, fontWeight: 700, color: alerts.length === 0 ? "var(--text-success)" : "var(--text-danger)" }}>
                  {alerts.length}
                </td>
                <td style={{ textAlign: "center" }}><span className={v.class}>{v.label}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── ALERT SIM PANEL ──────────────────────────────────────────────────────────
const ACTIVITES = [
  "élève", "étudiant", "sans profession", "travailleur indépendant",
  "salarié", "fonctionnaire", "retraité",
  "chef d'entreprise", "profession libérale", "PM"
];

const TYPES_OPERATION = [
  { value: "souscription", label: "Souscription" },
  { value: "rachat", label: "Rachat" },
  { value: "augmentation", label: "Augmentation de capital" },
  { value: "avance", label: "Avance sur contrat" },
  { value: "prime", label: "Versement de prime" },
  { value: "paiement_espece", label: "Paiement en espèce" },
];

const GRAVITE_CONFIG = {
  critique: { label: "CRITIQUE", cls: "sim-badge-critique", icon: "🔴" },
  haute: { label: "HAUTE", cls: "sim-badge-haute", icon: "🟠" },
  moyenne: { label: "MOYENNE", cls: "sim-badge-moyenne", icon: "🟡" },
};

const PROFIL_VIDE = { ...CLIENT_VIDE };

const AlertSimPanel = ({ activeClient, selId, updateField, addClient, lancerHistorique }) => {
  const [localProfil, setLocalProfil] = useState(PROFIL_VIDE);
  const [resultat, setResultat] = useState(null);
  const [tested, setTested] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  // Synchronise avec le client sélectionné si présent
  useEffect(() => {
    if (activeClient) {
      setLocalProfil(activeClient);
      setResultat(null);
      setTested(false);
    }
  }, [activeClient]);

  const set = (k, v) => {
    if (selId) {
      updateField(k, v);
    } else {
      setLocalProfil(p => ({ ...p, [k]: v }));
    }
  };

  const testerProfil = () => {
    const res = checkAlert(selId ? activeClient : localProfil);
    setResultat(res);
    setTested(true);
  };

  const handleSave = async () => {
    if (selId) return;
    setIsSaving(true);
    try {
      const { id, ...cleanData } = localProfil;
      const clientToSave = { ...cleanData, createdAt: new Date().toISOString() };
      if (!clientToSave.nom) clientToSave.nom = "Nouveau client";

      const docRef = await addDoc(collection(db, 'clients'), clientToSave);
      alert("Profil client enregistré avec succès !");
    } catch (e) {
      console.error("Error saving client:", e);
      alert("Erreur lors de l'enregistrement.");
    } finally {
      setIsSaving(false);
    }
  };

  const reset = () => {
    if (selId) {
      setResultat(null);
      setTested(false);
    } else {
      setLocalProfil(PROFIL_VIDE);
      setResultat(null);
      setTested(false);
    }
  };

  const copyText = (txt, key) => {
    if (!txt) return;
    navigator.clipboard.writeText(txt);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const currentData = selId ? activeClient : localProfil;
  const isVie = currentData.branche === "Vie" || ["vie encaissement", "vie decaissement", "vie"].includes(currentData.source_system);
  const showCapital = ["souscription", "augmentation"].includes(currentData.typeOperation);
  const showPrime = ["souscription", "prime"].includes(currentData.typeOperation);
  const showRachat = currentData.typeOperation === "rachat";
  const showAvance = currentData.typeOperation === "avance";
  const showAug = currentData.typeOperation === "augmentation";

  return (
    <div className="sim-panel">
      <div className="panel-h">
        <div>
          <div className="panel-t">🔎 Simulation d'alerte AML (13 Scénarios)</div>
          <div className="sim-subtitle">
            {selId ? `Édition de : ${activeClient.nom}` : "Simulation libre — Saisissez un profil pour tester"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {selId && <button className="run" style={{ background: 'var(--text-success)' }} onClick={lancerHistorique}>💾 Enreg. Historique</button>}
          {!selId && <button className="run" style={{ background: 'var(--text-accent)' }} onClick={handleSave} disabled={isSaving}>{isSaving ? "En cours..." : "📁 Enregistrer le client"}</button>}
          <button className="sim-reset-btn" onClick={reset}>↺ Réinitialiser</button>
          <button className="run" onClick={testerProfil}>▶ Lancer le Test</button>
        </div>
      </div>

      <div className="sim-grid">
        {/* ── Colonne Gauche : Formulaire ── */}
        <div className="sim-form-col">
          <div className="sec">Branche & Système source</div>
          <div className="sim-form-group">
            <Field label="Branche d'assurance (C_BR)" as="select" value={currentData.C_BR || "A"} onChange={e => {
              const code = e.target.value;
              const mapped = BRANCHES_MAPPING[code] || BRANCHES_MAPPING.A;
              set("C_BR", code);
              set("branche", mapped.branche);
              set("source_system", mapped.source_system);
              set("LIB_CIE", mapped.cies[0]?.lib_cie || "");
              set("N_CIE", mapped.cies[0]?.n_cie || "");
              if (code === "B") set("baytIIcoherent", false);
            }}>
              <option value="A">A - Automobile (MONOBRANCHE / FLOTTE)</option>
              <option value="B">B - Habitation (BEYTI 271-277)</option>
              <option value="I">I - Incendie & Pertes d'exploitation (INC 300)</option>
              <option value="M">M - Multirisques Professionnelles (MAPL 280)</option>
              <option value="C">C - Corporel & Assistance Voyage (ACCIDENT 208, SAFER 211-213, PRIV_PROF 210)</option>
              <option value="N">N - Risques Agricoles (Agricole 350)</option>
              <option value="Q">Q - Risques Techniques (TRC 261, BDM 260, EDC 268)</option>
              <option value="R">R - Responsabilité Civile & Risques Divers (RC 230, DECENNALE 231, VOL 220)</option>
              <option value="T">T - Transport & Plaisance (FAC_VOYAGE 500, FAC_ABONN 501, PLAISANCE 503)</option>
              <option value="P">P - Prévoyance & Décès (PREVOYANC 650, MIXTE 655, IDR 665)</option>
              <option value="V">V - Assurance Emprunteur & Temporaire Décès Dégressif (TD_DEGRESS 700 / PREV 701)</option>
              <option value="G">G - Santé & Maladie (MALA_INDIV 400, MALA_GRPE 401)</option>
              <option value="E">E - Épargne & Vie (EPARGNE 600-604)</option>
            </Field>
            <Field label="Système source (source_system)" as="select" value={currentData.source_system || "Auto/Irds"} onChange={e => set("source_system", e.target.value)}>
              <option value="Auto/Irds">Auto/Irds (Non-Vie : Auto, Incendie, Multirisque Pro, Corporel, Agricole, Risques Techniques, RC, Transport)</option>
              <option value="auto">auto (Multirisque Habitation BEYTI)</option>
              <option value="vie encaissement">vie encaissement (Souscriptions Vie / Prévoyance / Épargne)</option>
              <option value="vie decaissement">vie decaissement (Rachats, Avances & Décaissements Vie)</option>
              <option value="vie">vie (Général)</option>
            </Field>
          </div>

          <div className="sec">Profil client</div>
          <div className="sim-form-group">
            <Field label="Nom complet" placeholder="Prénom Nom" value={currentData.nom} onChange={e => set("nom", e.target.value)} />
            <Field label="Pays de résidence" placeholder="Ex: Tunisie, France..." value={currentData.pays} onChange={e => set("pays", e.target.value)} />
            <Field label="Activité professionnelle" as="select" value={currentData.activite} onChange={e => set("activite", e.target.value)}>
              {ACTIVITES.map(a => <option key={a}>{a}</option>)}
            </Field>
            <Field label="Niveau de risque LCB-FT" as="select" value={currentData.niveauRisque} onChange={e => set("niveauRisque", e.target.value)}>
              <option value="RM/RF">RM/RF (Risque Moyen / Faible)</option>
              <option value="RE">RE (Risque Élevé)</option>
            </Field>
            <Field label="Type d'opération" as="select" value={currentData.typeOperation} onChange={e => set("typeOperation", e.target.value)}>
              {TYPES_OPERATION.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Field>
          </div>

          <div className="sec">Montants & Capitaux</div>
          <div className="sim-form-group">
            {showCapital && <Field label="Capital assuré (DT)" type="number" min="0" value={currentData.capitalAssure} onChange={e => set("capitalAssure", +e.target.value)} />}
            {showPrime && <Field label="Prime versée (DT)" type="number" min="0" value={currentData.prime} onChange={e => set("prime", +e.target.value)} />}
            {showRachat && <Field label="Valeur de rachat (DT)" type="number" min="0" value={currentData.valeurRachat} onChange={e => set("valeurRachat", +e.target.value)} />}
            {showAvance && <Field label="Montant de l'avance demandée (DT)" type="number" min="0" value={currentData.montantAvance} onChange={e => set("montantAvance", +e.target.value)} />}
            {showAug && <Field label="Ratio augmentation capital (ex: 2.5)" type="number" step="0.1" min="0" value={currentData.augmentationCapital} onChange={e => set("augmentationCapital", +e.target.value)} />}
            <Field label="Paiement en espèces (DT)" type="number" min="0" value={currentData.paiementEspeces} onChange={e => set("paiementEspeces", +e.target.value)} />
          </div>

          <div className="sec">Détails temporels / Multiplicité</div>
          <div className="sim-form-group">
            <Field label="Date de souscription" type="date" value={currentData.dateSouscription} onChange={e => set("dateSouscription", e.target.value)} />
            <Field label="Date de l'opération" type="date" value={currentData.dateOperation} onChange={e => set("dateOperation", e.target.value)} />
            <Field label="Nb de contrats actifs (< 3 ans)" type="number" min="0" value={currentData.nbContrats3Ans} onChange={e => set("nbContrats3Ans", +e.target.value)} />
          </div>

          <div className="sec">Indicateurs spécifiques (13 Scénarios)</div>
          <div className="sim-toggles">
            <Toggle k="paysGafi" l="Client / Ressortissant Pays liste GAFI (Scénario 04)" v={currentData.paysGafi} set={set} />
            <Toggle k="baytIIcoherent" l="Multirisque Bayti incohérent avec profil (Scénario 08)" v={currentData.baytIIcoherent} set={set} />
            <Toggle k="changementBeneficiaire" l="≥ 3 modif. bénéficiaire (Scénario 07)" v={currentData.changementBeneficiaire} set={set} />
            <Toggle k="rachatMoins90j" l="Rachat précoce < 90 jours (Scénario 06)" v={currentData.rachatMoins90j} set={set} />
            <Toggle k="avanceMoins6Mois" l="Avance contrat demandée < 6 mois (Scénario 13)" v={currentData.avanceMoins6Mois} set={set} />
          </div>
        </div>

        {/* ── Colonne Droite : Résultat ── */}
        <div className="sim-result-col">
          {!tested ? (
            <div className="sim-placeholder">
              <div className="sim-placeholder-icon">{selId ? "🖊️" : "🛡️"}</div>
              <div className="sim-placeholder-title">{selId ? "Client sélectionné" : "Aucune simulation lancée"}</div>
              <div className="sim-placeholder-sub">
                {selId
                  ? "Les modifications sont prises en compte en direct. Cliquez sur 'Lancer le Test' pour évaluer ce profil sur les 13 scénarios."
                  : "Saisissez les données et cliquez sur 'Lancer le Test' pour détecter les scénarios d'alerte."}
              </div>
            </div>
          ) : (
            <>
              {/* Verdict principal */}
              <div className={`sim-verdict ${resultat.alert ? "sim-verdict-alerte" : "sim-verdict-ok"}`}>
                <div className="sim-verdict-icon">{resultat.alert ? "⚠️" : "✅"}</div>
                <div>
                  <div className="sim-verdict-title">
                    Alerte : <strong>{resultat.alert ? "OUI" : "NON"}</strong>
                  </div>
                  <div className="sim-verdict-sub">
                    {resultat.alert
                      ? `${resultat.alertes.length} scénario${resultat.alertes.length > 1 ? "s" : ""} déclenché${resultat.alertes.length > 1 ? "s" : ""} sur 13`
                      : "Aucun scénario déclenché (profil 100% conforme)"}
                  </div>
                  <div className="sim-verdict-meta">
                    {currentData.activite} · {currentData.niveauRisque === "RE" ? "Risque Élevé (RE)" : "Risque Modéré (RM/RF)"} · Groupe: {resultat.groupe}
                  </div>
                </div>
              </div>

              {/* Liste des alertes et livrables de décision */}
              {resultat.alertes.length > 0 && (
                <div className="sim-alertes-list">
                  <div className="sim-alertes-header">
                    Scénarios déclenchés & Décisions à appliquer ({resultat.alertes.length})
                  </div>
                  {resultat.alertes.map(a => {
                    const cfg = GRAVITE_CONFIG[a.gravite] || GRAVITE_CONFIG.moyenne;
                    const dec = a.decisions || {};
                    const kC = `sim_c_${a.id}`;
                    const kI = `sim_i_${a.id}`;
                    const kS = `sim_s_${a.id}`;

                    return (
                      <div key={a.id} className="sim-alerte-card" style={{ padding: 14 }}>
                        <div className="sim-alerte-top">
                          <span className="sim-alerte-num">{a.code || `#${a.id}`}</span>
                          <span className="sim-alerte-scenario">{a.label}</span>
                          <span className={`sim-badge ${cfg.cls}`}>{cfg.icon} {cfg.label}</span>
                        </div>
                        <div className="sim-alerte-regle">{a.regle}</div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                          Valeur : <strong>{a.valeurs}</strong> · Seuil : <strong>{a.seuil}</strong>
                        </div>

                        {/* Boutons d'actions rapides pour RegTools / CTAF */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                          <button
                            type="button"
                            className="btn-accent btn-sm"
                            onClick={() => copyText(dec.raisonCloture, kC)}
                            title="Copier la raison de clôture sans suite"
                          >
                            {copiedKey === kC ? '✓ Raison copiée !' : '📋 Copier Raison Clôture'}
                          </button>
                          <button
                            type="button"
                            className="btn-sec btn-sm"
                            onClick={() => copyText(dec.noteInvestigation, kI)}
                            title="Copier la note d'investigation"
                          >
                            {copiedKey === kI ? '✓ Note copiée !' : '🔍 Copier Note Investigation'}
                          </button>
                          <button
                            type="button"
                            className="btn-sec btn-sm"
                            style={{ color: '#dc2626', borderColor: '#dc2626' }}
                            onClick={() => copyText(dec.motifSoupcon, kS)}
                            title="Copier l'argumentaire pour la CTAF"
                          >
                            {copiedKey === kS ? '✓ CTAF copié !' : '🚨 Copier Motif CTAF'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Résumé seuils applicables */}
              <div className="sim-seuils-box">
                <div className="sim-seuils-title">📊 Seuils de référence applicables à ce profil</div>
                <SeuilsTable profil={currentData} groupe={resultat.groupe} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const SeuilsTable = ({ profil, groupe }) => {
  const risque = profil.niveauRisque;
  const rows = [
    { label: "Capitaux assurés (Sec. 2)", val: SEUILS.ind2[groupe]?.[risque], unit: "DT" },
    { label: "Valeur prime (Sec. 3)", val: SEUILS.ind3[groupe]?.[risque], unit: "DT" },
    { label: "Valeur rachat (Sec. 4)", val: SEUILS.ind4[groupe]?.[risque], unit: "DT" },
    { label: "Ratio augmentation (Sec. 5)", val: SEUILS.ind5[risque], unit: "x" },
    { label: "Paiement espèces (Sec. 10)", val: SEUILS.ind10.seuil, unit: "DT" },
  ];
  return (
    <table className="sim-seuils-table">
      <thead><tr><th>Indicateur</th><th>Seuil d'alerte</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td className="sim-seuil-val">
              {r.val != null
                ? (r.unit === "DT" ? `> ${r.val.toLocaleString("fr-TN")} DT` : `≥ x${r.val}`)
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const Field = ({ label, as = 'input', ...props }) => {
  const InputComponent = as;
  return (
    <div className="fld">
      <label>{label}</label>
      <InputComponent {...props} />
    </div>
  );
};

const Toggle = ({ k, l, v, set }) => (
  <div className="tog-row" onClick={() => set(k, !v)}>
    <div className={`tog ${v ? "on" : ""}`} />
    <span className="tog-lbl">{l}</span>
  </div>
);

const Tooltip = ({ children, text }) => {
  return (
    <span className="tooltip-container">
      {children}
      <span className="tooltip-text">{text}</span>
    </span>
  );
};

const StatBox = ({ label, value, color = 'var(--text-accent)' }) => (
  <div className="st">
    <div className="st-v" style={{ color }}>{value}</div>
    <div className="st-l">{label}</div>
  </div>
);

const InfoBox = ({ text }) => (
  <div className="info-box">
    <span className="info-icon">ℹ️</span>
    <p>{text}</p>
  </div>
);

const BulkAnalysisView = ({ data, onClear }) => {
  const alertCount = data.filter(d => d.analysis.alert).length;
  return (
    <div className="card anim-up">
      <div className="card-hd">
        <div>
          <h2 className="card-tit">📊 Analyse de masse</h2>
          <div className="card-desc">
            {data.length} lignes importées — <strong style={{ color: 'var(--danger)' }}>{alertCount} alertes</strong> détectées
          </div>
        </div>
        <button className="run" style={{ background: 'var(--danger)', padding: '6px 14px', fontSize: '0.85rem' }} onClick={onClear}>
          🗑️ Effacer
        </button>
      </div>
      <div className="table-cont" style={{ marginTop: '1rem', overflowX: 'auto' }}>
        <table className="bulk-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Client</th>
              <th>Pays</th>
              <th>Risque</th>
              <th>Alerte</th>
              <th>Scénarios déclenchés</th>
              <th>Détail</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item, idx) => {
              const res = item.analysis;
              const hasAlert = res.alert;
              return (
                <tr key={idx} className={hasAlert ? 'row-alert' : ''}>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{idx + 1}</td>
                  <td style={{ fontWeight: 'bold' }}>{item.prenom ? `${item.prenom} ${item.nom}` : (item.nom || '—')}</td>
                  <td style={{ fontSize: '0.85rem' }}>{item.pays || '—'}</td>
                  <td>
                    <span className={`tag-risk ${(item.niveauRisque || '').replace('/', '-')}`}>
                      {item.niveauRisque || '—'}
                    </span>
                  </td>
                  <td>
                    {hasAlert
                      ? <span className="badge-alert">⚠️ ALERTE</span>
                      : <span className="badge-ok">✅ RAS</span>}
                  </td>
                  <td>
                    <div className="scenario-chips">
                      {res.alertes.map(a => (
                        <span key={a.id} className={`chip-id grav-${a.gravite}`} title={a.label}>
                          S{a.id}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="text-small">
                    {res.alertes.length > 0
                      ? res.alertes.map(a => a.label).join(' · ')
                      : 'Conforme'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SmartAMLPanel = ({ client, results }) => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const alertResults = useMemo(() => {
    if (!client) return null;
    return checkAlert(client);
  }, [client]);

  const handleGenerate = async () => {
    if (!client || !alertResults) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const result = await generateAMLReport(client, alertResults);
      setReport(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!report?.analyse_detaillee_goaml) return;
    try {
      await navigator.clipboard.writeText(report.analyse_detaillee_goaml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = report.analyse_detaillee_goaml;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const riskColors = {
    CRITIQUE: '#dc2626', ELEVE: '#ef4444', MOYEN: '#f59e0b', FAIBLE: '#22c55e'
  };
  const decisionLabels = {
    OUI_A_LA_CTAF: '🚨 Déclaration à la CTAF',
    OUI_A_LA_CNLCT: '⚠️ Déclaration à la CNLCT',
    INVESTIGATION_REQUISE: '🔍 Investigation requise',
    NON: '✅ Pas de déclaration nécessaire'
  };

  const alertCount = alertResults?.alertes?.length || 0;
  const suspicionScore = Math.min(100, Math.round((alertCount / 10) * 100));

  return (
    <div className="smart-aml-panel anim-up">
      {/* Header */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-hd">
          <div>
            <h2 className="card-tit">🤖 Smart-AML Decision Support</h2>
            <div className="card-desc">
              Analyse IA du profil de <strong>{client?.prenom ? `${client.prenom} ${client.nom}` : client?.nom}</strong> — {alertCount} alerte{alertCount !== 1 ? 's' : ''} détectée{alertCount !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Suspicion Score */}
        <div className="smart-score-section">
          <div className="smart-score-label">Score de Suspicion</div>
          <div className="smart-score-bar">
            <div
              className="smart-score-fill"
              style={{
                width: `${suspicionScore}%`,
                background: suspicionScore >= 70 ? '#dc2626' : suspicionScore >= 40 ? '#f59e0b' : '#22c55e'
              }}
            />
          </div>
          <div className="smart-score-value">{suspicionScore}%</div>
        </div>

        <button
          className="run smart-generate-btn"
          onClick={handleGenerate}
          disabled={loading}
          style={{ marginTop: 16 }}
        >
          {loading ? '⏳ Analyse en cours...' : '🧠 Générer le motif goAML'}
        </button>

        {loading && (
          <div className="smart-loading">
            <div className="smart-loading-bar">
              <div className="smart-loading-fill" />
            </div>
            <div className="smart-loading-text">L'IA analyse le profil client et rédige le rapport de conformité...</div>
          </div>
        )}

        {error && (
          <div className="smart-error">
            <strong>❌ Erreur :</strong> {error}
          </div>
        )}
      </div>

      {/* Report */}
      {report && (
        <div className="smart-report anim-up">
          {/* Verdict */}
          <div className="smart-verdict-card">
            <div className="smart-verdict-row">
              <div className="smart-verdict-decision">
                {decisionLabels[report.verdict?.decision] || report.verdict?.decision}
              </div>
              <span
                className="smart-risk-badge"
                style={{ background: riskColors[report.verdict?.niveau_risque] || '#666' }}
              >
                {report.verdict?.niveau_risque}
              </span>
            </div>
            {report.motif_officiel_goaml && (
              <div className="smart-motif">
                <strong>Motif goAML :</strong> {report.motif_officiel_goaml}
              </div>
            )}
          </div>

          {/* Analyse détaillée */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-hd" style={{ justifyContent: 'space-between' }}>
              <h3 className="card-tit">📝 Analyse détaillée goAML</h3>
              <button className="run smart-copy-btn" onClick={copyToClipboard}>
                {copied ? '✅ Copié !' : '📋 Copier pour goAML'}
              </button>
            </div>
            <div className="smart-analyse-text">
              {report.analyse_detaillee_goaml}
            </div>
          </div>

          {/* Références */}
          {report.references_reglementaires?.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3 className="card-tit">📚 Références réglementaires</h3>
              <ul className="smart-ref-list">
                {report.references_reglementaires.map((ref, i) => (
                  <li key={i}>{ref}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          {report.actions_immediates?.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3 className="card-tit">⚡ Actions immédiates</h3>
              <ul className="smart-action-list">
                {report.actions_immediates.map((act, i) => (
                  <li key={i}>{act}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
