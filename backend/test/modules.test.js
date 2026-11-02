import test from "node:test";
import assert from "node:assert/strict";
import { resolveModule } from "../src/modules/registry.js";
import { catalog } from "../../shared/catalog.js";
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
  contract,
} from "./helpers.js";
import { evaluate } from "../src/modules/policy.js";
import { trendMet } from "../src/modules/trend.js";
import { dueDate } from "../src/modules/recurring.js";
import { parseInvoice } from "../src/modules/invoice.js";
import { calculate } from "../src/modules/arbitrage.js";
import { decodeEvent } from "../src/modules/events.js";
import { Interface } from "ethers";
for (const meta of catalog)
  test(`${meta.code} validation rejects missing inputs`, async () => {
    const module = await resolveModule(meta.id);
    assert.throws(() => module.schema.parse({}));
  });
test("C01 question reaches docs and no-match is returned without fabrication", async () => {
  const ctx = context();
  try {
    ctx.docs.search = async (q) => ({
      found: false,
      answer: `No result for ${q}`,
      sources: [],
    });
    const m = await resolveModule("doc-search");
    assert.equal(
      (await m.execute(ctx, { question: "unknown", source: "mcp" })).found,
      false,
    );
  } finally {
    ctx.store.close();
  }
});
test("C02 independent conditions produce fire/hold and trace; same sources rejected", async () => {
  const ctx = context();
  try {
    const m = await resolveModule("threshold");
    const conditions = [gas, balance, block].map((s, i) => ({
      name: `r${i}`,
      source: s,
      operator: "gt",
      threshold: "0",
    }));
    assert.equal((await m.execute(ctx, { conditions })).decision, "fire");
    conditions[0].threshold = "99";
    const result = await m.execute(ctx, { conditions });
    assert.equal(result.decision, "hold");
    assert.equal(result.trace.length, 3);
    await assert.rejects(
      m.execute(ctx, {
        conditions: [conditions[0], conditions[0], conditions[0]],
      }),
    );
  } finally {
    ctx.store.close();
  }
});
test("C03 three steps verify before next, forced failure and reverse compensation", async () => {
  const ctx = context();
  try {
    const m = await resolveModule("saga");
    const input = {
      sagaId: "s",
      operation: "advance",
      maxRetries: 2,
      steps: [0, 1, 2].map((i) => ({
        name: `step${i}`,
        transaction,
        compensation: transaction,
      })),
    };
    const successful = await m.execute(ctx, input);
    assert.equal(successful.status, "complete");
    assert.deepEqual(successful.completed, [0, 1, 2]);
    ctx.wallet.reconcile = async (id) => ({
      id,
      status: id.endsWith("step:1") ? "failed" : "confirmed",
    });
    let result = await m.execute(ctx, { ...input, sagaId: "f" });
    assert.equal(result.status, "failed");
    assert.deepEqual(result.completed, [0]);
    result = await m.execute(ctx, {
      ...input,
      sagaId: "f",
      operation: "recover",
    });
    assert.equal(result.status, "compensated");
  } finally {
    ctx.store.close();
  }
});
test("C03 pending receipt never advances and transient reads are retryable", async () => {
  const ctx = context();
  try {
    const m = await resolveModule("saga");
    const input = {
      sagaId: "pending",
      operation: "advance",
      maxRetries: 1,
      steps: [0, 1, 2].map((i) => ({
        name: `s${i}`,
        transaction,
        compensation: transaction,
      })),
    };
    ctx.wallet.reconcile = async (id) => ({ id, status: "submitted" });
    assert.equal((await m.execute(ctx, input)).index, 0);
    ctx.wallet.prepare = async () => {
      throw Object.assign(new Error("429"), { code: "RPC_HTTP" });
    };
    let r = await m.execute(ctx, { ...input, sagaId: "retry" });
    assert.equal(r.status, "running");
    r = await m.execute(ctx, { ...input, sagaId: "retry" });
    assert.equal(r.status, "failed");
  } finally {
    ctx.store.close();
  }
});
test("C04 cost calculation and configurable threshold never count gross as net", () => {
  const input = {
    amount: "10",
    feeBps: 30,
    slippageBps: 20,
    gasUnits: "100000",
    minProfit: "1",
  };
  const result = calculate(input, ["100", "102"], "2000", "1000000000");
  assert.equal(result.netProfit, "14.7");
  assert.equal(result.decision, "prepare");
  assert.equal(
    calculate(
      { ...input, minProfit: "15" },
      ["100", "102"],
      "2000",
      "1000000000",
    ).decision,
    "skip",
  );
});
test("C05 failed simulation never prepares a transaction", async () => {
  const ctx = context();
  try {
    ctx.wallet.simulate = async () => ({ success: false, reason: "reverted" });
    ctx.wallet.prepare = async () => assert.fail("must not prepare");
    const m = await resolveModule("dry-run");
    assert.equal((await m.execute(ctx, { transaction })).success, false);
  } finally {
    ctx.store.close();
  }
});
test("C06 single spike cannot trigger, three descending observations can", () => {
  assert.equal(
    trendMet([{ value: "3" }, { value: "1" }, { value: "4" }], 3, "down"),
    false,
  );
  assert.equal(
    trendMet([{ value: "3" }, { value: "2" }, { value: "1" }], 3, "down"),
    true,
  );
  assert.equal(trendMet([{ value: "3" }, { value: "2" }], 3, "down"), false);
});
test("C06 repeated block is deduplicated and configuration change is rejected", async () => {
  const ctx = context();
  try {
    const m = await resolveModule("trend");
    const input = {
      watchId: "t",
      source: gas,
      direction: "up",
      observations: 3,
    };
    await m.execute(ctx, input);
    const result = await m.execute(ctx, input);
    assert.equal(result.history.length, 1);
    assert.equal(result.duplicate, true);
    await assert.rejects(m.execute(ctx, { ...input, direction: "down" }));
  } finally {
    ctx.store.close();
  }
});
test("C07 denies each rule and contract calls; supports overnight time window", () => {
  const input = {
    policy: {
      spendLimit: "1",
      allowlist: [B],
      startHourUTC: 9,
      endHourUTC: 17,
    },
    transaction,
  };
  const noon = new Date("2026-01-01T12:00:00Z");
  assert.equal(evaluate(input, noon).decision, "allow");
  assert.ok(
    evaluate(
      {
        ...input,
        transaction: { ...transaction, value: "0x1bc16d674ec80000" },
      },
      noon,
    ).decidingRules.includes("spend-limit"),
  );
  assert.ok(
    evaluate(
      { ...input, policy: { ...input.policy, allowlist: [] } },
      noon,
    ).decidingRules.includes("allowlist"),
  );
  assert.ok(
    evaluate(input, new Date("2026-01-01T20:00:00Z")).decidingRules.includes(
      "time-window",
    ),
  );
  assert.equal(
    evaluate({ ...input, transaction: { ...transaction, data: "0x12" } }, noon)
      .decision,
    "deny",
  );
});
test("C07 denied actions do not prepare and are audited", async () => {
  const ctx = context();
  try {
    ctx.wallet.prepare = async () => assert.fail();
    const m = await resolveModule("policy");
    await m.execute(ctx, {
      policy: {
        spendLimit: "1",
        allowlist: [],
        startHourUTC: 0,
        endHourUTC: 24,
      },
      transaction,
    });
    assert.equal(ctx.store.events("policy").length, 1);
  } finally {
    ctx.store.close();
  }
});
test("C08 same-flow Chain MCP evidence determines Skill result", async () => {
  const ctx = context();
  try {
    let called = false;
    ctx.chain.call = async () => {
      called = true;
      return { gasPriceWei: "30" };
    };
    const m = await resolveModule("skill-chain");
    const result = await m.execute(ctx, {
      conditions: [
        { name: "gas", source: gas, operator: "lt", threshold: "20" },
      ],
    });
    assert.equal(called, true);
    assert.equal(result.decision, "hold");
    assert.equal(result.trace[0].transport, "mcp");
  } finally {
    ctx.store.close();
  }
});
test("C09 two different functions decode through Chain MCP, no sources stops call", async () => {
  const ctx = context();
  try {
    const m = await resolveModule("docs-chain");
    for (const fn of ["value", "otherValue"]) {
      const abi = [`function ${fn}() view returns(uint256)`];
      ctx.chain.call = async () => ({
        result: new Interface(abi).encodeFunctionResult(fn, [42]),
      });
      const result = await m.execute(ctx, {
        question: "explain",
        contract: { ...contract, abi, function: fn },
      });
      assert.equal(result.observation.value, "42");
    }
    ctx.docs.search = async () => ({ found: false });
    ctx.chain.call = async () => assert.fail();
    await assert.rejects(m.execute(ctx, { question: "unknown", contract }));
  } finally {
    ctx.store.close();
  }
});
test("C10 three live-observation fixtures account for cost and holding days", async () => {
  const ctx = context();
  try {
    const m = await resolveModule("yield");
    const sources = [
      { ...gas, label: "A" },
      { ...balance, label: "B" },
      { ...block, label: "C" },
    ];
    const r = await m.execute(ctx, {
      sources,
      current: 0,
      principal: "1000",
      holdingDays: 30,
      entryBps: 5,
      exitBps: 5,
      gasUnits: "100",
      nativePrice: gas,
    });
    assert.equal(r.rows.length, 3);
    assert.equal(r.decision, "recommend-rebalance");
    assert.ok(r.rows.every((row) => typeof row.netGain === "string"));
  } finally {
    ctx.store.close();
  }
});
test("C11 health alert includes concrete repayment and timestamps via notification layer", async () => {
  const ctx = context();
  try {
    const m = await resolveModule("liquidation");
    let payload;
    ctx.notifications.send = async (id, channel, p) => {
      payload = p;
      return { status: "delivered" };
    };
    const r = await m.execute(ctx, {
      positionId: "p",
      collateral: balance,
      debt: balance,
      health: { ...gas, decimals: 1 },
      warning: "1.3",
      critical: "1.1",
      target: "1.5",
      channel: "console",
    });
    assert.equal(r.severity, "critical");
    assert.ok(Number(r.repayQuote) > 0);
    assert.match(payload.message, /Repay/);
  } finally {
    ctx.store.close();
  }
});
test("C12 month-end recurrence preserves original anchor and weekly schedule", () => {
  assert.equal(
    dueDate("2026-01-31T12:00:00Z", "monthly", 1),
    "2026-02-28T12:00:00.000Z",
  );
  assert.equal(
    dueDate("2026-01-31T12:00:00Z", "monthly", 2),
    "2026-03-31T12:00:00.000Z",
  );
  assert.equal(
    dueDate("2026-01-31T12:00:00Z", "weekly", 1),
    "2026-02-07T12:00:00.000Z",
  );
});
test("C12 pending payment not duplicated; receipt advances schedule", async () => {
  const ctx = context();
  try {
    const m = await resolveModule("recurring");
    let prepared = 0;
    ctx.wallet.prepare = async () => {
      prepared++;
      return { id: "payment", status: "prepared" };
    };
    const input = {
      scheduleId: "pay",
      frequency: "weekly",
      firstDue: "2026-01-01T00:00:00Z",
      from: A,
      recipient: B,
      amount: "1",
      token: "native",
    };
    await m.execute(ctx, input);
    ctx.wallet.reconcile = async () => ({ status: "submitted" });
    let r = await m.execute(ctx, input);
    assert.equal(prepared, 1);
    assert.equal(r.payments[0].status, "pending");
    ctx.wallet.reconcile = async () => ({ status: "confirmed" });
    r = await m.execute(ctx, input);
    assert.equal(r.payments[0].status, "paid");
    assert.equal(r.index, 1);
  } finally {
    ctx.store.close();
  }
});
test("C13 JSON and text parse equally; missing, ambiguous and duplicate fields fail", () => {
  const invoice = {
    payee: B,
    amount: "2",
    token: "native",
    reference: "INV-1",
  };
  assert.deepEqual(parseInvoice("json", JSON.stringify(invoice)), invoice);
  assert.deepEqual(
    parseInvoice(
      "text",
      Object.entries(invoice)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n"),
    ),
    invoice,
  );
  assert.throws(() => parseInvoice("json", '{"amount":"2"}'));
  assert.throws(() => parseInvoice("text", `Payee: ${B}\nPayee: ${A}`));
  assert.throws(() => parseInvoice("text", "Send two coins tomorrow"));
});
test("C14 threshold alerts are edge triggered without repeated spam", async () => {
  const ctx = context();
  try {
    let sent = 0;
    ctx.notifications.send = async () => {
      sent++;
      return { status: "delivered" };
    };
    const m = await resolveModule("alert");
    const input = {
      alertId: "a",
      source: gas,
      operator: "gt",
      threshold: "5",
      channel: "discord",
    };
    await m.execute(ctx, input);
    await m.execute(ctx, input);
    assert.equal(sent, 1);
  } finally {
    ctx.store.close();
  }
});
test("C15 distinct address threshold and no fabricated reports", async () => {
  const ctx = context();
  try {
    const m = await resolveModule("whale");
    const input = {
      watchId: "w",
      addresses: [A, B, C, D, E],
      tokens: [{ address: A, threshold: "100" }],
      labels: {},
      fromBlock: "95",
    };
    const token = new Interface([
      "function decimals() view returns(uint8)",
      "function symbol() view returns(string)",
    ]);
    ctx.rpc.request = async (method, args) =>
      method === "eth_call"
        ? args[0].data === token.encodeFunctionData("decimals")
          ? token.encodeFunctionResult("decimals", [18])
          : token.encodeFunctionResult("symbol", ["TEST"])
        : [];
    const r = await m.execute(ctx, input);
    assert.deepEqual(r.reports, []);
    await assert.rejects(
      m.execute(ctx, { ...input, addresses: [A, A, A, A, A] }),
    );
  } finally {
    ctx.store.close();
  }
});
test("C16 one failed vault does not break another; quotes converted to same asset units", async () => {
  const ctx = context();
  try {
    const m = await resolveModule("aggregator");
    const abi = new Interface([
      "function asset() view returns(address)",
      "function balanceOf(address) view returns(uint256)",
      "function convertToAssets(uint256) view returns(uint256)",
      "function previewDeposit(uint256) view returns(uint256)",
      "function maxDeposit(address) view returns(uint256)",
      "function decimals() view returns(uint8)",
    ]);
    ctx.rpc.request = async (method, [tx]) => {
      if (tx.to === B) throw new Error("offline");
      const f = abi.parseTransaction({ data: tx.data });
      const values = {
        asset: C,
        balanceOf: 2n,
        convertToAssets: 3n,
        previewDeposit: 3n,
        maxDeposit: 1000000n,
        decimals: 6,
      };
      return abi.encodeFunctionResult(f.name, [values[f.name]]);
    };
    const r = await m.execute(ctx, {
      vaults: [
        { name: "live", address: A },
        { name: "offline", address: B },
      ],
      owner: E,
      action: "query",
      amount: "1",
    });
    assert.equal(r.selected, "live");
    assert.equal(r.venues[1].available, false);
  } finally {
    ctx.store.close();
  }
});
test("C17 filtered event decode, persistent cursor and deduplication", async () => {
  const ctx = context();
  try {
    const m = await resolveModule("events");
    const event =
      "event Transfer(address indexed from,address indexed to,uint256 value)";
    const iface = new Interface([event]);
    const encoded = iface.encodeEventLog(iface.getEvent("Transfer"), [
      A,
      B,
      50,
    ]);
    const log = {
      ...encoded,
      address: C,
      blockNumber: "0x61",
      blockHash: "0x" + "c".repeat(64),
      transactionHash: "0x" + "d".repeat(64),
      logIndex: "0x0",
    };
    let args;
    ctx.chain.call = async (name, input) => {
      args = input;
      return [log];
    };
    const input = {
      watchId: "e",
      address: C,
      event,
      fromBlock: "97",
      confirmations: 3,
    };
    const r = await m.execute(ctx, input);
    assert.equal(r.events[0].fields.value, "50");
    assert.equal(args.address, C);
    assert.equal(args.topics[0], iface.getEvent("Transfer").topicHash);
    assert.equal((await m.execute(ctx, input)).events.length, 0);
  } finally {
    ctx.store.close();
  }
});
for (const id of [
  "threshold",
  "arbitrage",
  "trend",
  "skill-chain",
  "yield",
  "liquidation",
  "alert",
  "whale",
  "aggregator",
  "events",
])
  test(`${id}: upstream failure is not success`, async () => {
    const ctx = context();
    try {
      ctx.rpc.block = async () => {
        throw new Error("network unavailable");
      };
      const m = await resolveModule(id);
      const raw = Object.fromEntries(
        catalog.find((x) => x.id === id).fields.map((f) => [f.name, f.value]),
      );
      if (id === "threshold")
        raw.conditions = [gas, balance, block].map((source, i) => ({
          name: `c${i}`,
          source,
          operator: "gt",
          threshold: "0",
        }));
      if (id === "arbitrage") raw.sources = [gas, balance];
      if (id === "yield") raw.sources = [gas, balance, block];
      if (id === "whale") raw.addresses = [A, B, C, D, E];
      if (id === "aggregator")
        raw.vaults = [
          { name: "a", address: A },
          { name: "b", address: B },
        ];
      await assert.rejects(m.execute(ctx, raw));
    } finally {
      ctx.store.close();
    }
  });
