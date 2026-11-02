import { mkdir, writeFile } from "node:fs/promises";
import { configFromEnv } from "../backend/src/config.js";
import { createContext } from "../backend/src/context.js";
import { Store } from "../backend/src/database.js";
import { safeError, json } from "../backend/src/errors.js";
import { execute as events } from "../backend/src/modules/events.js";
const ctx = createContext(configFromEnv(), new Store(":memory:"));
const results = [];
async function check(name, fn) {
  try {
    const data = await fn();
    results.push({ name, status: "passed", data });
    console.log(`${name}: passed`);
  } catch (e) {
    results.push({ name, status: "blocked", error: safeError(e) });
    console.log(`${name}: blocked - ${safeError(e).message}`);
  }
}
await check("RPC chain and block", async () => ({
  chainId: await ctx.rpc.verify(),
  block: await ctx.rpc.block(),
}));
await check("Chain MCP schema discovery", async () =>
  (await ctx.chain.connect()).map((t) => ({
    name: t.name,
    inputSchema: t.inputSchema,
  })),
);
await check("Chain MCP chain identity", () => ctx.verifyChainMcp());
await check("Chain MCP read-only call", () =>
  ctx.chain.call("eth_call", {
    transaction: {
      to: "0x0000000000000000000000000000000000000000",
      data: "0x",
    },
  }),
);
await check("SkillEngine installation and Foundry", () => ctx.skill.inspect());
await check("SkillEngine live balance", () =>
  ctx.skill.read(
    {
      kind: "balance",
      address: "0x0000000000000000000000000000000000000000",
      decimals: 18,
    },
    "latest",
  ),
);
if (ctx.config.docsMode === "mcp") {
  await check("Developer Docs MCP transport", () => ctx.docsMcp.connect());
}
await check("Official documentation index", () =>
  ctx.docs.search("network", "index"),
);
// Real read-only log discovery; no transaction is generated for this check.
await check("Live Transfer event via Chain MCP", async () => {
  const head = BigInt(await ctx.rpc.block()) - 3n;
  const from = head - 50n;
  const transfer =
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const logs = await ctx.chain.call("get_logs", {
    fromBlock: "0x" + from.toString(16),
    toBlock: "0x" + head.toString(16),
    topics: [transfer],
  });
  const log = logs.find((l) => l.topics.length === 3 && l.data.length === 66);
  if (!log)
    throw new Error(
      "No ERC-20 Transfer event in the sampled 51 blocks; live event demonstration remains pending",
    );
  const input = {
    watchId: "live-verification",
    address: log.address,
    event:
      "event Transfer(address indexed from,address indexed to,uint256 value)",
    fromBlock: BigInt(log.blockNumber).toString(),
    confirmations: 3,
  };
  const first = await events(ctx, input);
  const second = await events(ctx, input);
  return { first, second };
});
await ctx.close();
await mkdir("docs/evidence", { recursive: true });
await writeFile(
  "docs/evidence/live-check.json",
  json({ time: new Date().toISOString(), results }),
);
