import { z } from "zod";
import { Interface } from "ethers";
import { identifier, address, count } from "../validation.js";
import { hexBlock } from "../infrastructure/sources.js";
import { requireThat } from "../errors.js";
export const schema = z.object({
  watchId: identifier,
  address,
  event: z.string().min(8).max(1000),
  fromBlock: z.string().regex(/^\d*$/).default(""),
  confirmations: count(1, 100).default(3),
});
export function decodeEvent(iface, log) {
  const decoded = iface.parseLog(log);
  requireThat(decoded, "Log did not match the event ABI");
  const fields = Object.fromEntries(
    decoded.fragment.inputs.map((p, i) => [
      p.name || `arg${i}`,
      typeof decoded.args[i] === "bigint"
        ? decoded.args[i].toString()
        : decoded.args[i],
    ]),
  );
  return {
    event: decoded.name,
    fields,
    transactionHash: log.transactionHash,
    block: BigInt(log.blockNumber).toString(),
    blockHash: log.blockHash,
    logIndex: log.logIndex,
    address: log.address,
  };
}
export async function execute(ctx, input) {
  await ctx.verifyChainMcp();
  const head = BigInt(await ctx.rpc.block()) - BigInt(input.confirmations);
  const iface = new Interface([input.event]);
  const event = iface.fragments.find((f) => f.type === "event");
  requireThat(
    event && !event.anonymous,
    "A non-anonymous event ABI is required",
  );
  const topic = iface.getEvent(event.name).topicHash;
  const key = `events:${ctx.config.network.chainId}:${input.watchId}`;
  const fingerprint = JSON.stringify({
    address: input.address.toLowerCase(),
    event: input.event,
    confirmations: input.confirmations,
  });
  const state = ctx.store.get(key, {
    fingerprint,
    next: input.fromBlock || head.toString(),
  });
  requireThat(
    state.fingerprint === fingerprint,
    "Use a new watch ID when changing event filters",
  );
  const from = BigInt(state.next);
  if (from > head)
    return { events: [], nextBlock: state.next, head: head.toString() };
  const to = from + 999n < head ? from + 999n : head;
  const logs = await ctx.chain.call("get_logs", {
    address: input.address,
    topics: [topic],
    fromBlock: hexBlock(from),
    toBlock: hexBlock(to),
  });
  requireThat(
    Array.isArray(logs),
    "Chain MCP did not return a log array",
    "MCP_RESPONSE",
  );
  const decoded = logs
    .filter((l) => !l.removed)
    .map((l) => decodeEvent(iface, l));
  const fresh = [];
  ctx.store.atomic(() => {
    for (const item of decoded)
      if (
        ctx.store.event(
          `${key}:${item.transactionHash}:${item.logIndex}`,
          "chain-event",
          item,
        )
      )
        fresh.push(item);
    ctx.store.set(key, { ...state, next: (to + 1n).toString() });
  });
  return {
    events: fresh,
    fromBlock: from.toString(),
    toBlock: to.toString(),
    nextBlock: (to + 1n).toString(),
    backlog: head > to,
    transport: "Chain MCP",
  };
}
