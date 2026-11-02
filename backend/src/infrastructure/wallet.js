import { randomUUID } from "node:crypto";
import {
  Interface,
  parseUnits,
  toQuantity,
  hexlify,
  toUtf8Bytes,
} from "ethers";
import { AppError, requireThat } from "../errors.js";
import { transaction as txSchema } from "../validation.js";
const erc20 = new Interface([
  "function decimals() view returns(uint8)",
  "function balanceOf(address) view returns(uint256)",
  "function transfer(address,uint256) returns(bool)",
]);
export class WalletService {
  constructor(ctx) {
    this.ctx = ctx;
  }
  async simulate(input) {
    const transaction = txSchema.parse(input);
    const { rpc } = this.ctx;
    const block = await rpc.block();
    const before = await rpc.request("eth_getBalance", [
      transaction.from,
      block,
    ]);
    try {
      const returned = await rpc.request("eth_call", [transaction, block]);
      const gas = await rpc.request("eth_estimateGas", [transaction, block]);
      const price = await rpc.request("eth_gasPrice");
      const gasLimit = (BigInt(gas) * 120n + 99n) / 100n;
      const cost = gasLimit * BigInt(price);
      const enough = BigInt(before) >= BigInt(transaction.value) + cost;
      return {
        success: enough,
        block,
        returned,
        gas: BigInt(gas).toString(),
        gasLimit: gasLimit.toString(),
        gasPriceWei: BigInt(price).toString(),
        gasCostWei: cost.toString(),
        reason: enough
          ? null
          : "Insufficient native balance for value and gas with 20% limit margin",
        beforeBalanceWei: BigInt(before).toString(),
        predictedAfterBalanceWei: enough
          ? (BigInt(before) - BigInt(transaction.value) - cost).toString()
          : null,
        expectedOutcome:
          transaction.data === "0x"
            ? "Native value transfer less conservative gas cost"
            : "Call return data shown; arbitrary contract state changes require trace/state-diff support and are not inferred.",
        transaction,
      };
    } catch (e) {
      if (e.code !== "RPC_ERROR") throw e;
      return {
        success: false,
        block,
        reason: e.message,
        transaction,
        beforeBalanceWei: BigInt(before).toString(),
        expectedOutcome: "Execution blocked; no transaction broadcast.",
      };
    }
  }
  async prepare(transaction, key, metadata = {}) {
    const old = this.ctx.store.get(`intent-key:${key}`);
    if (old) return this.ctx.store.get(`intent:${old}`);
    const simulation = await this.simulate(transaction);
    if (!simulation.success)
      throw new AppError(
        "SIMULATION_FAILED",
        simulation.reason || "Transaction simulation failed",
        422,
      );
    const intent = {
      id: randomUUID(),
      key,
      transaction: simulation.transaction,
      chainId: this.ctx.config.network.chainId,
      status: "prepared",
      created: new Date().toISOString(),
      simulation,
      metadata,
    };
    this.ctx.store.atomic(() => {
      this.ctx.store.set(`intent:${intent.id}`, intent);
      this.ctx.store.set(`intent-key:${key}`, intent.id);
    });
    return intent;
  }
  async claim(id) {
    const intent = this.ctx.store.get(`intent:${id}`);
    requireThat(
      intent && intent.status === "prepared",
      "Transaction is not available for signing",
      "INTENT_LOCKED",
    );
    const fresh = await this.simulate(intent.transaction);
    requireThat(
      fresh.success,
      "Fresh simulation failed; signing blocked",
      "SIMULATION_FAILED",
    );
    intent.status = "awaiting-wallet";
    intent.simulation = fresh;
    return this.ctx.store.set(`intent:${id}`, intent);
  }
  reject(id) {
    const intent = this.ctx.store.get(`intent:${id}`);
    requireThat(
      intent?.status === "awaiting-wallet",
      "Intent is not awaiting the wallet",
    );
    // Only an explicit wallet rejection (4001) may unlock; ambiguous errors remain locked.
    intent.status = "prepared";
    return this.ctx.store.set(`intent:${id}`, intent);
  }
  async submitted(id, hash) {
    requireThat(/^0x[0-9a-fA-F]{64}$/.test(hash), "Invalid transaction hash");
    const intent = this.ctx.store.get(`intent:${id}`);
    requireThat(
      intent && ["awaiting-wallet", "submitted"].includes(intent.status),
      "Intent is not awaiting submission",
    );
    requireThat(
      !intent.hash || intent.hash === hash,
      "Intent already has a different transaction hash",
    );
    await this.ctx.rpc.verify();
    const tx = await this.ctx.rpc.request("eth_getTransactionByHash", [hash]);
    requireThat(
      tx,
      "Transaction not found yet. Retry recording this same hash; do not sign again.",
      "TX_NOT_FOUND",
    );
    requireThat(
      tx.from.toLowerCase() === intent.transaction.from.toLowerCase() &&
        tx.to?.toLowerCase() === intent.transaction.to.toLowerCase() &&
        BigInt(tx.value) === BigInt(intent.transaction.value) &&
        tx.input.toLowerCase() === intent.transaction.data.toLowerCase(),
      "Submitted transaction does not match the prepared intent",
      "TX_MISMATCH",
    );
    intent.hash = hash;
    intent.status = "submitted";
    return this.ctx.store.set(`intent:${id}`, intent);
  }
  async reconcile(id) {
    const intent = this.ctx.store.get(`intent:${id}`);
    requireThat(intent, "Unknown transaction intent");
    if (intent.status !== "submitted") return intent;
    await this.ctx.rpc.verify();
    const receipt = await this.ctx.rpc.request("eth_getTransactionReceipt", [
      intent.hash,
    ]);
    if (!receipt) return intent;
    const head = BigInt(await this.ctx.rpc.request("eth_blockNumber"));
    if (head - BigInt(receipt.blockNumber) < 2n)
      return {
        ...intent,
        confirmations: Number(head - BigInt(receipt.blockNumber) + 1n),
      };
    intent.status = BigInt(receipt.status) === 1n ? "confirmed" : "failed";
    intent.receipt = receipt;
    return this.ctx.store.set(`intent:${id}`, intent);
  }
  async payment({ from, recipient, amount, token, reference }) {
    await this.ctx.rpc.verify();
    if (token === "native")
      return {
        from,
        to: recipient,
        value: toQuantity(parseUnits(amount, 18)),
        data: reference ? hexlify(toUtf8Bytes(reference)) : "0x",
      };
    const decimals = Number(
      erc20.decodeFunctionResult(
        "decimals",
        await this.ctx.rpc.request("eth_call", [
          { to: token, data: erc20.encodeFunctionData("decimals") },
          "latest",
        ]),
      )[0],
    );
    requireThat(decimals <= 36, "Unsupported token decimals");
    const quantity = parseUnits(amount, decimals);
    const balance = erc20.decodeFunctionResult(
      "balanceOf",
      await this.ctx.rpc.request("eth_call", [
        { to: token, data: erc20.encodeFunctionData("balanceOf", [from]) },
        "latest",
      ]),
    )[0];
    requireThat(
      balance >= quantity,
      "Insufficient token balance",
      "INSUFFICIENT_BALANCE",
    );
    // ABI decoders accept trailing data; a non-standard token that rejects it fails simulation.
    return {
      from,
      to: token,
      value: "0x0",
      data:
        erc20.encodeFunctionData("transfer", [recipient, quantity]) +
        (reference ? hexlify(toUtf8Bytes(reference)).slice(2) : ""),
    };
  }
}
