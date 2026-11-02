import { z } from "zod";
import { identifier, transaction, count } from "../validation.js";
import { requireThat, safeError } from "../errors.js";
export const schema = z.object({
  sagaId: identifier,
  operation: z.enum(["advance", "inspect", "recover"]),
  steps: z
    .array(
      z.object({
        name: z.string().min(1),
        transaction,
        compensation: transaction.nullable(),
      }),
    )
    .min(3)
    .max(20),
  maxRetries: count(0, 5).default(2),
});
export async function execute(ctx, input) {
  const key = `saga:${input.sagaId}`;
  const fingerprint = JSON.stringify(input.steps);
  const state = ctx.store.get(key, {
    fingerprint,
    index: 0,
    status: "running",
    completed: [],
    trace: [],
    attempts: {},
  });
  requireThat(
    state.fingerprint === fingerprint,
    "Workflow steps cannot change under an existing saga ID",
  );
  const log = (event) => {
    state.trace.push({ time: new Date().toISOString(), ...event });
    ctx.store.set(key, state);
  };
  if (input.operation === "inspect") return state;
  if (state.status === "complete" || state.status === "compensated")
    return state;
  if (input.operation === "recover") {
    requireThat(
      ["failed", "compensating", "manual-recovery"].includes(state.status),
      "Saga has no confirmed permanent failure to compensate",
    );
    state.status = "compensating";
    for (const index of [...state.completed].reverse()) {
      const compensation = input.steps[index].compensation;
      if (!compensation) {
        state.status = "manual-recovery";
        log({
          step: index,
          state: "manual-recovery",
          reason:
            "No compensation transaction configured; on-chain actions cannot be undone automatically",
        });
        return state;
      }
      const intent = await ctx.wallet.prepare(
        compensation,
        `saga:${input.sagaId}:compensate:${index}`,
      );
      const reconciled = await ctx.wallet.reconcile(intent.id);
      if (reconciled.status === "failed") {
        state.status = "manual-recovery";
        log({ step: index, state: "compensation-failed" });
        return { ...state, intent: reconciled };
      }
      if (reconciled.status !== "confirmed") {
        log({ step: index, state: "compensation-awaiting-confirmation" });
        return { ...state, intent: reconciled };
      }
      state.completed = state.completed.filter((i) => i !== index);
      log({ step: index, state: "compensated", hash: reconciled.hash });
    }
    state.status = "compensated";
    log({ state: "compensated" });
    return state;
  }
  requireThat(state.status === "running", "Use recover for a failed workflow");
  while (state.index < input.steps.length) {
    const index = state.index;
    const step = input.steps[index];
    let intent;
    try {
      intent = await ctx.wallet.prepare(
        step.transaction,
        `saga:${input.sagaId}:step:${index}`,
      );
    } catch (e) {
      const transient = ["RPC_HTTP", "RPC_RESPONSE", "TimeoutError"].includes(
        e.code || e.name,
      );
      state.attempts[index] = (state.attempts[index] || 0) + 1;
      if (transient && state.attempts[index] <= input.maxRetries) {
        log({
          step: index,
          state: "retryable",
          error: safeError(e),
          retryAfterMs: Math.min(1000 * 2 ** state.attempts[index], 30000),
        });
        return state;
      }
      state.status = "failed";
      log({ step: index, state: "failed", error: safeError(e) });
      return state;
    }
    const verified = await ctx.wallet.reconcile(intent.id);
    if (verified.status === "failed") {
      state.status = "failed";
      log({ step: index, state: "failed", hash: verified.hash });
      return state;
    }
    if (verified.status !== "confirmed") {
      log({
        step: index,
        state: "awaiting-confirmation",
        intentId: verified.id,
      });
      return { ...state, intent: verified };
    }
    state.completed.push(index);
    state.index++;
    log({ step: index, state: "confirmed", hash: verified.hash });
  }
  state.status = "complete";
  log({ state: "complete" });
  return state;
}
