import { z } from "zod";
import { Interface, formatUnits, zeroPadValue } from "ethers";
import Decimal from "decimal.js";
import { identifier, address, decimal } from "../validation.js";
import { hexBlock } from "../infrastructure/sources.js";
import { requireThat } from "../errors.js";
const iface = new Interface([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
  "function decimals() view returns(uint8)",
  "function symbol() view returns(string)",
]);
export const schema = z.object({
  watchId: identifier,
  addresses: z.array(address).min(5).max(100),
  tokens: z
    .array(z.object({ address, threshold: decimal }))
    .min(1)
    .max(20),
  labels: z.record(z.string(), z.string().max(100)).default({}),
  fromBlock: z.string().regex(/^\d*$/).default(""),
});
export async function execute(ctx, input) {
  requireThat(
    new Set(input.addresses.map((a) => a.toLowerCase())).size >= 5,
    "At least five distinct addresses required",
  );
  const head = BigInt(await ctx.rpc.block()) - 3n;
  const key = `whale:${ctx.config.network.chainId}:${input.watchId}`;
  const fingerprint = JSON.stringify({ ...input, fromBlock: "" });
  const state = ctx.store.get(key, {
    fingerprint,
    next: input.fromBlock || head.toString(),
  });
  requireThat(
    state.fingerprint === fingerprint,
    "Use a new watch ID for changed whale configuration",
  );
  const from = BigInt(state.next);
  if (from > head) return { reports: [], recent: ctx.store.events(key) };
  const to = from + 99n < head ? from + 99n : head;
  const reports = [];
  const watched = input.addresses.map((a) => a.toLowerCase());
  const topics = watched.map((a) => zeroPadValue(a, 32));
  for (const token of input.tokens) {
    const call = async (name) =>
      iface.decodeFunctionResult(
        name,
        await ctx.rpc.request("eth_call", [
          { to: token.address, data: iface.encodeFunctionData(name) },
          hexBlock(to),
        ]),
      )[0];
    const decimals = Number(await call("decimals"));
    requireThat(decimals <= 36, "Unsupported token decimals");
    const symbol = await call("symbol");
    const found = new Map();
    for (const filter of [
      [iface.getEvent("Transfer").topicHash, topics],
      [iface.getEvent("Transfer").topicHash, null, topics],
    ]) {
      const logs = await ctx.rpc.request("eth_getLogs", [
        {
          address: token.address,
          fromBlock: hexBlock(from),
          toBlock: hexBlock(to),
          topics: filter,
        },
      ]);
      for (const log of logs)
        if (!log.removed)
          found.set(`${log.transactionHash}:${log.logIndex}`, log);
    }
    for (const [id, log] of found) {
      const decoded = iface.parseLog(log);
      const amount = formatUnits(decoded.args.value, decimals);
      if (new Decimal(amount).lt(token.threshold)) continue;
      const destination = decoded.args.to;
      const label = Object.entries(input.labels).find(
        ([a]) => a.toLowerCase() === destination.toLowerCase(),
      )?.[1];
      reports.push({
        id,
        token: token.address,
        symbol,
        amount,
        from: decoded.args.from,
        to: destination,
        label: label || null,
        transactionHash: log.transactionHash,
        block: BigInt(log.blockNumber).toString(),
        explanation: `${amount} ${symbol} moved to ${label || destination}; exceeds configured ${token.threshold} ${symbol} threshold.`,
        link: `${ctx.config.network.explorer}/tx/${log.transactionHash}`,
      });
    }
  }
  const fresh = [];
  ctx.store.atomic(() => {
    for (const report of reports)
      if (ctx.store.event(`${key}:${report.token}:${report.id}`, key, report))
        fresh.push(report);
    ctx.store.set(key, { ...state, next: (to + 1n).toString() });
  });
  return {
    reports: fresh,
    recent: ctx.store.events(key),
    nextBlock: (to + 1n).toString(),
    scope:
      "ERC-20 transfer activity; protocol positions are not inferred from transfers.",
  };
}
