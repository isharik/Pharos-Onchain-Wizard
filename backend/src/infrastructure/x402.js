import { createHash } from "node:crypto";
import { isAddress } from "ethers";
import { AppError, requireThat } from "../errors.js";
import { offer } from "../modules/x402-buyer.js";

const httpsUrl = (value) => {
  const url = new URL(value);
  requireThat(url.protocol === "https:", "Only HTTPS x402 endpoints are allowed");
  return url;
};

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, {
      ...options,
      redirect: "error",
      signal: controller.signal,
      headers: { accept: "application/json", ...(options.headers || {}) },
    });
  } finally {
    clearTimeout(timer);
  }
};

const paymentProof = (quote, txHash, payer) =>
  Buffer.from(
    JSON.stringify({
      x402Version: 2,
      scheme: quote.scheme,
      network: quote.network,
      payload: { txHash, payer },
    }),
  ).toString("base64");

const decodeReceipt = (response, body) => {
  const encoded = response.headers.get("payment-response");
  if (encoded) {
    try {
      return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    } catch {
      throw new AppError("X402_MALFORMED", "Payment-response header is not valid JSON", 502);
    }
  }
  return body?.settlement || body;
};

export async function settleX402Payment(ctx, input) {
  const endpoint = httpsUrl(input.endpoint).toString();
  requireThat(/^0x[0-9a-fA-F]{64}$/.test(input.txHash), "A valid transaction hash is required");
  requireThat(isAddress(input.payer), "A valid payer address is required");
  requireThat(/^\d+$/.test(input.budget) && /^\d+$/.test(input.priceCap), "Budget and price cap must be whole base units");

  const txKey = `x402:transaction:${input.txHash.toLowerCase()}`;
  const existing = ctx.store.get(txKey);
  if (existing) {
    requireThat(existing.endpoint === endpoint, "This payment transaction was already used for another resource", "X402_REUSED_PAYMENT");
    return { ...existing, duplicate: true };
  }

  const challengeResponse = await fetchWithTimeout(endpoint);
  const challengeText = await challengeResponse.text();
  requireThat(challengeResponse.status === 402, "Endpoint did not return an x402 payment challenge", "X402_UNSUPPORTED");
  let challengeBody;
  try { challengeBody = JSON.parse(challengeText); } catch { challengeBody = {}; }
  const quote = offer(challengeResponse, challengeBody);
  requireThat(quote.scheme === "pharos-native-transfer", "This buyer currently supports the Pharos native-transfer x402 scheme", "X402_UNSUPPORTED");
  const price = BigInt(quote.amount), cap = BigInt(input.priceCap), budget = BigInt(input.budget);
  requireThat(price <= cap, "Per-call price cap exceeded", "X402_PRICE_CAP");
  const ledger = ctx.store.get("x402:ledger", []);
  const spent = ledger.reduce((total, item) => total + BigInt(item.price || "0"), 0n);
  requireThat(spent + price <= budget, "Total budget exceeded", "X402_BUDGET");

  const paid = await fetchWithTimeout(endpoint, {
    headers: { "payment-signature": paymentProof(quote, input.txHash, input.payer) },
  });
  const paidText = await paid.text();
  let paidBody;
  try { paidBody = JSON.parse(paidText); } catch { paidBody = {}; }
  if (paid.status === 402)
    throw new AppError("X402_PENDING", paidBody?.error || "Payment is not confirmed by the facilitator yet; retry verification with the same transaction hash.", 409);
  requireThat(paid.ok, `Paid resource returned HTTP ${paid.status}`, "X402_SETTLEMENT_FAILED");
  const receipt = decodeReceipt(paid, paidBody);
  requireThat(receipt?.success === true, "Facilitator did not confirm payment settlement", "X402_SETTLEMENT_FAILED");
  requireThat(String(receipt.transaction || "").toLowerCase() === input.txHash.toLowerCase(), "Facilitator receipt does not match the submitted transaction", "X402_SETTLEMENT_FAILED");

  const item = {
    id: createHash("sha256").update(`${endpoint}:${input.txHash.toLowerCase()}`).digest("hex"),
    endpoint,
    resource: receipt.resource || quote.resource,
    price: quote.amount,
    asset: quote.asset,
    payer: input.payer,
    payTo: quote.payTo,
    chainId: quote.chainId,
    transactionHash: input.txHash,
    blockNumber: receipt.blockNumber || null,
    status: "settled",
    settledAt: new Date().toISOString(),
  };
  ctx.store.atomic(() => {
    const again = ctx.store.get(txKey);
    if (again) return again;
    const all = ctx.store.get("x402:ledger", []);
    ctx.store.set(txKey, item);
    ctx.store.set("x402:ledger", [item, ...all].slice(0, 200));
    ctx.store.event(`x402:settled:${item.id}`, "x402-payment", item);
  });
  return { ...item, runningTotal: (spent + price).toString(), receipt };
}

export function x402Ledger(ctx) {
  return ctx.store.get("x402:ledger", []);
}
