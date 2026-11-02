import { z } from "zod";
import Decimal from "decimal.js";
import { formatUnits } from "ethers";
import { address, decimal, transaction, count } from "../validation.js";
export const schema = z.object({
  policy: z.object({
    spendLimit: decimal,
    allowlist: z.array(address).max(1000),
    startHourUTC: count(0, 23),
    endHourUTC: count(0, 24),
  }),
  transaction,
});
export function evaluate(input, now = new Date()) {
  const { policy: p, transaction: tx } = input;
  const hour = now.getUTCHours();
  const timePass =
    p.startHourUTC < p.endHourUTC
      ? hour >= p.startHourUTC && hour < p.endHourUTC
      : hour >= p.startHourUTC || hour < p.endHourUTC;
  const trace = [
    {
      rule: "spend-limit",
      pass: new Decimal(formatUnits(tx.value, 18)).lte(p.spendLimit),
      value: formatUnits(tx.value, 18),
      limit: p.spendLimit,
    },
    {
      rule: "allowlist",
      pass: p.allowlist.some((a) => a.toLowerCase() === tx.to.toLowerCase()),
      value: tx.to,
    },
    { rule: "time-window", pass: timePass, value: hour },
  ];
  // Native spend policy cannot bound arbitrary token/contract calls; fail closed for them.
  if (tx.data !== "0x")
    trace.push({
      rule: "unbounded-contract-call",
      pass: false,
      value: "Only native transfers are permitted by this policy",
    });
  return {
    decision: trace.every((r) => r.pass) ? "allow" : "deny",
    decidingRules: trace.filter((r) => !r.pass).map((r) => r.rule),
    trace,
  };
}
export async function execute(ctx, input) {
  const result = evaluate(input);
  ctx.store.event(ctx.runId, "policy", result);
  if (result.decision === "allow")
    result.intent = await ctx.wallet.prepare(
      input.transaction,
      `policy:${ctx.runId}`,
      { policy: input.policy },
    );
  return result;
}
