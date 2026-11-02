import { mkdir, writeFile } from "node:fs/promises";
import { json } from "../backend/src/errors.js";
const base = process.env.PHAROS_URL || "http://127.0.0.1:4317";
const bootstrap = await (await fetch(`${base}/api/bootstrap`)).json();
const zero = "0x0000000000000000000000000000000000000000";
const conditions = [
  {
    name: "Current gas",
    source: { kind: "gas", decimals: 9 },
    operator: "gte",
    threshold: "0",
  },
  {
    name: "Zero address balance",
    source: { kind: "balance", address: zero, decimals: 18 },
    operator: "gte",
    threshold: "0",
  },
  {
    name: "Current block",
    source: { kind: "block" },
    operator: "gt",
    threshold: "0",
  },
];
const runs = [];
async function run(module, input) {
  const res = await fetch(`${base}/api/run/${module}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-pharos-token": bootstrap.csrf,
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(input),
  });
  const result = await res.json();
  runs.push({ module, input, result });
  console.log(
    `${module}: ${result.status || res.status} ${result.result?.decision || result.error?.message || ""}`,
  );
  return result;
}
await run("threshold", { conditions });
await run("threshold", {
  conditions: conditions.map((c, i) =>
    i === 0 ? { ...c, operator: "lt", threshold: "0" } : c,
  ),
});
await run("skill-chain", {
  conditions: [
    {
      name: "Live gas",
      source: { kind: "gas", transport: "mcp", decimals: 9 },
      operator: "lt",
      threshold: "100",
    },
  ],
});
await run("dry-run", {
  transaction: { from: zero, to: zero, value: "0x1", data: "0x" },
});
for (const question of [
  "How do I deploy a contract?",
  "What is the Pharos mainnet chain ID?",
  "Which RPC endpoint should I use?",
])
  await run("doc-search", { question, source: "index" });
await mkdir("docs/evidence", { recursive: true });
await writeFile(
  "docs/evidence/demo-readonly.json",
  json({ time: new Date().toISOString(), runs }),
);
