import express from "express";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { catalog } from "../../shared/catalog.js";
import { Runner } from "./runner.js";
import { Scheduler } from "./scheduler.js";
import { AppError, safeError } from "./errors.js";
import { evaluate } from "./modules/policy.js";
import { authentication } from "./auth.js";
export function createApp(ctx) {
  const app = express();
  const runner = new Runner(ctx),
    scheduler = new Scheduler(ctx, runner);
  const csrf = randomBytes(32).toString("hex");
  app.disable("x-powered-by");
  app.use(express.json({ limit: "128kb" }));
  authentication(app, ctx);
  app.use((req, res, next) => {
    const host = req.headers.host?.split(":")[0];
    const acceptedOrigins = [
      "http://localhost:" + ctx.config.port,
      "http://127.0.0.1:" + ctx.config.port,
      ctx.config.publicOrigin,
      ctx.config.corsOrigin,
    ].filter(Boolean);
    const sameVercelOrigin = (() => {
      if (!ctx.config.vercel || !req.headers.origin) return false;
      try {
        return new URL(req.headers.origin).host === req.headers.host;
      } catch {
        return false;
      }
    })();
    if (
      !ctx.config.vercel &&
      ![
        "localhost",
        "127.0.0.1",
        ...(ctx.config.publicOrigin
          ? [new URL(ctx.config.publicOrigin).hostname]
          : []),
      ].includes(host)
    )
      return res
        .status(403)
        .json({
          error: { message: "Host is not configured for this workspace" },
        });
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    if (
      req.headers.origin &&
      !acceptedOrigins.includes(req.headers.origin) &&
      !sameVercelOrigin
    )
      return res.status(403).json({ error: { message: "Origin not allowed" } });
    if (req.headers.origin && acceptedOrigins.includes(req.headers.origin)) {
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Pharos-Token");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    if (req.method === "OPTIONS") return res.status(204).end();
    if (
      !ctx.config.vercel &&
      req.method !== "GET" &&
      req.headers["x-pharos-token"] !== csrf
    )
      return res
        .status(403)
        .json({ error: { message: "Missing local session token" } });
    next();
  });
  let healthCache = null,
    healthTime = 0,
    healthPending;
  async function health() {
    if (healthCache && Date.now() - healthTime < 30000) return healthCache;
    if (healthPending) return healthPending;
    healthPending = (async () => {
      const check = async (fn) => {
        try {
          return { status: "connected", details: await fn() };
        } catch (e) {
          return {
            status:
              e.code === "NOT_CONFIGURED" ? "not configured" : "unavailable",
            error: safeError(e),
          };
        }
      };
      const results = await Promise.all([
        check(async () => ({
          chainId: await ctx.rpc.verify(),
          block: BigInt(await ctx.rpc.request("eth_blockNumber")).toString(),
        })),
        check(async () => {
          const info = await ctx.verifyChainMcp();
          return {
            info,
            tools: (await ctx.chain.connect()).map((t) => ({
              name: t.name,
              inputSchema: t.inputSchema,
            })),
          };
        }),
        check(async () =>
          ctx.config.docsMode === "index"
            ? {
                transport: "HTTPS llms.txt (team-confirmed Dev Docs interface)",
                url: ctx.config.docsIndex,
                pages: (await ctx.docs.index()).length,
              }
            : {
                tools: (await ctx.docsMcp.connect()).map((t) => ({
                  name: t.name,
                  inputSchema: t.inputSchema,
                })),
              },
        ),
        check(() => ctx.skill.inspect()),
      ]);
      healthCache = {
        rpc: results[0],
        chain: results[1],
        docs: results[2],
        skill: results[3],
        checkedAt: new Date().toISOString(),
      };
      healthTime = Date.now();
      return healthCache;
    })();
    try {
      return await healthPending;
    } finally {
      healthPending = null;
    }
  }
  app.get("/api/bootstrap", (req, res) =>
    res.json({
      csrf,
      modules: catalog,
      network: { ...ctx.config.network, rpc: undefined },
      logo: existsSync(
        fileURLToPath(new URL("../../assets/pharos-logo.jpg", import.meta.url)),
      ),
      configuration: {
        rpcHost: new URL(ctx.config.network.rpc).host,
        chainMcpConfigured: !!ctx.config.chainMcp.url,
        docsMode: ctx.config.docsMode,
        docsMcpConfigured: !!ctx.config.docsMcp.url,
        skillConfigured: !!ctx.config.skillDir,
        channelConfigured: !!(ctx.config.discord || ctx.config.telegramToken),
        docsIndex: ctx.config.docsIndex,
      },
    }),
  );
  app.get("/api/health", async (req, res) => res.json(await health()));
  app.get("/api/history", (req, res) => res.json(ctx.store.history()));
  app.get("/api/events", (req, res) =>
    res.json(ctx.store.events(req.query.kind || "chain-event")),
  );
  app.get("/api/jobs", (req, res) =>
    res.json(
      scheduler.list().map((j) => ({ ...j, input: JSON.parse(j.input) })),
    ),
  );
  app.post("/api/jobs", async (req, res) =>
    res
      .status(201)
      .json(
        await scheduler.add(
          req.body.module,
          req.body.input,
          req.body.intervalMs,
        ),
      ),
  );
  app.post("/api/jobs/:id", async (req, res) => {
    if (typeof req.body.enabled !== "boolean")
      throw new AppError("INVALID_INPUT", "enabled must be boolean");
    scheduler.toggle(req.params.id, req.body.enabled);
    res.json({ ok: true });
  });
  app.post("/api/run/:module", async (req, res) => {
    const key = req.headers["idempotency-key"];
    if (key && !/^[\w:-]{1,200}$/.test(key))
      throw new AppError("INVALID_INPUT", "Invalid request key");
    const result = await runner.run(req.params.module, req.body, key);
    res.status(result.status === "failed" ? 422 : 200).json(result);
  });
  const walletLocks = new Set();
  app.post("/api/intents/:id/:operation", async (req, res) => {
    const { id, operation } = req.params;
    if (walletLocks.has(id))
      throw new AppError("BUSY", "Wallet operation in progress", 409);
    walletLocks.add(id);
    try {
      if (operation === "claim") {
        const intent = ctx.store.get(`intent:${id}`);
        if (
          intent?.metadata?.policy &&
          evaluate({
            policy: intent.metadata.policy,
            transaction: intent.transaction,
          }).decision !== "allow"
        )
          throw new AppError(
            "POLICY_DENIED",
            "Policy no longer allows this action",
            403,
          );
        return res.json(await ctx.wallet.claim(id));
      }
      if (operation === "rejected") {
        if (req.body.code !== 4001)
          throw new AppError(
            "INVALID_INPUT",
            "Only explicit wallet rejection unlocks the intent",
          );
        return res.json(ctx.wallet.reject(id));
      }
      if (operation === "submitted")
        return res.json(await ctx.wallet.submitted(id, req.body.hash));
      if (operation === "reconcile")
        return res.json(await ctx.wallet.reconcile(id));
      throw new AppError("NOT_FOUND", "Unknown wallet operation", 404);
    } finally {
      walletLocks.delete(id);
    }
  });
  app.use("/api", (req, res) =>
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "API route not found" } }),
  );
  app.use(
    "/assets",
    express.static(fileURLToPath(new URL("../../assets/", import.meta.url))),
  );
  const dist = fileURLToPath(new URL("../../dist/", import.meta.url));
  app.use(express.static(dist));
  app.get("/{*path}", (req, res) => res.sendFile("index.html", { root: dist }));
  app.use((err, req, res, next) => {
    const validation = err.name === "ZodError" || err instanceof SyntaxError;
    res
      .status(validation ? 400 : err.status || 500)
      .json({
        error: validation
          ? { code: "INVALID_INPUT", message: err.message.slice(0, 2000) }
          : safeError(err),
      });
  });
  return { app, runner, scheduler };
}
