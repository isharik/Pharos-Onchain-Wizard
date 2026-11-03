import { AppError } from "../errors.js";

const tables = {
  executions: { remote: "pharos_executions", key: "id" },
  state: { remote: "pharos_state", key: "key" },
  events: { remote: "pharos_events", key: "id" },
  jobs: { remote: "pharos_jobs", key: "id" },
};

export class SupabaseState {
  constructor(config) {
    this.url = config.supabaseUrl?.replace(/\/$/, "");
    this.key = config.supabaseServiceRoleKey;
  }
  get enabled() {
    return !!this.url && !!this.key;
  }
  headers() {
    return {
      apikey: this.key,
      authorization: `Bearer ${this.key}`,
      "content-type": "application/json",
    };
  }
  async request(path, options = {}) {
    let response;
    try {
      response = await fetch(`${this.url}/rest/v1/${path}`, {
        ...options,
        headers: { ...this.headers(), ...options.headers },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new AppError("STATE_UNAVAILABLE", "Supabase state request failed", 503);
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      console.warn(JSON.stringify({ level: "warn", message: "Supabase state request failed", status: response.status, detail }));
      throw new AppError("STATE_UNAVAILABLE", `Supabase state request failed (${response.status})`, 503);
    }
    return response;
  }
  async hydrate(store) {
    if (!this.enabled) return;
    const entries = await Promise.all(
      Object.entries(tables).map(async ([local, table]) => {
        const response = await this.request(`${table.remote}?select=*`);
        return [local, await response.json()];
      }),
    );
    store.restore(Object.fromEntries(entries));
  }
  async persist(store) {
    if (!this.enabled) return;
    const snapshot = store.snapshot();
    await Promise.all(
      Object.entries(tables).map(async ([local, table]) => {
        const rows = snapshot[local];
        if (!rows.length) return;
        await this.request(`${table.remote}?on_conflict=${table.key}`, {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(rows),
        });
      }),
    );
  }
}
