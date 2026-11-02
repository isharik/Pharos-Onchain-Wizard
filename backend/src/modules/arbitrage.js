import { z } from "zod";
import Decimal from "decimal.js";
import {
  source,
  positive,
  decimal,
  count,
  transaction,
} from "../validation.js";
import { observations } from "../infrastructure/sources.js";
import { requireThat } from "../errors.js";
export const schema = z.object({
  sources: z.array(source).length(2),
  amount: positive,
  feeBps: count(0, 10000),
  slippageBps: count(0, 10000),
  gasUnits: positive,
  nativePrice: source,
  minProfit: decimal,
  transaction: transaction.nullable().optional(),
});
export function calculate(input, prices, nativePrice, gasPrice) {
  const [a, b] = prices.map((x) => new Decimal(x));
  const amount = new Decimal(input.amount);
  const low = Decimal.min(a, b),
    high = Decimal.max(a, b);
  const gross = high.minus(low).times(amount);
  const fees = high.times(amount).times(input.feeBps).div(10000);
  const slippage = high.times(amount).times(input.slippageBps).div(10000);
  const gas = new Decimal(gasPrice)
    .times(input.gasUnits)
    .div("1e18")
    .times(nativePrice);
  const net = gross.minus(fees).minus(slippage).minus(gas);
  return {
    grossSpread: gross.toFixed(),
    fees: fees.toFixed(),
    slippage: slippage.toFixed(),
    gas: gas.toFixed(),
    netProfit: net.toFixed(),
    decision: net.gt(input.minProfit) ? "prepare" : "skip",
    reason: net.gt(input.minProfit)
      ? "Net profit exceeds configured threshold"
      : "Net profit does not exceed threshold",
    buySource: a.lte(b) ? 0 : 1,
    sellSource: a.lte(b) ? 1 : 0,
  };
}
export async function execute(ctx, input) {
  requireThat(
    JSON.stringify(input.sources[0]) !== JSON.stringify(input.sources[1]),
    "Use two different price sources",
  );
  const { block, values } = await observations(ctx, [
    ...input.sources,
    input.nativePrice,
  ]);
  const gas = await ctx.rpc.request("eth_gasPrice");
  const result = {
    ...calculate(
      input,
      values.slice(0, 2).map((x) => x.value),
      values[2].value,
      BigInt(gas).toString(),
    ),
    block,
    observations: values,
    assumption:
      "Quote units and base asset must match; configured route gas and fees are estimates.",
  };
  if (result.decision === "prepare" && input.transaction)
    result.intent = await ctx.wallet.prepare(
      input.transaction,
      `arb:${ctx.runId}`,
    );
  return result;
}
