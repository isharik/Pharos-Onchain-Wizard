import { z } from "zod";
import { createHash } from "node:crypto";
import { isAddress } from "ethers";
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
  // Free hosted sellers may need a cold start; Vercel's function limit is 60s.
  const timer = setTimeout(() => controller.abort(), 50_000);
  try { return await fetch(url, { signal: controller.signal, redirect: "error", headers: { accept: "application/json" } }); }
  finally { clearTimeout(timer); }
};
export function offer(response, body) {
  const encoded = response.headers.get("payment-required");
  let payload = body;
  if (encoded) {
    try { payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")); } catch { throw new AppError("X402_MALFORMED", "Payment-required header is not valid x402 data", 502); }
  }
  const option = payload?.accepts?.[0] || payload;
  const amount = option?.amount ?? option?.maxAmountRequired;
  requireThat(amount !== undefined && /^\d+$/.test(String(amount)), "Endpoint did not provide a supported x402 price", "X402_UNSUPPORTED");
  const chainId = Number(option?.extra?.chainId || String(option?.network || "").split(":")[1]);
  requireThat(isAddress(option?.payTo || option?.recipient || ""), "Endpoint did not provide a valid x402 recipient", "X402_UNSUPPORTED");
  requireThat(Number.isSafeInteger(chainId) && chainId > 0, "Endpoint did not provide a supported x402 chain", "X402_UNSUPPORTED");
  return {
    amount: String(amount),
    asset: option.asset || option.currency || "unknown",
    payTo: option.payTo || option.recipient,
    scheme: option.scheme || "unknown",
    network: option.network || "unknown",
    chainId,
    resource: payload?.resource || (response.url ? new URL(response.url).pathname : "/"),
  };
}
export async function execute(ctx, input) {
  const sessionId = ctx.runId;
  let quotedSpend = 0n;
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
      const supported = quote.scheme === "pharos-native-transfer" && quote.network === "eip155:688689" && quote.chainId === 688689 && quote.asset === "native:PHRS";
      const permitted = supported && price <= cap && quotedSpend + price <= budget;
      const row = { id, sessionId, endpoint, status: permitted ? "approval-required" : "refused", price: quote.amount, asset: quote.asset, payTo: quote.payTo, scheme: quote.scheme, network: quote.network, chainId: quote.chainId, resource: quote.resource, reason: permitted ? "Explicit wallet approval is required before any x402 payment." : !supported ? "This endpoint uses an unsupported payment scheme or network." : price > cap ? "Per-call price cap exceeded." : "Total budget exceeded." };
      if (permitted) quotedSpend += price;
      row.projectedTotal = quotedSpend.toString();
      ctx.store.event(`x402:${id}`, "x402-offer", row);
      ledger.push(row);
    } catch (error) {
      ledger.push({ endpoint, status: "failed", reason: error.message, retrySafe: true });
    }
  }
  ctx.store.set(`x402:session:${sessionId}`, {
    task: input.task,
    budget: input.budget,
    priceCap: input.priceCap,
    requestedEndpoints: input.endpoints,
    offers: ledger.filter((item) => item.status === "approval-required"),
  });
  return {
    sessionId,
    task: input.task,
    ledger,
    offers: ledger.filter((item) => item.status === "approval-required"),
    spent: "0",
    quotedSpend: quotedSpend.toString(),
    budget: input.budget,
    completed: false,
    nextStep: "Review each accepted offer and explicitly sign from your browser wallet. Payment confirmation is retained by transaction hash; this application never auto-signs or counts a payment twice.",
  };
}
