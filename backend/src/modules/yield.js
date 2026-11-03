import { z } from "zod";
import Decimal from "decimal.js";
import { Interface, toQuantity } from "ethers";
import { source, positive, count, transaction } from "../validation.js";
import { readSource } from "../infrastructure/sources.js";
import { requireThat } from "../errors.js";

const erc4626 = new Interface([
  "function convertToAssets(uint256 shares) view returns (uint256)",
]);

function blockTime(block) {
  requireThat(block?.timestamp !== undefined, "Block timestamp is missing");
  return BigInt(block.timestamp);
}

async function annualizedVaultYield(ctx, source, head) {
  const prior = BigInt(head) - BigInt(source.lookbackBlocks);
  requireThat(prior > 0n, "Lookback reaches before genesis");
  const [headInfo, priorInfo] = await Promise.all([
    ctx.rpc.request("eth_getBlockByNumber", [head, false]),
    ctx.rpc.request("eth_getBlockByNumber", [toQuantity(prior), false]),
  ]);
  const elapsedSeconds = blockTime(headInfo) - blockTime(priorInfo);
  requireThat(elapsedSeconds > 0n, "Lookback blocks have no elapsed time");
  const contractSource = {
    kind: "contract",
    transport: source.transport,
    address: source.address,
    abi: ["function convertToAssets(uint256 shares) view returns (uint256)"],
    function: "convertToAssets",
    args: [source.shareUnits],
    index: 0,
    decimals: 0,
    label: source.label,
  };
  const [before, after] = await Promise.all([
    readSource(ctx, contractSource, toQuantity(prior)),
    readSource(ctx, contractSource, head),
  ]);
  requireThat(BigInt(before.raw) > 0n, "Historical vault value is zero");
  const annualized = new Decimal(after.raw)
    .div(before.raw)
    .minus(1)
    .times(31_557_600)
    .div(elapsedSeconds.toString());
  return {
    value: annualized.toSignificantDigits(18).toFixed(),
    raw: `${after.raw}/${before.raw}`,
    block: String(head),
    transport: source.transport || "rpc",
    source,
    yieldMethod: "annualized-erc4626-share-return",
    window: {
      fromBlock: toQuantity(prior),
      toBlock: String(head),
      elapsedSeconds: elapsedSeconds.toString(),
      shareUnits: source.shareUnits,
      assetsThen: before.raw,
      assetsNow: after.raw,
    },
  };
}

async function yieldObservations(ctx, sources, nativePrice) {
  const block = await ctx.rpc.block();
  const values = [];
  for (const item of sources)
    values.push(
      item.kind === "vaultYield"
        ? await annualizedVaultYield(ctx, item, block)
        : await readSource(ctx, item, block),
    );
  values.push(await readSource(ctx, nativePrice, block));
  return { block, values };
}

export const schema = z.object({
  sources: z.array(source).min(3).max(12),
  current: count(0, 11),
  principal: positive,
  holdingDays: count(1, 3650),
  entryBps: count(0, 10000),
  exitBps: count(0, 10000),
  gasUnits: positive,
  nativePrice: source.refine(
    (item) => item.kind !== "vaultYield",
    "Native price must be a direct chain source",
  ),
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
  const { block, values } = await yieldObservations(
    ctx,
    input.sources,
    input.nativePrice,
  );
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
      "Direct sources return APR fractions. Annualized vault sources derive a linear annualized return from two ERC-4626 share-value reads at real blocks. All sources must use the same asset/quote units; configured fees and gas are estimates.",
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
