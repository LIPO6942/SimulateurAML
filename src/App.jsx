import { useState, useEffect, useCallback } from "react";
import { evaluerIndicateurs, getGroupe, SEUILS } from "./engine.js";
import { EXEMPLES_CLIENTS, CLIENT_VIDE } from "./data.js";
import "./styles.css";

// ─── MAIN APP COMPONENT ─────────────────────────────────────────────────────────── 
export default function App() {

  // ─── STATES ─────────────────────────────────────────────────────────────────── 
  const [clients, setClients] = useState(EXEMPLES_CLIENTS);
  const [selId, setSelId]     = useState(clients.length > 0 ? clients[0].id : null);
  const [form, setForm]       = useState(clients.length > 0 ? { ...clients[0] } : null);
  const [tab, setTab]         = useState("form");
  const [simResults, setSimResults] = useState({});
  const [theme, setTheme] = useState("dark");

  // ─── THEME LOGIC ──────────────────────────────────────────────────────────────
  const toggleTheme = () => setTheme(p => p === 'light' ? 'dark' : 'light');
  useEffect(() => { document.body.setAttribute('data-theme', theme); }, [theme]);

  // ─── CLIENT & FORM MANAGEMENT ─────────────────────────────────────────────────
  const selectClient = useCallback((c) => { 
    setSelId(c.id); 
    setForm({ ...c }); 
    setTab("form"); 
  }, []);

  useEffect(() => {
    if (clients.length > 0 && !clients.find(c => c.id === selId)) {
      selectClient(clients[0]);
    }
    if (clients.length === 0) {
      setForm(null);
      setSelId(null);
    }
  }, [clients, selId, selectClient]);

  const addClient = () => {
    const newId = `CLI-${Date.now()}`;
    const nc = { ...CLIENT_VIDE, id: newId, nom: `Nouveau client` };
    setClients(p => [nc, ...p]);
    selectClient(nc);
  };

  const deleteClient = (e, idToDelete) => {
    e.stopPropagation();
    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce client ?")) {
      setClients(p => p.filter(c => c.id !== idToDelete));
      setSimResults(p => { const { [idToDelete]: _, ...rest } = p; return rest; });
    }
  };

  const updateFormField = (key, value) => {
    const newForm = { ...form, [key]: value };
    setForm(newForm);
    setClients(p => p.map(c => c.id === form.id ? newForm : c));
  };

  // ─── SIMULATION ENGINE ────────────────────────────────────────────────────────
  const lancerSim = () => {
    setSimResults(p => ({ ...p, [form.id]: evaluerIndicateurs(form) }));
    setTab("resultats");
  };

  const runAll = () => {
    const all = {};
    clients.forEach(c => { all[c.id] = evaluerIndicateurs(c); });
    setSimResults(all);
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

  const curInds   = selId ? simResults[selId] : null;
  const curAlerts = curInds ? curInds.filter(x => x.alerte) : [];
  const grp       = form ? getGroupe(form.activite) : null;

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
            </div>

            <div className="cnt">
              {tab === "form"      && <FormPanel form={form} updateField={updateFormField} grp={grp} lancerSim={lancerSim} />}
              {tab === "resultats" && <ResultPanel results={curInds} client={form} />}
              {tab === "global"    && <GlobalPanel clients={clients} results={simResults} runAll={runAll} selectClient={selectClient} setTab={setTab} />}
            </div>
          </>
        ) : (
          <WelcomePanel addClient={addClient} />
        )}
      </main>
    </div>
  );
}

// ─── SUB-COMPONENTS ─────────────────────────────────────────────────────────────── 

const Header = ({ theme, toggleTheme }) => (
  <header className="hdr">
    <div className="hdr-ico">M</div>
    <div>
      <div className="hdr-t">RegTools — Monitoring LCB-FT</div>
      <div className="hdr-s">Simulation & Backtesting</div>
    </div>
    <div className="hdr-r">
      <span className="pill pill-b">13 indicateurs</span>
      <span className="pill pill-g">Moteur actif</span>
      <button className="theme-toggle" onClick={toggleTheme} title="Changer de thème">
        {theme === 'light' ? '🌙' : '☀️'}
      </button>
    </div>
  </header>
);

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
            <div className="cli-id">{c.id} · {c.activite}</div>
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
    <h2>Bienvenue sur RegTools</h2>
    <p>Aucun client dans votre portefeuille pour le moment.</p>
    <button className="run" onClick={addClient}>+ Créer votre premier client</button>
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
  const verdictMap = {
    critique: { label: "CRITIQUE", chip: "c-red" },
    haute: { label: "HAUTE", chip: "c-ora" },
    moyenne: { label: "MOYENNE", chip: "c-yel" }
  };
  const getVerdict = () => {
    if(alerts.length === 0) return null;
    if(alerts.some(a => a.gravite === 'critique')) return verdictMap.critique;
    if(alerts.some(a => a.gravite === 'haute')) return verdictMap.haute;
    return verdictMap.moyenne;
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
            {alerts.length === 0 
              ? <span className="chip c-grn">✓ Aucune alerte détectée</span>
              : <span className={`chip ${verdict.chip}`}>Risque Global: {verdict.label}</span>
            }
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

const Tooltip = ({ children, text }) => (
  <span className="tooltip-container">
    {children}
    <span className="tooltip-text">{text}</span>
  </span>
);

const StatBox = ({ label, value, color = 'var(--text-accent)' }) => (
  <div className="st">
    <div className="st-v" style={{ color }}>{value}</div>
    <div className="st-l">{label}</div>
  </div>
);
