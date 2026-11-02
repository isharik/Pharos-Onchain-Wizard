import { randomUUID, createHash } from "node:crypto";
import { resolveModule } from "./modules/registry.js";
import { AppError, json, safeError } from "./errors.js";
export class Runner {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = new Set();
  }
  async run(moduleId, input, requestKey = randomUUID()) {
    const module = await resolveModule(moduleId);
    if (!module) throw new AppError("NOT_FOUND", "Unknown module", 404);
    const parsed = module.schema.parse(input);
    const digest = createHash("sha256")
      .update(json({ moduleId, parsed }))
      .digest("hex");
    const previous = this.ctx.store.db
      .prepare("SELECT * FROM executions WHERE request_key=?")
      .get(requestKey);
    if (previous) {
      if (previous.module !== moduleId || previous.input !== json(parsed))
        throw new AppError(
          "IDEMPOTENCY_CONFLICT",
          "Request key was used with different inputs",
          409,
        );
      return (
        this.ctx.store.history(1000).find((x) => x.id === previous.id) || {
          id: previous.id,
          status: previous.status,
        }
      );
    }
    if (this.active.has(moduleId) || this.active.size >= 4)
      throw new AppError(
        "BUSY",
        "Module is running or execution capacity is full; retry later",
        409,
      );
    const id = randomUUID();
    this.active.add(moduleId);
    const started = new Date().toISOString();
    this.ctx.store.db
      .prepare(
        "INSERT INTO executions(id,module,status,started,input,request_key) VALUES (?,?,?,?,?,?)",
      )
      .run(id, moduleId, "running", started, json(parsed), requestKey);
    try {
      const result = await module.execute(
        { ...this.ctx, runId: id, inputDigest: digest },
        parsed,
      );
      this.ctx.store.db
        .prepare("UPDATE executions SET status=?,ended=?,result=? WHERE id=?")
        .run("succeeded", new Date().toISOString(), json(result), id);
      return { id, module: moduleId, status: "succeeded", started, result };
    } catch (e) {
      const error = safeError(e);
      this.ctx.store.db
        .prepare("UPDATE executions SET status=?,ended=?,error=? WHERE id=?")
        .run("failed", new Date().toISOString(), json(error), id);
      return { id, module: moduleId, status: "failed", started, error };
    } finally {
      this.active.delete(moduleId);
    }
  }
}
