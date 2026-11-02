import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { json } from "./errors.js";
export class Store {
  constructor(path) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS executions (id TEXT PRIMARY KEY, module TEXT NOT NULL, status TEXT NOT NULL, started TEXT NOT NULL, ended TEXT, input TEXT NOT NULL, result TEXT, error TEXT, request_key TEXT UNIQUE);
      CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, kind TEXT NOT NULL, time TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, module TEXT NOT NULL, input TEXT NOT NULL, interval_ms INTEGER NOT NULL, next_run INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, error TEXT);
    `);
    this.db
      .prepare(
        "UPDATE executions SET status='interrupted', error=? WHERE status='running'",
      )
      .run(
        json({
          code: "RESTART",
          message: "Process restarted; inspect state before retrying.",
        }),
      );
  }
  get(key, fallback = null) {
    const row = this.db.prepare("SELECT value FROM state WHERE key=?").get(key);
    return row ? JSON.parse(row.value) : fallback;
  }
  set(key, value) {
    this.db
      .prepare(
        "INSERT INTO state VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, json(value));
    return value;
  }
  atomic(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  event(id, kind, payload) {
    return (
      this.db
        .prepare("INSERT OR IGNORE INTO events VALUES (?,?,?,?)")
        .run(id, kind, new Date().toISOString(), json(payload)).changes > 0
    );
  }
  events(kind, limit = 100) {
    return this.db
      .prepare("SELECT * FROM events WHERE kind=? ORDER BY time DESC LIMIT ?")
      .all(kind, limit)
      .map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
  }
  history(limit = 100) {
    return this.db
      .prepare("SELECT * FROM executions ORDER BY started DESC LIMIT ?")
      .all(limit)
      .map((r) => ({
        ...r,
        input: JSON.parse(r.input),
        result: r.result ? JSON.parse(r.result) : null,
        error: r.error ? JSON.parse(r.error) : null,
      }));
  }
  close() {
    this.db.close();
  }
}
