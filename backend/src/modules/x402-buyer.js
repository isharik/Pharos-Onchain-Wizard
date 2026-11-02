import { z } from "zod";
import { createHash } from "node:crypto";
import { AppError, requireThat } from "../errors.js";

const schemaUrl = z.string().url().refine((value) => new URL(value).protocol === "https:", "Only HTTPS endpoints are allowed");
export const schema = z.object({
  task: z.string().min(3).max(500),
  endpoints: z.array(schemaUrl).length(2).refine((items) => new Set(items).size === 2, "Use two different endpoints"),
  budget: z.string().regex(/^\d+$/, "Use whole base units"),
  priceCap: z.string().regex(/^\d+$/, "Use whole base units"),
});
const timeoutFetch = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try { return await fetch(url, { signal: controller.signal, redirect: "error", headers: { accept: "application/json" } }); }
  finally { clearTimeout(timer); }
};
function offer(response, body) {
  const encoded = response.headers.get("payment-required");
  let payload = body;
  if (encoded) {
    try { payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")); } catch { throw new AppError("X402_MALFORMED", "Payment-required header is not valid x402 data", 502); }
  }
  const option = payload?.accepts?.[0] || payload;
  const amount = option?.amount ?? option?.maxAmountRequired;
  requireThat(amount !== undefined && /^\d+$/.test(String(amount)), "Endpoint did not provide a supported x402 price", "X402_UNSUPPORTED");
  return { amount: String(amount), asset: option.asset || option.currency || "unknown", payTo: option.payTo || option.recipient || "unknown" };
}
export async function execute(ctx, input) {
  let spent = 0n;
  const ledger = [];
  for (const endpoint of input.endpoints) {
    const id = createHash("sha256").update(`${ctx.runId}:${endpoint}`).digest("hex");
    try {
      const response = await timeoutFetch(endpoint);
      const text = await response.text();
      if (response.status !== 402) {
        ledger.push({ endpoint, status: "not-paywalled", detail: `HTTP ${response.status}` });
        continue;
      }
      let body; try { body = JSON.parse(text); } catch { body = {}; }
      const quote = offer(response, body), price = BigInt(quote.amount), budget = BigInt(input.budget), cap = BigInt(input.priceCap);
      const permitted = price <= cap && spent + price <= budget;
      const row = { id, endpoint, status: permitted ? "approval-required" : "refused", price: quote.amount, asset: quote.asset, payTo: quote.payTo, runningTotal: spent.toString(), reason: permitted ? "Explicit wallet approval is required before any x402 payment." : price > cap ? "Per-call price cap exceeded." : "Total budget exceeded." };
      if (permitted) spent += price;
      row.runningTotal = spent.toString();
      ctx.store.event(`x402:${id}`, "x402-payment", row);
      ledger.push(row);
    } catch (error) {
      ledger.push({ endpoint, status: "failed", reason: error.message, retrySafe: true });
    }
  }
  return { task: input.task, ledger, spent: spent.toString(), budget: input.budget, completed: false, nextStep: "Connect a wallet and explicitly approve each accepted payment. This application never auto-signs or counts a payment twice." };
}
