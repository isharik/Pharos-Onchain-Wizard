import { resolve } from "node:path";
export const networks = {
  mainnet: {
    name: "Pharos Mainnet",
    chainId: 1672,
    rpc: "https://rpc.pharos.xyz",
    symbol: "PROS",
    explorer: "https://www.pharosscan.xyz",
  },
  "atlantic-testnet": {
    name: "Pharos Atlantic",
    chainId: 688689,
    rpc: "https://atlantic.dplabs-internal.com",
    symbol: "PHRS",
    explorer: "https://atlantic.pharosscan.xyz",
  },
};
export function configFromEnv(env = process.env) {
  const network = networks[env.PHAROS_NETWORK || "mainnet"];
  if (!network)
    throw new Error("PHAROS_NETWORK must be mainnet or atlantic-testnet");
  const timeout = Number(env.REQUEST_TIMEOUT_MS || 15000);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000)
    throw new Error("Invalid request timeout");
  const rpc = env.PHAROS_RPC_URL || network.rpc;
  const host = env.HOST || "127.0.0.1";
  const publicOrigin = env.PUBLIC_ORIGIN;
  const corsOrigin = env.CORS_ORIGIN;
  const allowPublicAccess = env.ALLOW_PUBLIC_ACCESS === "true";
  if (
    publicOrigin &&
    (!publicOrigin.startsWith("https://") ||
      new URL(publicOrigin).origin !== publicOrigin)
  )
    throw new Error(
      "PUBLIC_ORIGIN must be an HTTPS origin without a trailing slash",
    );
  if ((publicOrigin || !["127.0.0.1", "localhost"].includes(host)) && !env.ADMIN_PASSWORD_HASH && !allowPublicAccess)
    throw new Error("Public access requires ADMIN_PASSWORD_HASH");
  if (corsOrigin && (!corsOrigin.startsWith("https://") || new URL(corsOrigin).origin !== corsOrigin))
    throw new Error("CORS_ORIGIN must be an HTTPS origin without a trailing slash");
  if (!["127.0.0.1", "localhost"].includes(host) && !publicOrigin)
    throw new Error(
      "Public binding requires PUBLIC_ORIGIN and a TLS reverse proxy",
    );
  if (
    env.ADMIN_PASSWORD_HASH &&
    !/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(env.ADMIN_PASSWORD_HASH)
  )
    throw new Error("Invalid ADMIN_PASSWORD_HASH format");
  const chainId = Number(env.PHAROS_CHAIN_ID || network.chainId);
  if (!Number.isSafeInteger(chainId) || chainId <= 0)
    throw new Error("Invalid chain ID");
  for (const value of [rpc, env.CHAIN_MCP_URL, env.DOCS_MCP_URL].filter(
    Boolean,
  )) {
    const u = new URL(value);
    if (
      u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname)
      )
    )
      throw new Error("Endpoints require HTTPS or loopback HTTP");
  }
  return {
    network: { ...network, rpc, chainId },
    host,
    publicOrigin,
    corsOrigin,
    allowPublicAccess,
    adminHash: env.ADMIN_PASSWORD_HASH,
    adminUser: env.ADMIN_USERNAME || "admin",
    timeout,
    port: Number(env.PORT || 4317),
    dataDir: resolve(env.DATA_DIR || "data"),
    chainMcp: {
      url: env.CHAIN_MCP_URL || "https://mcp.pharos.xyz/mcp",
      token: env.CHAIN_MCP_TOKEN,
    },
    docsMcp: { url: env.DOCS_MCP_URL, token: env.DOCS_MCP_TOKEN },
    docsTool: env.DOCS_SEARCH_TOOL,
    docsQueryKey: env.DOCS_QUERY_KEY || "query",
    docsIndex: env.DOCS_INDEX_URL || "https://www.pharos.xyz/llms.txt",
    docsMode: env.DOCS_MODE || "index",
    skillDir: env.SKILL_ENGINE_DIR || resolve("vendor/pharos-skill-engine"),
    castBin:
      env.CAST_BIN ||
      (process.platform === "win32"
        ? resolve("node_modules/@foundry-rs/cast-win32-amd64/bin/cast.exe")
        : "cast"),
    discord: env.DISCORD_WEBHOOK_URL,
    telegramToken: env.TELEGRAM_BOT_TOKEN,
    telegramChat: env.TELEGRAM_CHAT_ID,
  };
}
