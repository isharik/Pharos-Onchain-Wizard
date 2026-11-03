import React, { useState, useEffect, useRef } from "react";
import { Play, Clock, Copy, ExternalLink } from "lucide-react";
import { api } from "./api.js";
import { FeatureField } from "./forms.jsx";

const actions = {
  "doc-search": "Search documentation",
  threshold: "Evaluate conditions",
  saga: "Advance workflow",
  arbitrage: "Scan opportunities",
  "dry-run": "Simulate transaction",
  trend: "Record observation",
  policy: "Check policy",
  "skill-chain": "Run composed flow",
  "docs-chain": "Explain & read contract",
  yield: "Compare yields",
  liquidation: "Check position",
  recurring: "Prepare due payment",
  invoice: "Validate & prepare payment",
  alert: "Check alert condition",
  whale: "Scan watched accounts",
  aggregator: "Compare vaults",
  events: "Fetch new events",
  "x402-buyer": "Inspect paid APIs",
};
const notes = {
  "doc-search":
    "Search retrieves canonical documents linked by the Pharos Dev Docs index. Answers retain source references.",
  threshold:
    "Configure at least three independent chain reads. Every result explains the conditions behind the decision.",
  saga: "Advance checks receipts before preparing the next step. Recover prepares compensations in reverse order after a permanent failure. Each transaction requires your signature.",
  arbitrage:
    "Use matching base and quote units for both sources. Fees, gas and slippage are deducted before a route can be prepared.",
  "dry-run":
    "Simulation never broadcasts. A successful call can be reviewed and separately authorized in your wallet.",
  trend:
    "Each block is recorded once. Three or more observations are required, and history survives server restarts.",
  policy:
    "Spend limits apply to native transfers. Contract calls are denied because their total spend cannot be bounded by this policy.",
  "skill-chain":
    "A single request obtains live Chain MCP data and evaluates the installed decision Skill.",
  "docs-chain":
    "The selected function must appear in the retrieved documentation before the same function is read through Chain MCP.",
  yield:
    "APR sources must return fractions in comparable units. The recommendation includes entry, exit and gas costs over your holding period.",
  liquidation:
    "Debt and collateral must share quote units. Recovery estimates assume fixed prices and proportional health factor; verify your lending protocol’s mechanics.",
  recurring:
    "Start a schedule to prepare payments when due. Payment signing remains manual, and an existing pending period cannot be paid twice.",
  invoice:
    "Accepted formats are structured JSON or labelled text: Payee, Amount, Token, Reference. Missing or conflicting fields stop preparation.",
  alert:
    "Alerts are sent on a condition crossing. Configure your Discord or Telegram channel in server settings before starting.",
  whale:
    "Monitor ERC-20 transfers for five or more accounts. Token thresholds are in human-readable units, using on-chain decimals.",
  aggregator:
    "Compare at least two ERC-4626 vaults holding the same asset. Approvals, deposits and withdrawals are prepared for your signature.",
  events:
    "Queries Chain MCP using your contract and event signature. Each decoded event is persisted once; continuous polling resumes after restart.",
  "x402-buyer": "Checks two HTTPS x402 endpoints, enforces both price limits before approval, and persists a deduplicated payment ledger. Wallet approval is always explicit.",
};
const quickstarts = {
  "doc-search": ["Ask a question in plain language.", "Review the cited canonical documents in the result."],
  threshold: ["Keep three independent on-chain conditions.", "Tune thresholds, then inspect the recorded pass/fail trace."],
  saga: ["Define dependent steps in execution order.", "Use receipt checks and review the compensation path before signing."],
  arbitrage: ["Use two sources quoted in the same base and quote units.", "A route is prepared only when net profit clears your threshold."],
  "dry-run": ["Paste a transaction request without a signature.", "Resolve every simulation failure before reviewing a real transaction."],
  trend: ["Record comparable observations over time.", "Set a minimum observation count of three or more."],
  policy: ["Set a spend limit, allowlist, and time window.", "Each decision names the rule that allowed or denied it."],
  "skill-chain": ["Choose a live Chain MCP read.", "Run one request to retain the fetched value and decision together."],
  "docs-chain": ["Select a documented contract function.", "The explanation is retrieved before the live Chain MCP read."],
  yield: ["Add at least three live yield sources with comparable units.", "Include entry, exit, gas, and holding-period costs."],
  liquidation: ["Provide live collateral, debt, and health-factor reads.", "Set warning and critical thresholds before enabling monitoring."],
  recurring: ["Set recipient, token, amount, and cadence.", "Payments are prepared for a wallet signature; no payment is auto-sent."],
  invoice: ["Paste labelled text or structured JSON.", "Fix missing or conflicting fields before preparing the unsigned payment."],
  alert: ["Set one crossing condition and configure an external channel.", "The persisted cursor prevents repeat alerts for the same event."],
  whale: ["Watch at least five accounts and choose a token threshold.", "Review transfers with amount, sender, recipient, and transaction hash."],
  aggregator: ["Add two ERC-4626 vaults that hold the same asset.", "Unavailable venues remain visible while other sources keep running."],
  events: ["Enter a contract and event signature.", "Start monitoring after a successful query to persist only new events."],
  "x402-buyer": ["Enter two HTTPS x402 endpoint URLs.", "Set base-unit budget and per-call cap, then review the deduplicated ledger."],
};
const modeByFeature = {
  "doc-search": "Read-only retrieval",
  threshold: "Read-only decision",
  saga: "Signature-gated workflow",
  arbitrage: "Safe scan / prepared route",
  "dry-run": "Read-only simulation",
  trend: "Persistent observation",
  policy: "Read-only policy check",
  "skill-chain": "Composed live read",
  "docs-chain": "Documented contract read",
  yield: "Read-only recommendation",
  liquidation: "Read-only monitoring",
  recurring: "Signature-gated schedule",
  invoice: "Unsigned payment preparation",
  alert: "Continuous monitoring",
  whale: "Continuous monitoring",
  aggregator: "Signature-gated preparation",
  events: "Continuous Chain MCP monitor",
  "x402-buyer": "Budget-gated API purchase",
};
const dependencyLabels = { rpc: "Pharos RPC", chain: "Chain MCP", docs: "Developer Docs", wallet: "Wallet", channel: "Alert channel" };
function StatusBadge({ status }) {
  const good = ["connected", "configured", "succeeded"];
  const bad = ["failed", "unavailable", "not connected", "not configured"];
  return <span className={`badge ${good.includes(status) ? "good" : bad.includes(status) ? "bad" : ""}`}>{status}</span>;
}
function Evidence({ value }) {
  const [visibleRows, setVisibleRows] = useState(20);
  useEffect(() => setVisibleRows(20), [value]);
  const rows =
    value.events ||
    value.reports ||
    value.rows ||
    value.venues ||
    value.payments;
  return (
    <>
      <div className="result-summary">
        {value.decision && (
          <strong>{value.decision.replaceAll("-", " ").toUpperCase()}</strong>
        )}
        {value.reason && <p>{value.reason}</p>}
        {value.answer && <p>{value.answer}</p>}
        {value.explanation && <p>{value.explanation.answer}</p>}
        {value.observation && (
          <div className="chain-read">
            <strong>Live Chain MCP read</strong>
            <p>
              <code>{value.observation.source?.function || "contract read"}</code>
              {" returned "}
              <b>{value.observation.value}</b>
            </p>
            <small>
              Contract: {value.observation.source?.address} · Raw: {value.observation.raw} · Block: {value.observation.block} · {value.observation.transport}
            </small>
          </div>
        )}
        {value.interpretation && <p>{value.interpretation}</p>}
        {value.success !== undefined && (
          <strong>
            {value.success ? "Simulation passed" : "Execution blocked"}
          </strong>
        )}
        {value.nextDue && (
          <p>Next payment: {new Date(value.nextDue).toLocaleString()}</p>
        )}
        {value.severity && (
          <p>
            Position status: <strong>{value.severity}</strong> · Estimated
            repayment: {value.repayQuote}
          </p>
        )}
      </div>
      {(value.sources || value.explanation?.sources || [])
        .filter((s) => typeof s === "string" && s.startsWith("https://"))
        .map((s) => (
          <p key={s}>
            <a href={s} target="_blank" rel="noreferrer">
              Source: {new URL(s).pathname}
              <ExternalLink size={12} />
            </a>
          </p>
        ))}
      {value.trace && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Condition / state</th>
                <th>Value</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {value.trace.map((r, i) => (
                <tr key={i}>
                  <td>{r.name || r.rule || r.state}</td>
                  <td>{r.value ?? r.step ?? "—"}</td>
                  <td>
                    {r.pass === undefined ? r.state : r.pass ? "Pass" : "Fail"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows && (
        <div className="output-list">
          {rows.length ? (
            rows.slice(0, visibleRows).map((row, i) => (
              <div className="output-item" key={i}>
                <strong>
                  {row.label ||
                    row.name ||
                    row.event ||
                    row.explanation ||
                    `Payment ${row.period ?? i + 1}`}
                </strong>
                <small>
                  {row.transactionHash ||
                    row.status ||
                    row.error?.message ||
                    ""}
                </small>
                {row.blockNumber && <small>Block: {row.blockNumber}</small>}
                {row.netGain && (
                  <span>
                    Net gain: {row.netGain} · APR: {row.apr}
                  </span>
                )}
                {row.fields &&
                  Object.entries(row.fields).map(([k, v]) => (
                    <small key={k}>
                      {k}: {String(v)}
                    </small>
                  ))}
                {row.available !== undefined && (
                  <span>{row.available ? "Available" : "Unavailable"}</span>
                )}
              </div>
            ))
          ) : (
            <p className="feature-note">
              No matching events or activity in this range.
            </p>
          )}
          {rows.length > visibleRows && <button className="secondary" onClick={() => setVisibleRows(n => n + 20)}>Show more ({rows.length - visibleRows} remaining)</button>}
        </div>
      )}
      <details>
        <summary>Full result and evidence</summary>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </details>
    </>
  );
}
export default function Workspace({ module, network, account, refresh, health, configuration }) {
  const formRef = useRef(null);
  const initial = () =>
    Object.fromEntries(
      module.fields.map((f) => [
        f.name,
        f.type === "json" ? JSON.stringify(f.value, null, 2) : f.value,
      ]),
    );
  const [values, setValues] = useState(() => {
    try {
      return {
        ...initial(),
        ...JSON.parse(localStorage.getItem(`pharos:${module.id}`) || "{}"),
      };
    } catch {
      return initial();
    }
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [run, setRun] = useState(null),
    [notice, setNotice] = useState(""),
    [interval, setIntervalValue] = useState(30),
    [intent, setIntent] = useState(null),
    [review, setReview] = useState(false),
    [hash, setHash] = useState(""),
    [tab, setTab] = useState("workspace"),
    [history, setHistory] = useState([]),
    [jobs, setJobs] = useState([]);
  const dependencyStatus = (dependency) => {
    if (dependency === "wallet") return account ? "connected" : "not connected";
    if (dependency === "channel") return configuration?.channelConfigured ? "configured" : "not configured";
    return health?.[dependency]?.status || "checking";
  };
  const load = async () => {
    try {
      const [h, j] = await Promise.all([api("/history"), api("/jobs")]);
      setHistory(h.filter((x) => x.module === module.id));
      setJobs(j.filter((x) => x.module === module.id));
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [module.id]);
  useEffect(() => {
    try {
      localStorage.setItem(`pharos:${module.id}`, JSON.stringify(values));
    } catch {
      setNotice(
        "Browser storage is unavailable; configuration will not persist locally.",
      );
    }
  }, [values]);
  function input() {
    return Object.fromEntries(
      module.fields.map((f) => [
        f.name,
        f.type === "json"
          ? JSON.parse(values[f.name])
          : f.type === "number"
            ? Number(values[f.name])
            : values[f.name],
      ]),
    );
  }
  async function execute() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api(`/run/${module.id}`, input(), {
        "idempotency-key": crypto.randomUUID(),
      });
      setRun(result);
      setIntent(result.result?.intent || null);
      if (result.error) setError(result.error.message);
      await load();
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function monitor() {
    if (!formRef.current?.reportValidity()) return;
    setBusy(true);
    setError("");
    try {
      await api("/jobs", {
        module: module.id,
        input: input(),
        intervalMs: Number(interval) * 1000,
      });
      setNotice(
        module.id === "recurring"
          ? "Payment schedule started. Each due payment will await your signature."
          : "Monitoring started.",
      );
      await load();
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function sign() {
    setBusy(true);
    setError("");
    let claimed = false;
    try {
      if (!window.ethereum) throw new Error("Connect a browser wallet first.");
      const chain = await window.ethereum.request({ method: "eth_chainId" });
      if (Number(BigInt(chain)) !== network.chainId)
        throw new Error(
          `Switch your wallet to ${network.name}, chain ${network.chainId}.`,
        );
      const accounts = await window.ethereum.request({
        method: "eth_accounts",
      });
      if (accounts[0]?.toLowerCase() !== intent.transaction.from.toLowerCase())
        throw new Error("Wallet account does not match the sender.");
      const locked = await api(`/intents/${intent.id}/claim`, {});
      setIntent(locked);
      claimed = true;
      const transactionHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [
          {
            ...locked.transaction,
            gas: "0x" + BigInt(locked.simulation.gasLimit).toString(16),
          },
        ],
      });
      setHash(transactionHash);
      setIntent(
        await api(`/intents/${intent.id}/submitted`, { hash: transactionHash }),
      );
      setReview(false);
      setNotice("Submitted. Waiting for chain confirmation.");
    } catch (e) {
      if (e.code === 4001 && claimed) {
        try {
          setIntent(
            await api(`/intents/${intent.id}/rejected`, { code: 4001 }),
          );
        } catch (recordError) {
          setError(recordError.message);
        }
      }
      setError(
        e.message +
          (claimed && e.code !== 4001
            ? " The intent stays locked. Record the existing transaction hash if your wallet submitted it."
            : ""),
      );
    } finally {
      setBusy(false);
    }
  }
  async function reconcile() {
    setBusy(true);
    try {
      if (hash && intent.status === "awaiting-wallet")
        setIntent(await api(`/intents/${intent.id}/submitted`, { hash }));
      else setIntent(await api(`/intents/${intent.id}/reconcile`, {}));
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function inspectHistory(item) {
    setIntent(null);
    setReview(false);
    setHash("");
    setRun(item);
    setTab("workspace");
    setError(item.error?.message || "");
    if (item.result?.intent) {
      try {
        setIntent(await api(`/intents/${item.result.intent.id}/reconcile`, {}));
      } catch (e) {
        setError(e.message);
      }
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{module.group}</p>
          <h1>{module.title}</h1>
          <p>{module.description}</p>
          <div className="feature-metadata" aria-label="Feature information">
            <span className="feature-code">{module.code}</span>
            <span>{modeByFeature[module.id]}</span>
            {module.monitor && <span>Persistent history</span>}
          </div>
        </div>
        <div className="feature-network">
          <span className="badge">{network.name}</span>
          <small>Chain {network.chainId}</small>
        </div>
      </div>
      <div className="feature-tabs">
        <button
          className={tab === "workspace" ? "selected" : ""}
          onClick={() => setTab("workspace")}
        >
          Workspace
        </button>
        <button
          className={tab === "history" ? "selected" : ""}
          onClick={() => setTab("history")}
        >
          History ({history.length})
        </button>
        {module.monitor && (
          <button
            className={tab === "monitors" ? "selected" : ""}
            onClick={() => setTab("monitors")}
          >
            {module.id === "recurring" ? "Schedules" : "Monitors"} (
            {jobs.length})
          </button>
        )}
      </div>
      {tab === "history" ? (
        <section className="panel feature-history">
          <h2>{module.title} history</h2>
          {history.length ? (
            history.map((h) => (
              <details key={h.id}>
                <summary>
                  <span>{new Date(h.started).toLocaleString()}</span>
                  <span>{h.status}</span>
                </summary>
                {h.result ? (
                  <Evidence value={h.result} />
                ) : (
                  <p>{h.error?.message}</p>
                )}
                <button className="secondary" onClick={() => inspectHistory(h)}>
                  Open result & transaction
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    setValues(
                      Object.fromEntries(
                        module.fields.map((f) => [
                          f.name,
                          f.type === "json"
                            ? JSON.stringify(h.input[f.name], null, 2)
                            : h.input[f.name],
                        ]),
                      ),
                    );
                    setTab("workspace");
                  }}
                >
                  Use this configuration
                </button>
              </details>
            ))
          ) : (
            <div className="empty">
              <h3>No runs yet</h3>
              <p>
                Your feature history appears here after its first execution.
              </p>
            </div>
          )}
        </section>
      ) : tab === "monitors" ? (
        <section className="panel">
          <h2>
            {module.id === "recurring"
              ? "Payment schedules"
              : "Continuous monitors"}
          </h2>
          {jobs.length ? (
            jobs.map((j) => (
              <div className="connection-row" key={j.id}>
                <div>
                  <strong>
                    {j.input.watchId ||
                      j.input.scheduleId ||
                      j.input.alertId ||
                      j.input.positionId}
                  </strong>
                  <small>
                    {j.enabled ? "Active" : "Paused"} · Next check{" "}
                    {new Date(j.next_run).toLocaleString()}
                  </small>
                  {j.error && (
                    <small className="field-error">
                      {JSON.parse(j.error).message}
                    </small>
                  )}
                </div>
                <button
                  className="secondary"
                  onClick={async () => {
                    try {
                      await api(`/jobs/${j.id}`, { enabled: !j.enabled });
                      await load();
                      refresh();
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  {j.enabled ? "Pause" : "Resume"}
                </button>
              </div>
            ))
          ) : (
            <div className="empty">
              <p>Configure this feature, then start continuous operation.</p>
            </div>
          )}
        </section>
      ) : (
        <div className="workspace-grid">
          <section className="panel configuration">
            <h2>
              {module.id === "invoice"
                ? "Invoice details"
                : module.id === "recurring"
                  ? "Payment schedule"
                  : module.id === "saga"
                    ? "Workflow steps"
                    : "Configuration"}
            </h2>
            <div className="quickstart">
              <div>
                <strong>Run checklist</strong>
                <span>Use real values only</span>
              </div>
              <ol>
                {quickstarts[module.id].map((item) => <li key={item}>{item}</li>)}
              </ol>
            </div>
            <form
              ref={formRef}
              onSubmit={(e) => {
                e.preventDefault();
                execute();
              }}
            >
              {module.fields.map((f) => (
                <FeatureField
                  key={f.name}
                  field={f}
                  value={values[f.name]}
                  onChange={(v) => setValues({ ...values, [f.name]: v })}
                  moduleId={module.id}
                  account={account}
                />
              ))}
              <div className="actions">
                <button className="primary" disabled={busy} type="submit">
                  <Play size={14} />
                  {busy ? "Working…" : actions[module.id]}
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        JSON.stringify(input(), null, 2),
                      );
                      setNotice("Configuration copied.");
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  <Copy size={14} />
                  Export
                </button>
              </div>
            </form>
            {module.monitor && (
              <div className="monitor-control">
                <h3>
                  {module.id === "recurring"
                    ? "Enable schedule"
                    : "Continuous operation"}
                </h3>
                <label>
                  Check every{" "}
                  <input
                    aria-label="Polling seconds"
                    type="number"
                    min="15"
                    max="86400"
                    value={interval}
                    onChange={(e) => setIntervalValue(e.target.value)}
                  />{" "}
                  seconds
                </label>
                <button className="secondary" disabled={busy} onClick={monitor}>
                  <Clock size={14} />
                  {module.id === "recurring"
                    ? "Start schedule"
                    : "Start monitor"}
                </button>
                <small>
                  Runs while the service is online. History and progress persist
                  across restarts.
                </small>
              </div>
            )}
          </section>
          <div className="results-column">
            <section className="panel readiness-panel">
              <div className="section-heading">
                <div>
                  <h2>Run readiness</h2>
                  <span className="muted">Current connection state</span>
                </div>
                <span className="badge">{module.dependencies.length ? `${module.dependencies.length} dependencies` : "Local rules"}</span>
              </div>
              {module.dependencies.length ? module.dependencies.map((dependency) => (
                <div className="readiness-row" key={dependency}>
                  <span>{dependencyLabels[dependency]}</span>
                  <StatusBadge status={dependencyStatus(dependency)} />
                </div>
              )) : <p className="feature-note">This feature evaluates the policy you provide and does not require a remote connection.</p>}
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>Results</h2>
                {run && (
                  <span
                    className={`badge ${run.status === "failed" ? "bad" : "good"}`}
                  >
                    {run.status}
                  </span>
                )}
              </div>
              {error && (
                <div className="error-banner" role="alert">
                  {error}
                </div>
              )}
              {notice && (
                <div className="notice" role="status">
                  {notice}
                </div>
              )}
              {busy ? (
                <div className="working">
                  Retrieving data and processing your request…
                </div>
              ) : run?.result ? (
                <Evidence value={run.result} />
              ) : (
                <div className="empty">
                  <h3>
                    {module.id === "doc-search"
                      ? "Ask a Pharos question"
                      : "Ready to begin"}
                  </h3>
                  <p>
                    {module.id === "doc-search"
                      ? "Search network information, contracts and developer documentation."
                      : "Configure the inputs and start this feature to see its results here."}
                  </p>
                </div>
              )}
            </section>
            {intent && (
              <section className="panel">
                <h2>Review transaction</h2>
                <p>
                  Status: <strong>{intent.status}</strong>
                </p>
                <pre>{JSON.stringify(intent.transaction, null, 2)}</pre>
                <p>
                  {network.name} · chain {intent.chainId}
                </p>
                {intent.status === "prepared" && (
                  <>
                    <label className="review">
                      <input
                        type="checkbox"
                        checked={review}
                        onChange={(e) => setReview(e.target.checked)}
                      />
                      I reviewed the network, destination, value and calldata
                      and authorize this transaction.
                    </label>
                    <button
                      className="primary"
                      disabled={!review || busy}
                      onClick={sign}
                    >
                      Review & sign in wallet
                    </button>
                  </>
                )}
                {["awaiting-wallet", "submitted"].includes(intent.status) && (
                  <>
                    <label className="control">
                      <span>Transaction hash</span>
                      <input
                        value={hash || intent.hash || ""}
                        onChange={(e) => setHash(e.target.value)}
                        placeholder="0x…"
                      />
                    </label>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={reconcile}
                    >
                      Verify transaction / receipt
                    </button>
                  </>
                )}
                <p className="note">
                  Three confirmations are required. Prepared transactions have
                  not been sent.
                </p>
              </section>
            )}
            <section className="panel">
              <h2>How this feature works</h2>
              <p className="feature-note">{notes[module.id]}</p>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
