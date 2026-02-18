import { useState } from "react";
import { evaluerIndicateurs, getGroupe, SEUILS } from "./engine.js";
import { EXEMPLES_CLIENTS, CLIENT_VIDE } from "./data.js";
import "./styles.css";

export default function App() {
  const [clients, setClients] = useState(EXEMPLES_CLIENTS);
  const [selId, setSelId]     = useState(EXEMPLES_CLIENTS[0].id);
  const [form, setForm]       = useState({ ...EXEMPLES_CLIENTS[0] });
  const [tab, setTab]         = useState("form");
  const [simResults, setSimResults] = useState({});

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const selectClient = (c) => { setSelId(c.id); setForm({ ...c }); setTab("form"); };

  const addClient = () => {
    const newId = `CLI-${String(clients.length + 1).padStart(3, "0")}`;
    const nc = { ...CLIENT_VIDE, id: newId, nom: `Nouveau client ${clients.length + 1}` };
    setClients((p) => [...p, nc]);
    setSelId(newId);
    setForm({ ...nc });
    setTab("form");
  };

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const lancerSim = () => {
    const saved = { ...form };
    setClients((p) => p.map((c) => (c.id === form.id ? saved : c)));
    setSimResults((p) => ({ ...p, [saved.id]: evaluerIndicateurs(saved) }));
    setTab("resultats");
  };

  const runAll = () => {
    const all = {};
    clients.forEach((c) => { all[c.id] = evaluerIndicateurs(c); });
    setSimResults(all);
  };

  const getDot = (id) => {
    const r = simResults[id];
    if (!r) return "cli-dot d-ok";
    const a = r.filter((x) => x.alerte);
    if (!a.length) return "cli-dot d-ok";
    if (a.some((x) => x.gravite === "critique")) return "cli-dot d-hi";
    return "cli-dot d-med";
  };

  const getVerdict = (r) => {
    if (!r) return null;
    const a = r.filter((x) => x.alerte);
    if (!a.length) return "ok";
    if (a.some((x) => x.gravite === "critique")) return "critique";
    if (a.some((x) => x.gravite === "haute")) return "haute";
    return "moyenne";
  };

  const curInds   = simResults[selId] || null;
  const curAlerts = curInds ? curInds.filter((x) => x.alerte) : [];
  const grp       = getGroupe(form.activite);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="app">

      {/* HEADER */}
      <header className="hdr">
        <div className="hdr-ico">M</div>
        <div>
          <div className="hdr-t">RegTools — Monitoring LCB-FT</div>
          <div className="hdr-s">Simulation & Backtesting · 13 Indicateurs d'alerte réglementaires</div>
        </div>
        <div className="hdr-r">
          <span className="pill pill-b">13 indicateurs</span>
          <span className="pill pill-g">Moteur actif</span>
        </div>
      </header>

      {/* SIDEBAR */}
      <aside className="sb">
        <div className="sb-hd">
          <div className="sb-lbl">Portefeuille ({clients.length} clients)</div>
        </div>
        <div className="sb-list">
          {clients.map((c) => (
            <div
              key={c.id}
              className={`cli ${selId === c.id ? "active" : ""}`}
              onClick={() => selectClient(c)}
            >
              <div className="cli-av">{c.nom.charAt(0).toUpperCase()}</div>
              <div className="cli-info">
                <div className="cli-nm">{c.nom}</div>
                <div className="cli-id">{c.id} · {c.activite}</div>
              </div>
              <div className={getDot(c.id)} />
            </div>
          ))}
        </div>
        <button className="sb-add" onClick={addClient}>+ Nouveau client</button>
      </aside>

      {/* MAIN */}
      <main className="main">
        <div className="tabs">
          <div className={`tab ${tab === "form" ? "on" : ""}`} onClick={() => setTab("form")}>Profil client</div>
          <div className={`tab ${tab === "resultats" ? "on" : ""}`} onClick={() => setTab("resultats")}>
            Résultats {curInds && `· ${curAlerts.length} alerte${curAlerts.length !== 1 ? "s" : ""}`}
          </div>
          <div className={`tab ${tab === "global" ? "on" : ""}`} onClick={() => setTab("global")}>Vue globale</div>
        </div>

        <div className="cnt">

          {/* ── FORMULAIRE ── */}
          {tab === "form" && (
            <div>
              <div className="panel-t">Dossier — {form.id || "nouveau"}</div>

              <div className="fg2">
                <div className="fld">
                  <label>Nom complet</label>
                  <input value={form.nom} onChange={(e) => set("nom", e.target.value)} placeholder="Prénom Nom" />
                </div>
                <div className="fld">
                  <label>Activité professionnelle</label>
                  <select value={form.activite} onChange={(e) => set("activite", e.target.value)}>
                    {["élève","étudiant","sans profession","travailleur indépendant","salarié","fonctionnaire","chef d'entreprise","profession libérale","PM"].map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div className="fld">
                  <label>Niveau de risque</label>
                  <select value={form.niveauRisque} onChange={(e) => set("niveauRisque", e.target.value)}>
                    <option value="!= RE">Hors RE (!= RE)</option>
                    <option value="RE">Relation Établie (RE)</option>
                  </select>
                </div>
                <div className="fld">
                  <label>Type d'opération</label>
                  <select value={form.typeOperation} onChange={(e) => set("typeOperation", e.target.value)}>
                    <option value="souscription">Souscription</option>
                    <option value="rachat">Rachat</option>
                  </select>
                </div>
              </div>

              <div className="sec">Indicateur 1 — Souscription produit Vie</div>
              <div className="fg2">
                <div className="tog-row" onClick={() => set("produitVie", !form.produitVie)}>
                  <div className={`tog ${form.produitVie ? "on" : ""}`} />
                  <span className="tog-lbl">Produit Vie</span>
                </div>
                <div className="tog-row" onClick={() => set("niveauRisqueElevé", !form.niveauRisqueElevé)}>
                  <div className={`tog ${form.niveauRisqueElevé ? "on" : ""}`} />
                  <span className="tog-lbl">Niveau de risque élevé</span>
                </div>
              </div>

              <div className="sec">Indicateurs 3, 4, 5 — Montants (seuils calculés en temps réel)</div>
              <div className="seuil-box">
                Groupe activité: <strong style={{ color: "#4a90e0" }}>{grp.toUpperCase()}</strong>
                &nbsp;·&nbsp; Risque: <strong style={{ color: "#4a90e0" }}>{form.niveauRisque}</strong>
                &nbsp;&nbsp;|&nbsp;&nbsp;
                Seuil capital (ind.3): <strong style={{ color: "#60b0ff" }}>{SEUILS.ind3[grp][form.niveauRisque]?.toLocaleString("fr-TN")} DT</strong>
                &nbsp;·&nbsp;
                Seuil prime (ind.4): <strong style={{ color: "#60b0ff" }}>{SEUILS.ind4[grp][form.niveauRisque]?.toLocaleString("fr-TN")} DT</strong>
                &nbsp;·&nbsp;
                Seuil rachat (ind.5): <strong style={{ color: "#60b0ff" }}>{SEUILS.ind5[grp][form.niveauRisque]?.toLocaleString("fr-TN")} DT</strong>
              </div>
              <div className="fg3">
                <div className="fld">
                  <label>Capital assuré (DT) — Ind. 3</label>
                  <input type="number" value={form.capitalAssure} onChange={(e) => set("capitalAssure", +e.target.value)} min="0" />
                </div>
                <div className="fld">
                  <label>Prime (DT) — Ind. 4</label>
                  <input type="number" value={form.prime} onChange={(e) => set("prime", +e.target.value)} min="0" />
                </div>
                <div className="fld">
                  <label>Valeur rachat (DT) — Ind. 5</label>
                  <input type="number" value={form.valeurRachat} onChange={(e) => set("valeurRachat", +e.target.value)} min="0" />
                </div>
                <div className="fld">
                  <label>Ratio augmentation capitaux — Ind. 6 (ex: 2.5)</label>
                  <input type="number" step="0.01" value={form.augmentationCapital} onChange={(e) => set("augmentationCapital", +e.target.value)} min="0" />
                </div>
                <div className="fld">
                  <label>Paiement espèces (DT) — Ind. 12</label>
                  <input type="number" value={form.paiementEspeces} onChange={(e) => set("paiementEspeces", +e.target.value)} min="0" />
                </div>
              </div>

              <div className="sec">Indicateurs booléens — 2, 7, 8, 9, 10, 11, 13</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { k: "paysGafi",               l: "Ind. 2 — Pays liste GAFI" },
                  { k: "rachatMoins90j",          l: "Ind. 7 — Rachat < 90 jours" },
                  { k: "beneficiairePaysRisque",  l: "Ind. 8 — Bénéficiaire pays risque élevé" },
                  { k: "changementBeneficiaire",  l: "Ind. 9 — Changement fréquent bénéficiaire" },
                  { k: "baytIIcoherent",          l: "Ind. 10 — Capital Bayti incohérent" },
                  { k: "souscriptionsMultiples",  l: "Ind. 11 — Souscriptions multiples" },
                  { k: "plusieursComptes",        l: "Ind. 13 — Plusieurs comptes bancaires" },
                ].map(({ k, l }) => (
                  <div key={k} className="tog-row" onClick={() => set(k, !form[k])}>
                    <div className={`tog ${form[k] ? "on" : ""}`} />
                    <span className="tog-lbl">{l}</span>
                  </div>
                ))}
              </div>

              <button className="run" onClick={lancerSim}>▶ Lancer la simulation</button>
            </div>
          )}

          {/* ── RÉSULTATS ── */}
          {tab === "resultats" && (
            <div>
              <div className="panel-t">Résultats de simulation</div>

              {!curInds ? (
                <div className="empty-state">
                  Aucune simulation lancée — complétez le profil et cliquez sur ▶
                </div>
              ) : (
                <>
                  {/* VERDICT GLOBAL */}
                  <div className="verdict-box">
                    <div className={`vc ${curAlerts.length === 0 ? "vc-ok" : "vc-al"}`}>
                      <div className="vc-n">{curAlerts.length}</div>
                      <div className="vc-sub">{curAlerts.length === 0 ? "✓ CONFORME" : "⚠ ALERTES"}</div>
                    </div>
                    <div>
                      <div className="vd-nm">{form.nom || form.id}</div>
                      <div className="vd-meta">
                        {form.id} · {form.activite} (gr. {getGroupe(form.activite)}) · {form.niveauRisque} · {form.typeOperation}
                      </div>
                      <div className="vd-chips">
                        {curAlerts.length === 0 ? (
                          <span className="chip c-grn">✓ Aucune alerte — Dossier conforme</span>
                        ) : (
                          <>
                            {curAlerts.filter((a) => a.gravite === "critique").length > 0 && (
                              <span className="chip c-red">⚠ {curAlerts.filter((a) => a.gravite === "critique").length} critique{curAlerts.filter((a) => a.gravite === "critique").length > 1 ? "s" : ""}</span>
                            )}
                            {curAlerts.filter((a) => a.gravite === "haute").length > 0 && (
                              <span className="chip c-ora">{curAlerts.filter((a) => a.gravite === "haute").length} haute{curAlerts.filter((a) => a.gravite === "haute").length > 1 ? "s" : ""}</span>
                            )}
                            {curAlerts.filter((a) => a.gravite === "moyenne").length > 0 && (
                              <span className="chip c-yel">{curAlerts.filter((a) => a.gravite === "moyenne").length} moyenne{curAlerts.filter((a) => a.gravite === "moyenne").length > 1 ? "s" : ""}</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* TABLEAU INDICATEUR PAR INDICATEUR */}
                  <table className="ind-table">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>#</th>
                        <th>Indicateur</th>
                        <th style={{ width: 160 }}>Valeur saisie</th>
                        <th style={{ width: 160 }}>Seuil applicable</th>
                        <th style={{ width: 130, textAlign: "center" }}>ALERTE ?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {curInds.map((ind) => (
                        <tr key={ind.id} className={ind.alerte ? "row-alerte" : ""}>
                          <td><div className="ind-id">{ind.id}</div></td>
                          <td>
                            <div style={{ fontWeight: 700, color: "#9ab8d8", fontSize: 12, marginBottom: 2 }}>{ind.label}</div>
                            <div style={{ fontSize: 10, color: "#2a4060", fontFamily: "'IBM Plex Mono', monospace" }}>{ind.regle}</div>
                          </td>
                          <td>
                            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#6a90b8" }}>{ind.valeurs}</div>
                          </td>
                          <td>
                            <div className="seuil-lbl">{ind.seuil}</div>
                            {ind.detail && <div className={ind.alerte ? "detail-al" : "detail-ok"}>{ind.detail}</div>}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {ind.alerte ? (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                                <span className="v-ALERTE">⚠ ALERTE</span>
                                <span className={`grav-b ${ind.gravite === "critique" ? "g-c" : ind.gravite === "haute" ? "g-h" : "g-m"}`}>
                                  {ind.gravite}
                                </span>
                              </div>
                            ) : (
                              <span className="v-OK">✓ NON</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {/* ── VUE GLOBALE ── */}
          {tab === "global" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                <div className="panel-t" style={{ margin: 0 }}>Vue globale — Backtesting portefeuille</div>
                <button className="run-all" onClick={runAll}>▶ Analyser tous les clients</button>
              </div>

              <div className="stat-g">
                <div className="st"><div className="st-v" style={{ color: "#4a90e0" }}>{clients.length}</div><div className="st-l">Clients</div></div>
                <div className="st"><div className="st-v" style={{ color: "#8070e0" }}>{Object.keys(simResults).length}</div><div className="st-l">Analysés</div></div>
                <div className="st"><div className="st-v" style={{ color: "#f87060" }}>{Object.values(simResults).filter((r) => r.some((x) => x.alerte && x.gravite === "critique")).length}</div><div className="st-l">Cas critiques</div></div>
                <div className="st"><div className="st-v" style={{ color: "#f09040" }}>{Object.values(simResults).reduce((s, r) => s + r.filter((x) => x.alerte).length, 0)}</div><div className="st-l">Alertes totales</div></div>
              </div>

              <table className="btch-table">
                <thead>
                  <tr>
                    <th>ID</th><th>Nom</th><th>Activité / Groupe</th><th>Risque</th><th>Opération</th>
                    <th style={{ textAlign: "center" }}># Alertes</th>
                    <th style={{ textAlign: "center" }}>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => {
                    const r = simResults[c.id];
                    const v = getVerdict(r);
                    const nb = r ? r.filter((x) => x.alerte).length : null;
                    return (
                      <tr key={c.id} onClick={() => { selectClient(c); if (r) setTab("resultats"); }}>
                        <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#2a4060" }}>{c.id}</td>
                        <td style={{ fontWeight: 700, color: "#9ab8d8" }}>{c.nom}</td>
                        <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#3a5878" }}>
                          {c.activite}<br /><span style={{ color: "#2a4060" }}>gr. {getGroupe(c.activite)}</span>
                        </td>
                        <td><span className={`chip ${c.niveauRisque === "RE" ? "c-yel" : "c-grn"}`}>{c.niveauRisque}</span></td>
                        <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#3a5878" }}>{c.typeOperation}</td>
                        <td style={{ textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, fontWeight: 700, color: nb === null ? "#2a4060" : nb === 0 ? "#30c070" : "#f87060" }}>
                          {nb === null ? "—" : nb}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {!r ? <span className="v-SKIP">non analysé</span>
                            : v === "ok"       ? <span className="v-OK">✓ Conforme</span>
                            : v === "critique" ? <span className="v-ALERTE">⚠ CRITIQUE</span>
                            : v === "haute"    ? <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:"#2a1000", border:"1px solid #5a2000", borderRadius:7, padding:"5px 12px", fontSize:12, fontFamily:"'IBM Plex Mono',monospace", fontWeight:700, color:"#f09040" }}>⚠ HAUTE</span>
                            :                    <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:"#2a1800", border:"1px solid #5a3000", borderRadius:7, padding:"5px 12px", fontSize:12, fontFamily:"'IBM Plex Mono',monospace", fontWeight:600, color:"#e0b040" }}>MOYENNE</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
