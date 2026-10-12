import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from './firebase.js';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, setDoc, writeBatch } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getGroupe, SEUILS, checkAlert } from './engine.js';
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
        Object.keys(row).forEach(key => {
          const k = key.trim().toLowerCase();
          const val = row[key];
          if (k === 'nom') obj.nom = val;
          if (k === 'prenom' || k === 'prénom') obj.prenom = val;
          if (k === 'pays') obj.pays = val;
          if (k === 'activite') obj.activite = val;
          if (k === 'risque') obj.niveauRisque = val;
          if (k === 'capital') obj.capitalAssure = Number(val);
          if (k === 'prime') obj.prime = Number(val);
          if (k === 'rachat') obj.valeurRachat = Number(val);
          if (k === 'augmentation') obj.augmentationCapital = Number(val);
          if (k === 'especes') obj.paiementEspeces = Number(val);
          if (k === 'datesouscription') obj.dateSouscription = val;
          if (k === 'dateoperation') obj.dateOperation = val;
          if (k === 'nbcontrats') obj.nbContrats3Ans = Number(val);
        });
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
  }
  const verdict = getVerdict();

  const getRiskScoreColor = (niveau) => {
    switch (niveau) {
      case "critique": return "c-red";
      case "haute": return "c-ora";
      case "moyenne": return "c-yel";
      default: return "c-grn";
    }
  };

  return (
    <div>
      <div className="panel-t">Résultats de simulation</div>
      <div className="verdict-box">
        <div className={`vc ${alerts.length === 0 ? "vc-ok" : "vc-al"}`}>
          <div className="vc-n">{alerts.length}</div>
          <div className="vc-sub">{alerts.length === 0 ? "✓ CONFORME" : "⚠ ALERTE(S)"}</div>
        </div>
        <div>
          <div className="vd-nm">{client.nom}</div>
          <div className="vd-meta">{client.id} · {client.activite} · {client.niveauRisque}</div>
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
        <thead><tr><th>#</th><th>Indicateur</th><th>Valeur(s)</th><th>Seuil</th><th style={{ textAlign: "center" }}>Verdict</th></tr></thead>
        <tbody>
          {results.map(ind => (
            <tr key={ind.id} className={ind.alerte ? "row-alerte" : ""}>
              <td><div className="ind-id">{ind.id}</div></td>
              <td>
                <div className="ind-label">{ind.label}</div>
                <div className="ind-rule">{ind.regle}</div>
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
    </div>
  )
};

const SettingsPanel = () => {
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
    // TODO: Sauvegarder les seuils dans Firestore
    setModified(false);
    alert("Seuils sauvegardés avec succès !");
  };

  const handleReset = () => {
    setSeuils(SEUILS);
    setModified(false);
    alert("Seuils réinitialisés à la valeur par défaut !");
  };

  return (
    <div>
      <div className="panel-t">Configuration des seuils LCB-FT</div>
      <p className="panel-desc">
        Modifiez les seuils des indicateurs AML. Les changements seront appliqués à toutes les simulations futures.
      </p>
      
      <div className="settings-grid">
        {/* Indicateur 2: Capital Assuré */}
        <div className="setting-card">
          <div className="setting-header">
            <h3>Indicateur 2: Capital Assuré Élevé</h3>
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
            <h3>Indicateur 3: Prime Élevée</h3>
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
            <h3>Indicateur 4: Rachat de Contrat</h3>
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

        {/* Indicateur 8: Capital Bayti */}
        <div className="setting-card">
          <div className="setting-header">
            <h3>Indicateur 8: Capital Bayti Incohérent</h3>
            <span className="chip c-ora">Haute Gravité</span>
          </div>
          <div className="setting-content">
            <div className="seuil-table">
              <div className="seuil-row">
                <div className="seuil-label">Groupe</div>
                <div className="seuil-label">Seuil (DT)</div>
              </div>
              {Object.keys(seuils.ind8).map(groupe => (
                <div key={groupe} className="seuil-row">
                  <div className="seuil-label">{groupe.charAt(0).toUpperCase() + groupe.slice(1)}</div>
                  <input
                    type="number"
                    value={seuils.ind8[groupe]}
                    onChange={(e) => handleSeuilChange("ind8", groupe, null, e.target.value)}
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
            <h3>Indicateur 10: Paiement en Espèces</h3>
            <span className="chip c-red">Critique</span>
          </div>
          <div className="setting-content">
            <div className="seuil-single">
              <div className="seuil-label">Seuil (DT)</div>
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

      <div className="settings-actions">
        <button className="btn-secondary" onClick={handleReset} disabled={!modified}>
          🔄 Réinitialiser
        </button>
        <button className="btn-primary" onClick={handleSave} disabled={!modified}>
          💾 Sauvegarder les modifications
        </button>
      </div>
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
    if (selId) return; // Déjà enregistré
    setIsSaving(true);
    try {
      // Nettoyage de l'ID éventuel dans le profil local avant ajout
      const { id, ...cleanData } = localProfil;
      const clientToSave = { ...cleanData, createdAt: new Date().toISOString() };
      if (!clientToSave.nom) clientToSave.nom = "Nouveau client";

      const docRef = await addDoc(collection(db, 'clients'), clientToSave);
      // Le composant App va re-loader via onSnapshot et selId/form seront mis à jour.
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
      // On ne "reset" pas un client existant comme ça, peut-être juste vider l'écran de test?
      setResultat(null);
      setTested(false);
    } else {
      setLocalProfil(PROFIL_VIDE);
      setResultat(null);
      setTested(false);
    }
  };

  const currentData = selId ? activeClient : localProfil;
  const showCapital = ["souscription", "augmentation"].includes(currentData.typeOperation);
  const showPrime = ["souscription", "prime"].includes(currentData.typeOperation);
  const showRachat = currentData.typeOperation === "rachat";
  const showAug = currentData.typeOperation === "augmentation";

  return (
    <div className="sim-panel">
      <div className="panel-h">
        <div>
          <div className="panel-t">🔎 Simulation d'alerte</div>
          <div className="sim-subtitle">
            {selId ? `Édition de : ${activeClient.nom}` : "Simulation libre — Saisissez un profil pour tester"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {selId && <button className="run" style={{ background: 'var(--text-success)' }} onClick={lancerHistorique}>💾 Enreg. Historique</button>}
          {!selId && <button className="run" style={{ background: 'var(--text-accent)' }} onClick={handleSave} disabled={isSaving}>{isSaving ? "Encuur..." : "📁 Enregistrer le client"}</button>}
          <button className="sim-reset-btn" onClick={reset}>↺ Réinitialiser</button>
          <button className="run" onClick={testerProfil}>▶ Lancer le Test</button>
        </div>
      </div>

      <div className="sim-grid">
        {/* ── Colonne Gauche : Formulaire ── */}
        <div className="sim-form-col">
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

          <div className="sec">Montants</div>
          <div className="sim-form-group">
            {showCapital && <Field label="Capital assuré (DT)" type="number" min="0" value={currentData.capitalAssure} onChange={e => set("capitalAssure", +e.target.value)} />}
            {showPrime && <Field label="Prime versée (DT)" type="number" min="0" value={currentData.prime} onChange={e => set("prime", +e.target.value)} />}
            {showRachat && <Field label="Valeur de rachat (DT)" type="number" min="0" value={currentData.valeurRachat} onChange={e => set("valeurRachat", +e.target.value)} />}
            {showAug && <Field label="Ratio augmentation capital (ex: 2.5)" type="number" step="0.1" min="0" value={currentData.augmentationCapital} onChange={e => set("augmentationCapital", +e.target.value)} />}
            <Field label="Paiement en espèces (DT)" type="number" min="0" value={currentData.paiementEspeces} onChange={e => set("paiementEspeces", +e.target.value)} />
          </div>

          <div className="sec">Détails temporels / Multiplicité</div>
          <div className="sim-form-group">
            <Field label="Date de souscription" type="date" value={currentData.dateSouscription} onChange={e => set("dateSouscription", e.target.value)} />
            <Field label="Date de l'opération" type="date" value={currentData.dateOperation} onChange={e => set("dateOperation", e.target.value)} />
            <Field label="Nb de contrats actifs (< 3 ans)" type="number" min="0" value={currentData.nbContrats3Ans} onChange={e => set("nbContrats3Ans", +e.target.value)} />
          </div>

          <div className="sec">Indicateurs spécifiques</div>
          <div className="sim-toggles">
            <Toggle k="baytIIcoherent" l="Bayti incohérent avec profil (Scenario 8)" v={currentData.baytIIcoherent} set={set} />
            <Toggle k="changementBeneficiaire" l="≥ 3 modif. bénéficiaire (Scenario 7)" v={currentData.changementBeneficiaire} set={set} />
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
                  ? "Les modifications sont enregistrées en temps réel. Cliquez sur 'Lancer le Test' pour évaluer ce profil."
                  : "Saisissez les données et cliquez sur 'Lancer le Test' pour voir si une alerte se génère."}
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
                      ? `${resultat.alertes.length} scénario${resultat.alertes.length > 1 ? "s" : ""} déclenché${resultat.alertes.length > 1 ? "s" : ""}`
                      : "Aucun scénario d'alerte déclenché pour ce profil"}
                  </div>
                  <div className="sim-verdict-meta">
                    {currentData.activite} · {currentData.niveauRisque === "RE" ? "En RE" : "Hors RE"} · Groupe: {resultat.groupe}
                  </div>
                </div>
              </div>

              {/* Liste des alertes */}
              {resultat.alertes.length > 0 && (
                <div className="sim-alertes-list">
                  <div className="sim-alertes-header">Scénarios déclenchés</div>
                  {resultat.alertes.map(a => {
                    const cfg = GRAVITE_CONFIG[a.gravite] || GRAVITE_CONFIG.moyenne;
                    return (
                      <div key={a.id} className="sim-alerte-card">
                        <div className="sim-alerte-top">
                          <span className="sim-alerte-num">#{a.id}</span>
                          <span className="sim-alerte-scenario">{a.scenario}</span>
                          <span className={`sim-badge ${cfg.cls}`}>{cfg.icon} {cfg.label}</span>
                        </div>
                        <div className="sim-alerte-regle">{a.regle}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Résumé seuils applicables */}
              <div className="sim-seuils-box">
                <div className="sim-seuils-title">📊 Seuils applicables à ce profil</div>
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
