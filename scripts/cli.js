import { readFile } from "node:fs/promises";
import { configFromEnv } from "../backend/src/config.js";
import { createContext } from "../backend/src/context.js";
import { Runner } from "../backend/src/runner.js";
import { json, safeError } from "../backend/src/errors.js";
const [moduleId, ...args] = process.argv.slice(2);
if (!moduleId) {
  console.error(
    'Usage: npm run cli -- doc-search "How do I deploy a contract?" [mcp|index]\n       npm run cli -- <module-id> <input.json>',
  );
  process.exit(1);
}
const ctx = createContext(configFromEnv());
try {
  const input =
    moduleId === "doc-search"
      ? { question: args[0], source: args[1] || "index" }
      : JSON.parse(await readFile(args[0], "utf8"));
  const result = await new Runner(ctx).run(moduleId, input);
  console.log(json(result));
  if (result.status === "failed") process.exitCode = 1;
} catch (e) {
  console.error(json(safeError(e)));
  process.exitCode = 1;
} finally {
  await ctx.close();
}
