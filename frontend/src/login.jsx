import React, { useState } from "react";
export default function Login() {
  const [username, setUsername] = useState("admin"),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <div className="brand-logo">
        <img src="/assets/pharos-logo.jpg" alt="Pharos" />
      </div>
      <h1>Sign in to your workspace</h1>
      <p>Access your on-chain features and activity.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await fetch("/api/auth/login", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ username, password }),
            });
            const body = await r.json();
            if (!r.ok) throw new Error(body.error.message);
            location.reload();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
            setPassword("");
          }
        }}
      >
        <label className="control">
          <span>Account</span>
          <input
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="control">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error-banner">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
