import { z } from "zod";
import Decimal from "decimal.js";
import { source, positive, count, transaction } from "../validation.js";
import { observations } from "../infrastructure/sources.js";
import { requireThat } from "../errors.js";
export const schema = z.object({
  sources: z.array(source).min(3).max(12),
  current: count(0, 11),
  principal: positive,
  holdingDays: count(1, 3650),
  entryBps: count(0, 10000),
  exitBps: count(0, 10000),
  gasUnits: positive,
  nativePrice: source,
  // A route is deliberately supplied by the user or an audited route builder.
  // This module only prepares it after the economics are favourable; it never
  // constructs an opaque swap or has access to a signing key.
  transaction: transaction.nullable().optional(),
});
export async function execute(ctx, input) {
  requireThat(
    input.current < input.sources.length,
    "Current source index out of range",
  );
  requireThat(
    new Set(input.sources.map((s) => JSON.stringify(s))).size ===
      input.sources.length,
    "Yield sources must be independent",
  );
  const { block, values } = await observations(ctx, [
    ...input.sources,
    input.nativePrice,
  ]);
  const rates = values.slice(0, -1);
  const current = new Decimal(rates[input.current].value);
  const gasWei = BigInt(await ctx.rpc.request("eth_gasPrice")).toString();
  const gas = new Decimal(gasWei)
    .times(input.gasUnits)
    .div("1e18")
    .times(values.at(-1).value);
  const rows = rates
    .map((r, index) => {
      const gross = new Decimal(r.value)
        .minus(current)
        .times(input.principal)
        .times(input.holdingDays)
        .div(365);
      const fees =
        index === input.current
          ? new Decimal(0)
          : new Decimal(input.principal)
              .times(input.entryBps + input.exitBps)
              .div(10000)
              .plus(gas);
      return {
        index,
        label: input.sources[index].label || `Source ${index + 1}`,
        apr: r.value,
        grossGain: gross.toFixed(),
        cost: fees.toFixed(),
        netGain: gross.minus(fees).toFixed(),
      };
    })
    .sort((a, b) => new Decimal(b.netGain).cmp(a.netGain));
  const best = rows[0];
  const move = best.index !== input.current && new Decimal(best.netGain).gt(0);
  const result = {
    block,
    observations: values,
    rows,
    decision: move ? "recommend-rebalance" : "stay-put",
    reason: move
      ? `Source ${best.index + 1} has the best expected net gain over ${input.holdingDays} days`
      : "Incremental yield does not cover switching costs",
    expectedNetGain: best.netGain,
    assumptions:
      "APR fractions must use the same asset/quote units; linear accrual, constant APR, supplied gas estimate. Recommendation only.",
  };
  if (move && input.transaction)
    result.intent = await ctx.wallet.prepare(
      input.transaction,
      `yield:${ctx.runId}`,
      {
        feature: "yield-optimizer",
        source: input.sources[best.index].label || `Source ${best.index + 1}`,
        expectedNetGain: best.netGain,
        holdingDays: input.holdingDays,
      },
    );
  return result;
}
