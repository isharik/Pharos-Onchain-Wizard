import { AppError } from "../errors.js";
const METHODS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBalance",
  "eth_call",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_getBlockByNumber",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getLogs",
  "eth_getCode",
  "eth_getTransactionCount",
]);
export class Rpc {
  constructor(config) {
    this.config = config;
    this.id = 0;
  }
  async request(method, params = []) {
    if (!METHODS.has(method))
      throw new AppError("METHOD_DENIED", "RPC method is not read-only");
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(this.config.network.rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
        signal: AbortSignal.timeout(this.config.timeout),
      });
      if (response.status === 429 && attempt < 2) {
        await new Promise((r) =>
          setTimeout(
            r,
            Math.min(
              Number(response.headers.get("retry-after") || 1) * 1000,
              5000,
            ),
          ),
        );
        continue;
      }
      if (!response.ok)
        throw new AppError(
          "RPC_HTTP",
          `RPC returned HTTP ${response.status}`,
          502,
        );
      const body = await response.json();
      if (body.error)
        throw new AppError("RPC_ERROR", body.error.message || "RPC error", 502);
      if (!Object.hasOwn(body, "result"))
        throw new AppError("RPC_RESPONSE", "RPC result missing", 502);
      return body.result;
    }
  }
  async verify() {
    const chainId = Number(BigInt(await this.request("eth_chainId")));
    if (chainId !== this.config.network.chainId)
      throw new AppError(
        "CHAIN_MISMATCH",
        `Expected ${this.config.network.chainId}, got ${chainId}`,
        409,
      );
    return chainId;
  }
  async block() {
    await this.verify();
    return this.request("eth_blockNumber");
  }
}
