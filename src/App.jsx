import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from './firebase.js';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, setDoc, writeBatch } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { evaluerIndicateurs, getGroupe, SEUILS } from './engine.js';
import { CLIENT_VIDE } from './data.js';
import './styles.css';
import { debounce } from 'lodash';


// ─── AUTHENTICATION ───────────────────────────────────────────────────────────────

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
    if(password.length < 6) { 
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
        <div className="hdr-ico">M</div>
        <h2>Connexion à RegTools</h2>
        <p>Veuillez vous connecter pour accéder à la plateforme.</p>
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

// ─── MAIN APP COMPONENT ─────────────────────────────────────────────────────────── 
function App() {

  // ─── STATES ─────────────────────────────────────────────────────────────────── 
  const [clients, setClients] = useState([]);
  const [history, setHistory] = useState([]);
  const [simResults, setSimResults] = useState({});
  const [theme, setTheme] = useState("dark"); // Theme is local, not synced

  const [selId, setSelId] = useState(null);
  const [form, setForm] = useState(null);
  const [tab, setTab] = useState("form");

  // ─── DATA SYNCING w/ FIREBASE ───────────────────────────────────────────────────
  useEffect(() => {
    if (!auth.currentUser) return;

    const unsubscribeClients = onSnapshot(collection(db, 'clients'), snapshot => {
      const clientsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClients(clientsData);
    });

    const unsubscribeHistory = onSnapshot(collection(db, 'history'), snapshot => {
      const historyData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
      setHistory(historyData);
    });

    const unsubscribeResults = onSnapshot(collection(db, 'simResults'), snapshot => {
      const resultsData = {};
      snapshot.docs.forEach(doc => { resultsData[doc.id] = doc.data().results; });
      setSimResults(resultsData);
    });

    return () => {
      unsubscribeClients();
      unsubscribeHistory();
      unsubscribeResults();
    };
  }, []);

  // ─── THEME LOGIC ──────────────────────────────────────────────────────────────
  const toggleTheme = () => setTheme(p => p === 'light' ? 'dark' : 'light');
  useEffect(() => { document.body.setAttribute('data-theme', theme); }, [theme]);

  // ─── CLIENT & FORM MANAGEMENT ─────────────────────────────────────────────────
  const selectClient = useCallback((c) => {
    if (!c) return;
    setSelId(c.id);
    setForm({ ...c });
    setTab("form");
  }, []);

  useEffect(() => {
    if (clients.length > 0 && !selId) {
      selectClient(clients[0]);
    } else if (clients.length > 0 && selId) {
      const selectedInList = clients.find(c => c.id === selId);
      if(selectedInList) setForm(prev => ({...selectedInList, ...prev, id: selectedInList.id}));
      else selectClient(clients[0])
    } else if (clients.length === 0) {
      setForm(null);
      setSelId(null);
    }
  }, [clients, selId, selectClient]);
  
  const addClient = async () => {
    const newClient = { ...CLIENT_VIDE, nom: `Nouveau client`, createdAt: new Date().toISOString() };
    const docRef = await addDoc(collection(db, 'clients'), newClient);
    selectClient({ id: docRef.id, ...newClient });
  };

  const deleteClient = async (e, idToDelete) => {
    e.stopPropagation();
    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce client ?")) {
      await deleteDoc(doc(db, 'clients', idToDelete));
      await deleteDoc(doc(db, 'simResults', idToDelete)); // Clean up results
    }
  };

  const debouncedUpdate = useMemo(() => 
    debounce(async (id, field, value) => {
        if(!id) return;
      const docRef = doc(db, 'clients', id);
      await updateDoc(docRef, { [field]: value });
    }, 400),[]);

  const updateFormField = (key, value) => {
      if(!form) return;
    setForm(prevForm => {
      const newForm = { ...prevForm, [key]: value };
      debouncedUpdate(newForm.id, key, value);
      return newForm;
    });
  };

  // ─── SIMULATION ENGINE ────────────────────────────────────────────────────────
  const lancerSim = async () => {
    const results = evaluerIndicateurs(form);
    await setDoc(doc(db, 'simResults', form.id), { results });
    await addDoc(collection(db, 'history'), {
      clientId: form.id,
      clientName: form.nom,
      timestamp: new Date().toISOString(),
      results
    });
    setTab("resultats");
  };

  const runAll = async () => {
    const batch = writeBatch(db);
    clients.forEach(c => {
      const results = evaluerIndicateurs(c);
      const resRef = doc(db, "simResults", c.id);
      batch.set(resRef, { results });

      const histRef = doc(collection(db, "history"));
      batch.set(histRef, { 
        clientId: c.id, 
        clientName: c.nom,
        timestamp: new Date().toISOString(),
        results
      });
    });
    await batch.commit();
  };

  // ─── DERIVED DATA & HELPERS ───────────────────────────────────────────────────
  const getDot = (id) => {
    const r = simResults[id];
    if (!r) return "cli-dot d-ok";
    const a = r.filter(x => x.alerte);
    if (!a.length) return "cli-dot d-ok";
    if (a.some(x => x.gravite === "critique")) return "cli-dot d-hi";
    return "cli-dot d-med";
  };

  const curInds = selId ? simResults[selId] : null;
  const curAlerts = curInds ? curInds.filter(x => x.alerte) : [];
  const grp = form ? getGroupe(form.activite) : null;

  // ─── RENDER ─────────────────────────────────────────────────────────────────────
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
      />
      <main className="main">
        {clients.length > 0 && form ? (
          <>
            <div className="tabs">
              <Tab id="form" label="Profil client" currentTab={tab} setTab={setTab} />
              <Tab id="resultats" label={`Résultats ${curInds ? `· ${curAlerts.length} alerte${curAlerts.length !== 1 ? "s" : ""}`:""}`} currentTab={tab} setTab={setTab} />
              <Tab id="global" label="Vue globale" currentTab={tab} setTab={setTab} />
              <Tab id="history" label={`Historique (${history.length})`} currentTab={tab} setTab={setTab} />
            </div>
            <div className="cnt">
              {tab === "form" && <FormPanel form={form} updateField={updateFormField} grp={grp} lancerSim={lancerSim} />}
              {tab === "resultats" && <ResultPanel results={curInds} client={form} />}
              {tab === "global" && <GlobalPanel clients={clients} results={simResults} runAll={runAll} selectClient={selectClient} setTab={setTab} />}
              {tab === "history" && <HistoryPanel history={history} />}
            </div>
          </>
        ) : (
          <WelcomePanel addClient={addClient} />
        )}
      </main>
    </div>
  );
}

// ... (Les autres composants restent les mêmes) ...

export default AuthGate;

// Note: Due to the new auth structure, we export AuthGate as the default.
// The main App component is now rendered by AuthGate when a user is logged in.

const Header = ({ theme, toggleTheme }) => {
  const user = auth.currentUser;
  return (
    <header className="hdr">
        <div className="hdr-ico">M</div>
        <div>
        <div className="hdr-t">RegTools — Monitoring LCB-FT</div>
        <div className="hdr-s">Plateforme Collaborative en Temps Réel</div>
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

const Sidebar = ({ clients, selId, selectClient, addClient, deleteClient, getDot }) => (
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
    <button className="sb-add" onClick={addClient}>+ Ajouter un client</button>
  </aside>
);

const Tab = ({ id, label, currentTab, setTab }) => (
  <div className={`tab ${currentTab === id ? "on" : ""}`} onClick={() => setTab(id)}>{label}</div>
);

const WelcomePanel = ({ addClient }) => (
  <div className="welcome-panel">
    <h2>Bienvenue sur votre plateforme collaborative</h2>
    <p>Aucun client dans le portefeuille. Les données sont synchronisées en temps réel pour tous les utilisateurs.</p>
    <button className="run" onClick={addClient}>+ Créer le premier client</button>
  </div>
);

const FormPanel = ({ form, updateField, grp, lancerSim }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const set = (k, v) => updateField(k, v);
  
  return (
    <div>
      <div className="panel-h">
        <div className="panel-t">Dossier Client</div>
        <button className="run" onClick={lancerSim}>▶ Lancer la simulation</button>
      </div>
      <div className="sec">Informations générales</div>
      <div className="fg2">
        <Field label="Nom complet" placeholder="Prénom Nom" value={form.nom} onChange={e => set("nom", e.target.value)} />
        <Field label="Activité professionnelle" as="select" value={form.activite} onChange={e => set("activite", e.target.value)}>
          {["élève","étudiant","sans profession","travailleur indépendant","salarié","fonctionnaire","chef d'entreprise","profession libérale","PM"].map(a => <option key={a}>{a}</option>)}
        </Field>
        <Field label="Niveau de risque LCB-FT" as="select" value={form.niveauRisque} onChange={e => set("niveauRisque", e.target.value)}>
          <option value="!= RE">Hors Relation d'Affaires (Standard)</option>
          <option value="RE">En Relation d'Affaires (Renforcé)</option>
        </Field>
        <Field label="Type d'opération simulée" as="select" value={form.typeOperation} onChange={e => set("typeOperation", e.target.value)}>
          <option value="souscription">Souscription</option>
          <option value="rachat">Rachat</option>
        </Field>
      </div>
      <div className="sec">Scénarios & Montants</div>
      <div className="seuil-box">
        <Tooltip text="Catégorie de client basée sur l'activité, influence les seuils d'alerte.">Groupe activité: <strong>{grp.toUpperCase()}</strong></Tooltip>
        &nbsp;·&nbsp; Risque: <strong>{form.niveauRisque}</strong>
        &nbsp;&nbsp;|&nbsp;&nbsp;
        <Tooltip text="Seuil pour l'indicateur 3">Capital: <strong>{SEUILS.ind3[grp]?.[form.niveauRisque]?.toLocaleString("fr-TN")} DT</strong></Tooltip>
        &nbsp;·&nbsp;
        <Tooltip text="Seuil pour l'indicateur 4">Prime: <strong>{SEUILS.ind4[grp]?.[form.niveauRisque]?.toLocaleString("fr-TN")} DT</strong></Tooltip>
        &nbsp;·&nbsp;
        <Tooltip text="Seuil pour l'indicateur 5">Rachat: <strong>{SEUILS.ind5[grp]?.[form.niveauRisque]?.toLocaleString("fr-TN")} DT</strong></Tooltip>
      </div>
      <div className="fg3">
        <Field label="Capital assuré (DT)" type="number" value={form.capitalAssure} onChange={e => set("capitalAssure", +e.target.value)} />
        <Field label="Prime versée (DT)" type="number" value={form.prime} onChange={e => set("prime", +e.target.value)} />
        <Field label="Valeur de rachat (DT)" type="number" value={form.valeurRachat} onChange={e => set("valeurRachat", +e.target.value)} />
      </div>
      <div className="sec-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
        <span>{showAdvanced ? '▼' : '▶'} Indicateurs avancés & spécifiques</span>
      </div>
      {showAdvanced && (
        <div className="advanced-grid">
          <Toggle k="produitVie" l="Ind. 1 — Souscription produit Vie" v={form.produitVie} set={set} />
          <Toggle k="niveauRisqueElevé" l="Ind. 1 — Client à risque élevé" v={form.niveauRisqueElevé} set={set} />
          <Field label="Ratio aug. capital (Ind. 6)" type="number" step="0.1" value={form.augmentationCapital} onChange={e => set("augmentationCapital", +e.target.value)} />
          <Field label="Paiement espèces (DT) (Ind. 12)" type="number" value={form.paiementEspeces} onChange={e => set("paiementEspeces", +e.target.value)} />
          <Toggle k="paysGafi" l="Ind. 2 — Pays liste GAFI" v={form.paysGafi} set={set} />
          <Toggle k="rachatMoins90j" l="Ind. 7 — Rachat < 90 jours" v={form.rachatMoins90j} set={set} />
          <Toggle k="beneficiairePaysRisque" l="Ind. 8 — Bénéficiaire pays à risque" v={form.beneficiairePaysRisque} set={set} />
          <Toggle k="changementBeneficiaire" l="Ind. 9 — Changement fréquent bénéficiaire" v={form.changementBeneficiaire} set={set} />
          <Toggle k="baytIIcoherent" l="Ind. 10 — Capital Bayti incohérent" v={form.baytIIcoherent} set={set} />
          <Toggle k="souscriptionsMultiples" l="Ind. 11 — Souscriptions multiples" v={form.souscriptionsMultiples} set={set} />
          <Toggle k="plusieursComptes" l="Ind. 13 — Plusieurs comptes bancaires" v={form.plusieursComptes} set={set} />
        </div>
      )}
    </div>
  );
}

const ResultPanel = ({ results, client }) => {
  if (!results) return (
    <div className="empty-state">
      <h3>Aucune simulation lancée pour ce client.</h3>
      <p>Allez dans l'onglet "Profil client" et cliquez sur "Lancer la simulation".</p>
    </div>
  );
  const alerts = results.filter(r => r.alerte);
  const getVerdict = () => {
    if(alerts.length === 0) return { label: "Conforme", chip: "c-grn" };
    if(alerts.some(a => a.gravite === 'critique')) return { label: "Critique", chip: "c-red" };
    if(alerts.some(a => a.gravite === 'haute')) return { label: "Haute", chip: "c-ora" };
    return { label: "Moyenne", chip: "c-yel" };
  }
  const verdict = getVerdict();

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
          </div>
        </div>
      </div>
      <table className="ind-table">
        <thead><tr><th>#</th><th>Indicateur</th><th>Valeur(s)</th><th>Seuil</th><th style={{textAlign:"center"}}>Verdict</th></tr></thead>
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
                  ? <span className={`v-ALERTE g-${ind.gravite.slice(0,1)}`}>⚠ {ind.gravite.toUpperCase()}</span>
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

const GlobalPanel = ({ clients, results, runAll, selectClient, setTab }) => {
  const getVerdict = (r) => {
    if (!r) return { label: 'non analysé', class: 'v-SKIP' };
    const alerts = r.filter(x => x.alerte);
    if (alerts.length === 0) return { label: '✓ Conforme', class: 'v-OK' };
    if (alerts.some(x => x.gravite === "critique")) return { label: '⚠ Critique', class: 'v-ALERTE g-c' };
    if (alerts.some(x => x.gravite === "haute")) return { label: '⚠ Haute', class: 'v-ALERTE g-h' };
    return { label: 'Moyenne', class: 'v-ALERTE g-m' };
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
        <StatBox label="Cas Critiques" value={Object.values(results).filter(r => r.some(x => x.alerte && x.gravite === "critique")).length} color="var(--text-danger)" />
        <StatBox label="Alertes totales" value={Object.values(results).reduce((s, r) => s + r.filter(x => x.alerte).length, 0)} color="var(--text-warning)" />
      </div>
      <table className="btch-table">
        <thead><tr><th>Client</th><th>Infos</th><th style={{textAlign:"center"}}>Alertes</th><th style={{textAlign:"center"}}>Verdict Global</th></tr></thead>
        <tbody>
          {clients.map(c => {
            const r = results[c.id];
            const v = getVerdict(r);
            const nb = r ? r.filter(x => x.alerte).length : null;
            return (
              <tr key={c.id} onClick={() => { selectClient(c); if (r) setTab("resultats"); }}>
                <td>
                  <div className="cli-nm">{c.nom}</div>
                  <div className="cli-id">{c.id}</div>
                </td>
                <td><span className={`chip ${c.niveauRisque === 'RE' ? 'c-yel' : 'c-grn'}`}>{c.niveauRisque}</span></td>
                <td style={{ textAlign:"center", fontFamily:"'IBM Plex Mono', monospace", fontSize:15, fontWeight:700, color: nb === null ? "var(--text-placeholder)" : nb === 0 ? "var(--text-success)" : "var(--text-danger)" }}>
                  {nb ?? '—'}
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
      <p>Lancez une simulation depuis l'onglet "Profil client" pour la voir apparaître ici.</p>
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
            <th style={{textAlign:"center"}}># Alertes</th>
            <th style={{textAlign:"center"}}>Verdict</th>
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
                  <div className="cli-nm">{new Date(h.timestamp).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour:'2-digit', minute:'2-digit' })}</div>
                </td>
                <td>
                  <div className="cli-nm">{h.clientName}</div>
                  <div className="cli-id">{h.clientId}</div>
                </td>
                <td style={{ textAlign:"center", fontFamily:"'IBM Plex Mono', monospace", fontSize:15, fontWeight:700, color: alerts.length === 0 ? "var(--text-success)" : "var(--text-danger)" }}>
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


// ─── ATOMIC HELPER COMPONENTS ─────────────────────────────────────────────────── 

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
