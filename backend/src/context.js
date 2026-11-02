import { join } from "node:path";
import { Store } from "./database.js";
import { Rpc } from "./infrastructure/rpc.js";
import { McpConnection } from "./infrastructure/mcp.js";
import { Docs } from "./infrastructure/docs.js";
import { SkillEngine } from "./infrastructure/skillEngine.js";
import { Notifications } from "./infrastructure/notifications.js";
import { WalletService } from "./infrastructure/wallet.js";
import { AppError } from "./errors.js";
export function createContext(
  config,
  store = new Store(join(config.dataDir, "pharos.sqlite")),
) {
  const ctx = {
    config,
    store,
    rpc: new Rpc(config),
    chain: new McpConnection("Chain MCP", config.chainMcp, config.timeout),
    docsMcp: new McpConnection(
      "Developer Docs MCP",
      config.docsMcp,
      config.timeout,
    ),
    skill: new SkillEngine(config),
  };
  ctx.docs = new Docs(config, ctx.docsMcp);
  ctx.notifications = new Notifications(config, store);
  ctx.wallet = new WalletService(ctx);
  let verifiedAt = 0;
  ctx.verifyChainMcp = async () => {
    if (Date.now() - verifiedAt < 30000) return;
    const info = await ctx.chain.call("get_chain_info", {});
    if (Number(info.chainId) !== config.network.chainId)
      throw new AppError(
        "CHAIN_MISMATCH",
        `Chain MCP is on ${info.chainId}; configured RPC chain is ${config.network.chainId}. Set a matching MCP server.`,
        409,
      );
    verifiedAt = Date.now();
    return info;
  };
  ctx.close = async () => {
    await Promise.allSettled([ctx.chain.close(), ctx.docsMcp.close()]);
    store.close();
  };
  return ctx;
}
