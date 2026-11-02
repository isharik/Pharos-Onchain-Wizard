import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/database.js";
import { WalletService } from "../src/infrastructure/wallet.js";
import { Rpc } from "../src/infrastructure/rpc.js";
import { Notifications } from "../src/infrastructure/notifications.js";
import { Docs } from "../src/infrastructure/docs.js";
import { unwrap } from "../src/infrastructure/mcp.js";
import { configFromEnv } from "../src/config.js";
import { Runner } from "../src/runner.js";
import { Scheduler } from "../src/scheduler.js";
import { createApp } from "../src/app.js";
import { catalog } from "../../shared/catalog.js";
import { context, A, B, transaction, gas } from "./helpers.js";
test("Configuration rejects invalid network, non-HTTPS remote endpoints and invalid timeout", () => {
  assert.throws(() => configFromEnv({ PHAROS_NETWORK: "unknown" }));
  assert.throws(() => configFromEnv({ PHAROS_RPC_URL: "http://example.com" }));
  assert.throws(() => configFromEnv({ REQUEST_TIMEOUT_MS: "x" }));
  assert.equal(configFromEnv({}).network.chainId, 1672);
});
test("SQLite state, event dedup and interrupted runs survive restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "faros-test-"));
  try {
    let store = new Store(join(dir, "test.sqlite"));
    store.set("trend", { history: [1, 2, 3] });
    assert.equal(store.event("id", "event", { value: 1 }), true);
    assert.equal(store.event("id", "event", { value: 1 }), false);
    store.db
      .prepare(
        "INSERT INTO executions(id,module,status,started,input) VALUES (?,?,?,?,?)",
      )
      .run("run", "trend", "running", new Date().toISOString(), "{}");
    store.close();
    store = new Store(join(dir, "test.sqlite"));
    assert.deepEqual(store.get("trend").history, [1, 2, 3]);
    assert.equal(store.history()[0].status, "interrupted");
    assert.equal(store.events("event").length, 1);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("SQLite transactions roll back failed cursor/event changes", () => {
  const store = new Store(":memory:");
  try {
    assert.throws(() =>
      store.atomic(() => {
        store.event("a", "event", {});
        store.set("cursor", 4);
        throw new Error("crash");
      }),
    );
    assert.equal(store.get("cursor"), null);
    assert.equal(store.events("event").length, 0);
  } finally {
    store.close();
  }
});
test("MCP preserves errors and parses actual text JSON envelopes", () => {
  assert.deepEqual(
    unwrap({ content: [{ type: "text", text: '{"result":"0x01"}' }] }),
    { result: "0x01" },
  );
  assert.throws(() =>
    unwrap({ isError: true, content: [{ type: "text", text: "failure" }] }),
  );
});
test("Docs MCP no-source response is a no-answer, not success", async () => {
  const docs = new Docs(
    { docsTool: "search", docsQueryKey: "question" },
    {
      call: async (name, args) => {
        assert.equal(name, "search");
        assert.equal(args.question, "hello");
        return "No references";
      },
    },
  );
  assert.equal((await docs.search("hello", "mcp")).found, false);
});
test("RPC method allowlist rejects writes before networking; wrong chain fails", async () => {
  const rpc = new Rpc(configFromEnv({}));
  await assert.rejects(rpc.request("eth_sendRawTransaction", []), /read-only/);
  rpc.request = async () => "0x1";
  await assert.rejects(rpc.verify(), /Expected 1672/);
});
test("Wallet simulation preserves revert reason and blocks prepare", async () => {
  const ctx = context();
  try {
    ctx.rpc.request = async (method) => {
      if (method === "eth_getBalance") return "0x100000";
      throw Object.assign(new Error("execution reverted: policy"), {
        code: "RPC_ERROR",
      });
    };
    const service = new WalletService(ctx);
    assert.match((await service.simulate(transaction)).reason, /policy/);
    await assert.rejects(service.prepare(transaction, "key"), /policy/);
  } finally {
    ctx.store.close();
  }
});
test("Wallet reserves gas margin, deduplicates, locks uncertain submission, verifies matching receipt", async () => {
  const ctx = context();
  try {
    const hash = "0x" + "a".repeat(64);
    let receipt = null;
    ctx.rpc.request = async (method) =>
      ({
        eth_getBalance: "0xffffffffff",
        eth_call: "0x",
        eth_estimateGas: "0x5208",
        eth_gasPrice: "0x1",
        eth_getTransactionByHash: { ...transaction, input: transaction.data },
        eth_getTransactionReceipt: receipt,
        eth_blockNumber: "0x64",
      })[method];
    const service = new WalletService(ctx);
    const intent = await service.prepare(transaction, "same-key");
    assert.equal(intent.simulation.gasLimit, "25200");
    assert.equal(
      (await service.prepare(transaction, "same-key")).id,
      intent.id,
    );
    await service.claim(intent.id);
    await assert.rejects(service.claim(intent.id), /available/);
    await service.submitted(intent.id, hash);
    assert.equal((await service.reconcile(intent.id)).status, "submitted");
    receipt = { status: "0x1", blockNumber: "0x62" };
    assert.equal((await service.reconcile(intent.id)).status, "confirmed");
  } finally {
    ctx.store.close();
  }
});
test("Wallet mismatched submitted transaction never confirms", async () => {
  const ctx = context();
  try {
    ctx.store.set("intent:test", {
      id: "test",
      status: "awaiting-wallet",
      transaction,
    });
    ctx.rpc.request = async () => ({ ...transaction, from: B, input: "0x" });
    await assert.rejects(
      new WalletService(ctx).submitted("test", "0x" + "a".repeat(64)),
      /does not match/,
    );
  } finally {
    ctx.store.close();
  }
});
test("Notification missing channel does not claim delivery; duplicate console events suppressed", async () => {
  const ctx = context();
  try {
    const service = new Notifications(ctx.config, ctx.store);
    await assert.rejects(
      service.send("id", "discord", { message: "test" }),
      /Configure/,
    );
    assert.equal(await ctx.store.get("notification:id"), null);
    await service.send("c", "console", {
      message: "unit-test notification fixture",
    });
    assert.equal(
      (await service.send("c", "console", { message: "same" })).duplicate,
      true,
    );
  } finally {
    ctx.store.close();
  }
});
test("Runner enforces idempotency, persists failures, and rejects key reuse with different input", async () => {
  const ctx = context();
  try {
    const runner = new Runner(ctx);
    const first = await runner.run(
      "doc-search",
      { question: "hello", source: "mcp" },
      "same",
    );
    assert.equal(
      (
        await runner.run(
          "doc-search",
          { question: "hello", source: "mcp" },
          "same",
        )
      ).id,
      first.id,
    );
    await assert.rejects(
      runner.run("doc-search", { question: "other", source: "mcp" }, "same"),
    );
    ctx.docs.search = async () => {
      throw new Error("offline");
    };
    assert.equal(
      (
        await runner.run(
          "doc-search",
          { question: "test", source: "mcp" },
          "new",
        )
      ).status,
      "failed",
    );
    assert.equal(ctx.store.history().length, 2);
  } finally {
    ctx.store.close();
  }
});
test("Scheduler persists jobs, pauses, and executes due jobs without overlaps", async () => {
  const ctx = context();
  try {
    let count = 0;
    const scheduler = new Scheduler(ctx, {
      run: async () => {
        count++;
        return { status: "succeeded" };
      },
    });
    const job = await scheduler.add(
      "trend",
      { watchId: "t", source: gas, direction: "up", observations: 3 },
      15000,
    );
    await scheduler.tick();
    assert.equal(count, 1);
    scheduler.toggle(job.id, false);
    ctx.store.db.prepare("UPDATE jobs SET next_run=0").run();
    await scheduler.tick();
    assert.equal(count, 1);
    await assert.rejects(scheduler.add("doc-search", {}, 15000));
  } finally {
    ctx.store.close();
  }
});
test("HTTP integration: bootstrap, all 17 validation routes, CSRF and honest docs failure", async () => {
  const ctx = context();
  ctx.config.port = 0;
  ctx.config.network.name = "Test fixture";
  ctx.config.network.rpc = "https://rpc.pharos.xyz";
  ctx.config.chainMcp = { url: "https://mcp.pharos.xyz/mcp" };
  ctx.config.docsMcp = {};
  ctx.docs.search = async () => {
    throw Object.assign(new Error("Docs unavailable"), {
      code: "NOT_CONFIGURED",
    });
  };
  const { app } = createApp(ctx);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const boot = await (await fetch(base + "/api/bootstrap")).json();
    assert.equal(boot.modules.length, 17);
    assert.equal(
      (
        await fetch(base + "/api/run/doc-search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).status,
      403,
    );
    for (const module of catalog) {
      const response = await fetch(base + "/api/run/" + module.id, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pharos-token": boot.csrf,
        },
        body: "{}",
      });
      assert.equal(response.status, 400, module.id);
    }
    const failure = await fetch(base + "/api/run/doc-search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pharos-token": boot.csrf,
      },
      body: JSON.stringify({ question: "How to connect?", source: "mcp" }),
    });
    assert.equal(failure.status, 422);
    assert.equal((await failure.json()).status, "failed");
  } finally {
    await new Promise((r) => server.close(r));
    ctx.store.close();
  }
});
