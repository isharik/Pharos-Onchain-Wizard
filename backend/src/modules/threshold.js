import { z } from "zod";
import { condition } from "../validation.js";
import { observations, compare } from "../infrastructure/sources.js";
import { requireThat } from "../errors.js";
export const schema = z.object({
  conditions: z.array(condition).min(3).max(12),
});
export async function decide(ctx, input, min = 3) {
  requireThat(
    input.conditions.length >= min,
    `At least ${min} conditions required`,
  );
  const signatures = input.conditions.map((c) =>
    JSON.stringify({
      kind: c.source.kind,
      address: c.source.address?.toLowerCase(),
      function: c.source.function,
      args: c.source.args || [],
      index: c.source.index || 0,
    }),
  );
  requireThat(
    new Set(signatures).size >= min,
    "Conditions must read independent chain sources",
  );
  const { block, values } = await observations(
    ctx,
    input.conditions.map((c) => c.source),
  );
  const trace = input.conditions.map((c, i) => ({
    ...values[i],
    name: c.name,
    operator: c.operator,
    threshold: c.threshold,
    pass: compare(values[i].value, c.operator, c.threshold),
  }));
  return {
    decision: trace.every((c) => c.pass) ? "fire" : "hold",
    block,
    trace,
    action: "Decision only; no transaction broadcast",
  };
}
export const execute = (ctx, input) => decide(ctx, input);
