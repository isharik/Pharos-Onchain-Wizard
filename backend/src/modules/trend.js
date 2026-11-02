import { z } from "zod";
import Decimal from "decimal.js";
import { createHash } from "node:crypto";
import { identifier, source, count } from "../validation.js";
import { observations } from "../infrastructure/sources.js";
import { requireThat } from "../errors.js";
export const schema = z.object({
  watchId: identifier,
  source,
  direction: z.enum(["up", "down"]),
  observations: count(3, 100),
});
export function trendMet(history, count, direction) {
  if (history.length < count) return false;
  const tail = history.slice(-count);
  return tail
    .slice(1)
    .every((v, i) =>
      direction === "up"
        ? new Decimal(v.value).gt(tail[i].value)
        : new Decimal(v.value).lt(tail[i].value),
    );
}
export async function execute(ctx, input) {
  const { block, values } = await observations(ctx, [input.source]);
  const key = `trend:${input.watchId}`;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  const state = ctx.store.get(key, {
    fingerprint,
    history: [],
    triggered: false,
    triggers: [],
  });
  requireThat(
    state.fingerprint === fingerprint,
    "Use a new watch ID when changing the trend configuration",
  );
  if (state.history.some((x) => x.block === block))
    return { ...state, duplicate: true };
  state.history.push({ ...values[0], time: new Date().toISOString() });
  state.history = state.history.slice(-2000);
  const met = trendMet(state.history, input.observations, input.direction);
  const fire = met && !state.triggered;
  state.triggered = met;
  if (fire) state.triggers.push({ block, time: state.history.at(-1).time });
  ctx.store.set(key, state);
  return { ...state, decision: fire ? "fire" : "hold" };
}
