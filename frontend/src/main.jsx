import React, { useState, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Activity,
  Settings,
  Server,
  Wallet,
  ArrowUpRight,
  RefreshCw,
  Menu,
  Search,
} from "lucide-react";
import { api, setToken } from "./api.js";
import "./styles.css";
import Login from "./login.jsx";
const Workspace = lazy(() => import("./workspace.jsx"));
const Details = ({ value }) => <pre>{JSON.stringify(value, null, 2)}</pre>;
function Badge({ status }) {
  return (
    <span
      className={`badge ${status === "connected" || status === "succeeded" ? "good" : status === "failed" || status === "unavailable" ? "bad" : ""}`}
    >
      {status || "checking"}
    </span>
  );
}
function App() {
  const [boot, setBoot] = useState(null),
    [health, setHealth] = useState(null),
    [history, setHistory] = useState([]),
    [page, setPage] = useState(location.hash.slice(1) || "dashboard"),
    [error, setError] = useState(""),
    [account, setAccount] = useState(""),
    [filter, setFilter] = useState(""),
    [mobile, setMobile] = useState(false),
    [jobs, setJobs] = useState([]),
    [auth, setAuth] = useState(null);
  const refresh = async () => {
    const results = await Promise.allSettled([
      api("/health"),
      api("/history"),
      api("/jobs"),
    ]);
    results.forEach((r, i) => {
      if (r.status === "fulfilled")
        [setHealth, setHistory, setJobs][i](r.value);
      else setError(r.reason.message);
    });
  };
  useEffect(() => {
    api("/auth/status")
      .then((s) => {
        setAuth(s);
        if (s.required && !s.authenticated) return null;
        return api("/bootstrap");
      })
      .then((b) => {
        if (!b) return;
        setBoot(b);
        setToken(b.csrf);
        refresh();
      })
      .catch((e) => setError(e.message));
    const nav = () => setPage(location.hash.slice(1) || "dashboard");
    window.addEventListener("hashchange", nav);
    return () => window.removeEventListener("hashchange", nav);
  }, []);
  useEffect(() => {
    if (auth?.required && !auth.authenticated) return <Login />;
    if (!boot) return;
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [boot]);
  useEffect(() => {
    const changed = (accounts) => setAccount(accounts[0] || "");
    window.ethereum?.on?.("accountsChanged", changed);
    return () => window.ethereum?.removeListener?.("accountsChanged", changed);
  }, []);
  async function connect() {
    try {
      if (!window.ethereum)
        throw new Error("Install an EIP-1193 wallet extension to connect.");
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      setAccount(accounts[0] || "");
    } catch (e) {
      setError(e.message);
    }
  }
  if (!boot)
    return (
      <main className="startup">
        <h1>Pharos</h1>
        <p>{error || "Loading application…"}</p>
      </main>
    );
  const module = boot.modules.find((m) => m.id === page);
  const title =
    module?.title ||
    {
      dashboard: "Dashboard",
      infrastructure: "Shared infrastructure",
      activity: "Execution history",
      traces: "Decision traces",
      logs: "System logs",
      settings: "Settings",
      wallet: "Wallet",
    }[page] ||
    "Page not found";
  const dependencyReady = (d) =>
    d === "rpc"
      ? health?.rpc.status === "connected"
      : d === "chain"
        ? health?.chain.status === "connected"
        : d === "docs"
          ? health?.docs.status === "connected"
          : d === "wallet"
            ? !!account
            : d === "channel"
              ? boot.configuration.channelConfigured
              : false;
  const ready = boot.modules.filter((m) =>
    m.dependencies.every(dependencyReady),
  ).length;
  const nav = (id, label, Icon) => (
    <a
      key={id}
      className={page === id ? "active" : ""}
      href={`#${id}`}
      onClick={() => setMobile(false)}
    >
      {Icon && <Icon size={16} />}
      <span>{label}</span>
    </a>
  );
  return (
    <div className="shell">
      <aside className={mobile ? "visible" : ""}>
        <div className="brand">
          <div className="brand-logo">
            <img src="/assets/pharos-logo.jpg" alt="Pharos" />
          </div>
        </div>
        <div className="nav-scroll">
          <div className="nav-label">OVERVIEW</div>
          {nav("dashboard", "Dashboard", LayoutDashboard)}
          <div className="nav-label feature-label">
            FEATURES <span>17</span>
          </div>
          <div className="nav-search">
            <Search size={13} />
            <input
              aria-label="Find a feature"
              placeholder="Find a feature"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          {boot.modules
            .filter((m) => m.title.toLowerCase().includes(filter.toLowerCase()))
            .map((m) => (
              <a
                key={m.id}
                href={`#${m.id}`}
                onClick={() => setMobile(false)}
                className={page === m.id ? "active" : ""}
              >
                <span className="module-number">{m.code.slice(1)}</span>
                <span>{m.title}</span>
              </a>
            ))}
          <div className="nav-label">INFRASTRUCTURE</div>
          {nav("infrastructure", "Connections & Skills", Server)}
          {nav("wallet", "Wallet", Wallet)}
          <div className="nav-label">ACTIVITY</div>
          {nav("activity", "Execution history", Activity)}
          {nav("traces", "Decision traces")}
          {nav("logs", "System logs")}
          {nav("settings", "Settings", Settings)}
        </div>
        <div className="sidebar-foot">
          <span className="dot" /> <span>On-chain workspace</span>
        </div>
      </aside>
      <div className="main">
        <header>
          <button
            className="icon mobile-menu"
            onClick={() => setMobile(!mobile)}
            aria-label="Toggle navigation"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>{title}</strong>
          </div>
          <div className="top-status">
            {auth?.required && (
              <button
                onClick={async () => {
                  await api("/auth/logout", {});
                  location.reload();
                }}
              >
                Sign out
              </button>
            )}
            <span>{boot.network.name}</span>
            <span
              className={`dot ${health?.rpc.status === "connected" ? "green" : ""}`}
            />
            <button className="wallet-button" onClick={connect}>
              <Wallet size={14} />
              {account
                ? `${account.slice(0, 6)}…${account.slice(-4)}`
                : "Connect wallet"}
            </button>
          </div>
        </header>
        <main>
          {error && (
            <div role="alert" className="error-banner">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}
          {module ? (
            <Suspense fallback={<p>Loading module…</p>}>
              <Workspace
                key={module.id}
                module={module}
                network={boot.network}
                account={account}
                refresh={refresh}
                health={health}
                configuration={boot.configuration}
              />
            </Suspense>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">PHAROS WORKSPACE</p>
                  <h1>{title}</h1>
                  <p>
                    {page === "dashboard"
                      ? "One workspace for Pharos intelligence and execution."
                      : page === "infrastructure"
                        ? "Inspect the actual services behind every feature."
                        : "Review evidence, configuration and execution state."}
                  </p>
                </div>
                <button className="secondary" onClick={refresh}>
                  <RefreshCw size={14} />
                  Refresh
                </button>
              </div>
              {page === "dashboard" && (
                <>
                  <div className="stats">
                    <div>
                      <span>Features</span>
                      <strong>
                        {boot.modules.length}
                        <small>available</small>
                      </strong>
                    </div>
                    <div>
                      <span>Connections ready</span>
                      <strong>
                        {ready}
                        <small>of 17</small>
                      </strong>
                    </div>
                    <div>
                      <span>Latest RPC block</span>
                      <strong className="block-number">
                        {health?.rpc.details?.block || "—"}
                      </strong>
                    </div>
                    <div>
                      <span>Recorded executions</span>
                      <strong>
                        {history.length}
                        <small>recent</small>
                      </strong>
                    </div>
                  </div>
                  <div className="dashboard-grid">
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Infrastructure</h2>
                        <a href="#infrastructure">
                          Inspect <ArrowUpRight size={13} />
                        </a>
                      </div>
                      {[
                        ["rpc", "Pharos RPC"],
                        ["chain", "Chain MCP"],
                        ["docs", "Developer Docs MCP"],
                        ["skill", "SkillEngine"],
                      ].map(([key, label]) => (
                        <div className="connection-row" key={key}>
                          <span>{label}</span>
                          <Badge status={health?.[key]?.status} />
                        </div>
                      ))}
                      <p className="note">
                        Readiness indicates available dependencies. Configure
                        contract-specific sources inside each feature.
                      </p>
                    </section>
                    <section className="panel feature-coverage">
                      <div className="section-heading">
                        <h2>Feature readiness</h2>
                        <span className="muted">Live connections only</span>
                      </div>
                      <p>
                        Each workspace validates its own inputs before it runs. Features that use protocols or alert channels need your verified configuration before live use.
                      </p>
                      <div className="coverage-bar" aria-label={`${ready} of ${boot.modules.length} feature dependencies connected`}>
                        <span style={{ width: `${(ready / boot.modules.length) * 100}%` }} />
                      </div>
                      <div className="coverage-labels">
                        <span>{ready} connection-ready</span>
                        <a href="#infrastructure">Review connections <ArrowUpRight size={12} /></a>
                      </div>
                    </section>
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Active monitors</h2>
                        <span className="muted">
                          {jobs.filter((j) => j.enabled).length} running
                        </span>
                      </div>
                      {jobs.length ? (
                        jobs.map((j) => (
                          <div className="connection-row" key={j.id}>
                            <span>
                              {
                                boot.modules.find((m) => m.id === j.module)
                                  ?.title
                              }
                              <small>
                                {j.error
                                  ? "Last run failed"
                                  : new Date(j.next_run).toLocaleString()}
                              </small>
                            </span>
                            <button
                              className="secondary"
                              onClick={async () => {
                                try {
                                  await api(`/jobs/${j.id}`, {
                                    enabled: !j.enabled,
                                  });
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
                          <Activity size={25} />
                          <h3>No active monitors</h3>
                          <p>
                            Start a monitor from a feature workspace.
                            <br />
                            Its cursor and history survive restarts.
                          </p>
                        </div>
                      )}
                    </section>
                  </div>
                  <History rows={history.slice(0, 8)} modules={boot.modules} />
                  {history.some((h) => h.status === "failed") && (
                    <section className="panel">
                      <h2>Recent failures</h2>
                      {history
                        .filter((h) => h.status === "failed")
                        .slice(0, 3)
                        .map((h) => (
                          <p className="failure" key={h.id}>
                            {h.module}: {h.error?.message}
                          </p>
                        ))}
                    </section>
                  )}
                </>
              )}
              {["activity", "traces", "logs"].includes(page) && (
                <History
                  rows={
                    page === "traces"
                      ? history.filter(
                          (r) => r.result?.trace || r.result?.decision,
                        )
                      : page === "logs"
                        ? history.filter((r) => r.error)
                        : history
                  }
                  modules={boot.modules}
                  expanded
                />
              )}
              {page === "infrastructure" && (
                <div className="infra-grid">
                  {[
                    ["rpc", "Pharos RPC"],
                    ["chain", "Chain MCP"],
                    ["docs", "Developer Docs MCP"],
                    ["skill", "SkillEngine"],
                  ].map(([key, label]) => (
                    <section className="panel" key={key}>
                      <div className="section-heading">
                        <h2>{label}</h2>
                        <Badge status={health?.[key]?.status} />
                      </div>
                      <p>
                        {health?.[key]?.error?.message ||
                          "Read-only connection details and discovered capabilities."}
                      </p>
                      <Details
                        value={
                          health?.[key]?.details || {
                            status: "No successful connection yet",
                          }
                        }
                      />
                    </section>
                  ))}
                </div>
              )}
              {page === "wallet" && (
                <section className="panel narrow">
                  <h2>Wallet connection</h2>
                  <p>{account || "No wallet connected"}</p>
                  <button className="primary" onClick={connect}>
                    Connect wallet
                  </button>
                  <p className="note">
                    Keys stay in your wallet. Every transaction requires
                    explicit review and a wallet signature. Intent states and
                    receipts are recorded by the backend.
                  </p>
                  <p>
                    Expected chain: {boot.network.chainId} ·{" "}
                    {boot.network.symbol}
                  </p>
                </section>
              )}
              {page === "settings" && (
                <>
                  <section className="panel narrow">
                    <h2>Network & server configuration</h2>
                    <p>
                      Configure connections and secrets in the server’s{" "}
                      <code>.env</code> file, then restart. Secrets are never
                      returned to the browser.
                    </p>
                    <Details value={boot.configuration} />
                    <p>
                      Network: {boot.network.name} ({boot.network.chainId})
                    </p>
                    <p className="note">
                      The hosted Chain MCP uses mainnet. Atlantic requires a
                      separately configured matching Chain MCP.
                    </p>
                  </section>
                  <section className="panel narrow">
                    <h2>Visual identity</h2>
                    <div className="brand-logo">
                      <img
                        src="/assets/pharos-logo.jpg"
                        alt="Official Pharos logo"
                      />
                    </div>
                  </section>
                </>
              )}
            </>
          )}
          <footer>
            Pharos data · explicit authorization · persistent evidence{" "}
            <span>
              {health?.checkedAt
                ? `Connections checked ${new Date(health.checkedAt).toLocaleTimeString()}`
                : "Checking connections"}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function History({ rows, modules, expanded = false }) {
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Execution history</h2>
        <span className="muted">Actual recorded runs</span>
      </div>
      {!rows.length ? (
        <div className="empty">
          <h3>No executions yet</h3>
          <p>Choose a feature from the sidebar to run it.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Feature</th>
                <th>Started</th>
                <th>Status</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <a href={`#${r.module}`}>
                      {modules.find((m) => m.id === r.module)?.title ||
                        r.module}
                    </a>
                  </td>
                  <td>{new Date(r.started).toLocaleString()}</td>
                  <td>
                    <Badge status={r.status} />
                  </td>
                  <td>
                    <details open={expanded || undefined}>
                      <summary>View run</summary>
                      <Details
                        value={r.result || r.error || { status: r.status }}
                      />
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <main className="startup">
        <h1>Workspace error</h1>
        <p>{this.state.error.message}</p>
        <button onClick={() => location.reload()}>Reload</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
