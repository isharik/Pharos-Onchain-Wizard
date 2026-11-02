import { writeFile, mkdir } from "node:fs/promises";
import { configFromEnv } from "../backend/src/config.js";
import { createContext } from "../backend/src/context.js";
import { Store } from "../backend/src/database.js";
import { Runner } from "../backend/src/runner.js";
import { json } from "../backend/src/errors.js";
const ctx = createContext(configFromEnv(), new Store(":memory:"));
const runner = new Runner(ctx);
const results = [];
for (const question of [
  "How do I deploy a contract with Foundry?",
  "What is the Pharos mainnet chain ID?",
  "Which RPC endpoint should I use?",
  "flibbertigibbet quuxfrobnicator",
]) {
  const input = { question, source: "index" };
  const result = await runner.run("doc-search", input);
  results.push({ input, result });
  console.log(json({ question, status: result.status, result: result.result }));
}
for (const address of [
  "0x52c48d4213107b20bc583832b0d951fb9ca8f0b0",
  "0xc879c018db60520f4355c26ed1a6d572cdac1815",
]) {
  const input = {
    question: "Explain the ERC20 token balanceOf account balance function",
    contract: {
      kind: "contract",
      transport: "mcp",
      address,
      abi: ["function balanceOf(address account) view returns(uint256)"],
      function: "balanceOf",
      args: ["0x0000000000000000000000000000000000000000"],
      index: 0,
      decimals: 0,
    },
  };
  const result = await runner.run("docs-chain", input);
  results.push({ input, result });
  console.log(
    json({
      address,
      status: result.status,
      result: result.result,
      error: result.error,
    }),
  );
}
await ctx.close();
await mkdir("docs/evidence", { recursive: true });
await writeFile(
  "docs/evidence/docs-demo.json",
  json({ time: new Date().toISOString(), results }),
);
