import test from "node:test";
import assert from "node:assert/strict";
import { Interface } from "ethers";
import { Docs, rankPages, excerptFrom } from "../src/infrastructure/docs.js";
import { hashPassword, verifyPassword } from "../src/auth.js";
import { configFromEnv } from "../src/config.js";
import { settleX402Payment } from "../src/infrastructure/x402.js";
import { resolveModule } from "../src/modules/registry.js";
import {
  context,
  A,
  B,
  C,
  D,
  E,
  transaction,
  gas,
  balance,
  block,
} from "./helpers.js";
test("x402 settlement stores a receipt once and rejects cross-resource transaction reuse", async () => {
  const ctx = context(), originalFetch = global.fetch;
  const endpoint = "https://seller.example/data";
  const txHash = "0x" + "a".repeat(64);
  const challenge = {
    x402Version: 2,
    resource: "/data",
    accepts: [{
      scheme: "pharos-native-transfer",
      network: "eip155:688689",
      asset: "native:PHRS",
      amount: "5000",
      payTo: B,
      extra: { chainId: 688689 },
    }],
  };
  try {
    global.fetch = async (_url, options = {}) => {
      if (!options.headers?.["payment-signature"])
        return new Response(JSON.stringify(challenge), { status: 402, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ settlement: { success: true, transaction: txHash, resource: "/data", blockNumber: 99 } }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const input = { endpoint, txHash, payer: A, task: "x402 unit payment", budget: "6000", priceCap: "5000" };
    const settled = await settleX402Payment(ctx, input);
    assert.equal(settled.status, "settled");
    assert.equal(settled.runningTotal, "5000");
    const repeat = await settleX402Payment(ctx, input);
    assert.equal(repeat.duplicate, true);
    await assert.rejects(
      settleX402Payment(ctx, { ...input, endpoint: "https://seller.example/premium" }),
      /already used/,
    );
  } finally {
    global.fetch = originalFetch;
    ctx.store.close();
  }
});
test("Public configuration requires credentials and TLS origin", () => {
  assert.throws(() => configFromEnv({ HOST: "0.0.0.0" }));
  const hash = hashPassword("a sufficiently long password");
  assert.equal(verifyPassword("a sufficiently long password", hash), true);
  assert.equal(verifyPassword("wrong", hash), false);
  assert.equal(
    configFromEnv({
      HOST: "0.0.0.0",
      PUBLIC_ORIGIN: "https://pharos.example",
      ADMIN_PASSWORD_HASH: hash,
    }).host,
    "0.0.0.0",
  );
  assert.throws(() =>
    configFromEnv({
      PUBLIC_ORIGIN: "http://pharos.example",
      ADMIN_PASSWORD_HASH: hash,
    }),
  );
  assert.equal(
    configFromEnv({
      HOST: "0.0.0.0",
      PUBLIC_ORIGIN: "https://pharos.example",
      CORS_ORIGIN: "https://pharos-ui.vercel.app",
      ALLOW_PUBLIC_ACCESS: "true",
    }).corsOrigin,
    "https://pharos-ui.vercel.app",
  );
  assert.throws(() =>
    configFromEnv({ CORS_ORIGIN: "http://pharos-ui.vercel.app" }),
  );
});
test("Docs selects actual chain ID data and excludes irrelevant pages", () => {
  const pages = [
    {
      title: "Pacific Mainnet",
      url: "https://docs.pharos.xyz/getting-started/network/pacific-mainnet.md",
      description: "Mainnet chain ID",
    },
    {
      title: "Chainlink",
      url: "https://docs.pharos.xyz/chainlink.md",
      description: "Chain oracle",
    },
  ];
  assert.equal(
    rankPages(pages, "What is the mainnet chain ID?")[0].title,
    "Pacific Mainnet",
  );
  assert.match(
    excerptFrom(
      "# Pacific Mainnet\n| ChainID | 1672 |\n| Symbol | PROS |",
      "What is the mainnet chain ID?",
    ),
    /1672/,
  );
  assert.equal(
    excerptFrom("# Header\nNo relevant function", "Explain missing", "missing"),
    null,
  );
});
test("Docs official index mode retrieves real-format pages and returns no-match honestly", async () => {
  const docs = new Docs(
    {
      docsMode: "index",
      docsIndex: "https://www.pharos.xyz/llms.txt",
      timeout: 1000,
    },
    {},
  );
  docs.text = async (url) =>
    url.endsWith("llms.txt")
      ? "[Pacific Mainnet](https://docs.pharos.xyz/getting-started/network/pacific-mainnet.md): Chain ID"
      : "| ChainID | 1672 |";
  assert.match((await docs.search("mainnet chain ID")).answer, /1672/);
  assert.equal((await docs.search("quuxfrobnicator")).found, false);
  await assert.rejects(
    new Docs({ timeout: 1000 }, {}).text("https://evil.example/file.md"),
    /canonical/,
  );
});
test("C06 exact trigger moment is persisted and repeated block cannot fire again", async () => {
  const ctx = context();
  try {
    const m = await resolveModule("trend");
    let height = 1,
      value = 3;
    ctx.rpc.block = async () => `0x${height.toString(16)}`;
    ctx.rpc.request = async () => `0x${value.toString(16)}`;
    const input = {
      watchId: "exact",
      source: gas,
      direction: "down",
      observations: 3,
    };
    await m.execute(ctx, input);
    height++;
    value--;
    await m.execute(ctx, input);
    height++;
    value--;
    const result = await m.execute(ctx, input);
    assert.equal(result.decision, "fire");
    assert.equal(result.triggers[0].block, "0x3");
    assert.equal((await m.execute(ctx, input)).duplicate, true);
  } finally {
    ctx.store.close();
  }
});
test("C10 high switching costs recommend stay put", async () => {
  const ctx = context();
  try {
    const m = await resolveModule("yield");
    const r = await m.execute(ctx, {
      sources: [gas, balance, block],
      current: 1,
      principal: "10",
      holdingDays: 1,
      entryBps: 1000,
      exitBps: 1000,
      gasUnits: "1000000000000000000000",
      nativePrice: gas,
    });
    assert.equal(r.decision, "stay-put");
  } finally {
    ctx.store.close();
  }
});
test("C12 insufficient balance records failure without creating another period", async () => {
  const ctx = context();
  try {
    const m = await resolveModule("recurring");
    let attempts = 0;
    ctx.wallet.payment = async () => {
      attempts++;
      throw new Error("Insufficient balance");
    };
    const input = {
      scheduleId: "failed",
      frequency: "weekly",
      firstDue: "2026-01-01T00:00:00Z",
      from: A,
      recipient: B,
      amount: "1",
      token: "native",
    };
    await assert.rejects(m.execute(ctx, input));
    await assert.rejects(m.execute(ctx, input));
    const state = ctx.store.get("recurring:failed");
    assert.equal(state.payments.length, 1);
    assert.equal(state.index, 0);
    assert.equal(state.payments[0].status, "failed");
  } finally {
    ctx.store.close();
  }
});
test("C13 conflicting reused invoice reference is rejected", async () => {
  const ctx = context();
  try {
    const m = await resolveModule("invoice");
    const invoice = {
      payee: B,
      amount: "1",
      token: "native",
      reference: "INV",
    };
    await m.execute(ctx, {
      format: "json",
      invoice: JSON.stringify(invoice),
      from: A,
    });
    await assert.rejects(
      m.execute(ctx, {
        format: "json",
        invoice: JSON.stringify({ ...invoice, amount: "2" }),
        from: A,
      }),
      /different payment fields/,
    );
  } finally {
    ctx.store.close();
  }
});
test("C15 significant transfer reports token, amount, destination and label, once", async () => {
  const ctx = context();
  try {
    const iface = new Interface([
      "event Transfer(address indexed from,address indexed to,uint256 value)",
      "function decimals() view returns(uint8)",
      "function symbol() view returns(string)",
    ]);
    const event = iface.encodeEventLog(iface.getEvent("Transfer"), [
      A,
      B,
      2000000,
    ]);
    ctx.rpc.request = async (method, args) =>
      method === "eth_getLogs"
        ? [
            {
              ...event,
              transactionHash: "0x" + "a".repeat(64),
              logIndex: "0x1",
              blockNumber: "0x60",
            },
          ]
        : args[0].data === iface.encodeFunctionData("decimals")
          ? iface.encodeFunctionResult("decimals", [6])
          : iface.encodeFunctionResult("symbol", ["FIXTURE"]);
    const m = await resolveModule("whale");
    const input = {
      watchId: "significant",
      addresses: [A, B, C, D, E],
      tokens: [{ address: C, threshold: "1" }],
      labels: { [B]: "Known treasury" },
      fromBlock: "95",
    };
    const r = await m.execute(ctx, input);
    assert.equal(r.reports.length, 1);
    assert.equal(r.reports[0].amount, "2.0");
    assert.equal(r.reports[0].label, "Known treasury");
    assert.equal((await m.execute(ctx, input)).reports.length, 0);
  } finally {
    ctx.store.close();
  }
});
test("C16 deposit approval and withdrawal prepare correct unsigned calldata", async () => {
  const ctx = context();
  try {
    const abi = new Interface([
      "function asset() view returns(address)",
      "function balanceOf(address) view returns(uint256)",
      "function convertToAssets(uint256) view returns(uint256)",
      "function previewDeposit(uint256) view returns(uint256)",
      "function previewWithdraw(uint256) view returns(uint256)",
      "function maxDeposit(address) view returns(uint256)",
      "function maxWithdraw(address) view returns(uint256)",
      "function decimals() view returns(uint8)",
      "function allowance(address,address) view returns(uint256)",
      "function approve(address,uint256) returns(bool)",
      "function withdraw(uint256,address,address) returns(uint256)",
    ]);
    ctx.rpc.request = async (method, [tx]) => {
      const f = abi.parseTransaction({ data: tx.data });
      const values = {
        asset: C,
        balanceOf: 2n,
        convertToAssets: 3n,
        previewDeposit: 3n,
        previewWithdraw: 3n,
        maxDeposit: 10000000n,
        maxWithdraw: 10000000n,
        decimals: 6,
        allowance: 0n,
      };
      return abi.encodeFunctionResult(f.name, [values[f.name]]);
    };
    const m = await resolveModule("aggregator");
    const input = {
      vaults: [
        { name: "A", address: A },
        { name: "B", address: B },
      ],
      owner: E,
      amount: "1",
    };
    const deposit = await m.execute(ctx, { ...input, action: "deposit" });
    assert.equal(
      abi.parseTransaction({ data: deposit.intent.transaction.data }).name,
      "approve",
    );
    const withdrawal = await m.execute(ctx, { ...input, action: "withdraw" });
    assert.equal(
      abi.parseTransaction({ data: withdrawal.intent.transaction.data }).name,
      "withdraw",
    );
  } finally {
    ctx.store.close();
  }
});
