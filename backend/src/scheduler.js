import { randomUUID } from "node:crypto";
import { resolveModule } from "./modules/registry.js";
import { requireThat, json, safeError } from "./errors.js";
export class Scheduler {
  constructor(ctx, runner) {
    this.ctx = ctx;
    this.runner = runner;
    this.busy = false;
  }
  async add(moduleId, input, intervalMs) {
    const module = await resolveModule(moduleId);
    requireThat(
      module?.monitor,
      "Module does not support continuous execution",
    );
    const parsed = module.schema.parse(input);
    requireThat(
      Number.isInteger(intervalMs) &&
        intervalMs >= 15000 &&
        intervalMs <= 86400000,
      "Polling interval must be 15 seconds to 24 hours",
    );
    requireThat(this.list().length < 100, "Maximum 100 monitor jobs");
    requireThat(
      !this.list().some(
        (j) => j.module === moduleId && j.input === json(parsed) && j.enabled,
      ),
      "This monitor already exists",
    );
    const id = randomUUID();
    this.ctx.store.db
      .prepare(
        "INSERT INTO jobs(id,module,input,interval_ms,next_run) VALUES (?,?,?,?,?)",
      )
      .run(id, moduleId, json(parsed), intervalMs, Date.now());
    return { id };
  }
  list() {
    return this.ctx.store.db
      .prepare("SELECT * FROM jobs ORDER BY next_run")
      .all();
  }
  toggle(id, enabled) {
    this.ctx.store.db
      .prepare("UPDATE jobs SET enabled=? WHERE id=?")
      .run(enabled ? 1 : 0, id);
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (const job of this.list().filter(
        (j) => j.enabled && j.next_run <= Date.now(),
      )) {
        try {
          const result = await this.runner.run(
            job.module,
            JSON.parse(job.input),
            `job:${job.id}:${job.next_run}`,
          );
          const delay =
            result.status === "failed"
              ? Math.max(job.interval_ms, 60000)
              : job.interval_ms;
          this.ctx.store.db
            .prepare("UPDATE jobs SET next_run=?,error=? WHERE id=?")
            .run(
              Date.now() + delay,
              result.error ? json(result.error) : null,
              job.id,
            );
        } catch (e) {
          this.ctx.store.db
            .prepare("UPDATE jobs SET next_run=?,error=? WHERE id=?")
            .run(Date.now() + 60000, json(safeError(e)), job.id);
        }
      }
    } finally {
      this.busy = false;
    }
  }
  start() {
    this.timer = setInterval(() => this.tick(), 1000);
    this.timer.unref();
  }
  async stop() {
    clearInterval(this.timer);
    while (this.busy) await new Promise((r) => setTimeout(r, 100));
  }
}
