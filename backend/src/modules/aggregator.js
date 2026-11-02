import { z } from "zod";
import { Interface, parseUnits, formatUnits } from "ethers";
import { address, positive } from "../validation.js";
import { requireThat, safeError } from "../errors.js";
const vaultAbi = new Interface([
  "function asset() view returns(address)",
  "function balanceOf(address) view returns(uint256)",
  "function convertToAssets(uint256) view returns(uint256)",
  "function previewDeposit(uint256) view returns(uint256)",
  "function previewWithdraw(uint256) view returns(uint256)",
  "function maxDeposit(address) view returns(uint256)",
  "function maxWithdraw(address) view returns(uint256)",
  "function deposit(uint256,address) returns(uint256)",
  "function withdraw(uint256,address,address) returns(uint256)",
]);
const tokenAbi = new Interface([
  "function decimals() view returns(uint8)",
  "function allowance(address,address) view returns(uint256)",
  "function approve(address,uint256) returns(bool)",
]);
export const schema = z.object({
  vaults: z
    .array(z.object({ name: z.string().min(1).max(80), address }))
    .min(2)
    .max(12),
  owner: address,
  action: z.enum(["query", "deposit", "withdraw"]),
  amount: positive,
});
export async function execute(ctx, input) {
  requireThat(
    new Set(input.vaults.map((v) => v.address.toLowerCase())).size >= 2,
    "At least two different vaults required",
  );
  const block = await ctx.rpc.block();
  const read = async (to, abi, name, args = []) =>
    abi.decodeFunctionResult(
      name,
      await ctx.rpc.request("eth_call", [
        { to, data: abi.encodeFunctionData(name, args) },
        block,
      ]),
    )[0];
  const venues = [];
  for (const vault of input.vaults) {
    try {
      const asset = await read(vault.address, vaultAbi, "asset");
      const decimals = Number(await read(asset, tokenAbi, "decimals"));
      requireThat(decimals <= 36, "Unsupported asset decimals");
      const amount = parseUnits(input.amount, decimals);
      const shares = await read(vault.address, vaultAbi, "balanceOf", [
        input.owner,
      ]);
      const assets = await read(vault.address, vaultAbi, "convertToAssets", [
        shares,
      ]);
      const preview = await read(
        vault.address,
        vaultAbi,
        input.action === "withdraw" ? "previewWithdraw" : "previewDeposit",
        [amount],
      );
      const comparable = await read(
        vault.address,
        vaultAbi,
        "convertToAssets",
        [preview],
      );
      const limit = await read(
        vault.address,
        vaultAbi,
        input.action === "withdraw" ? "maxWithdraw" : "maxDeposit",
        [input.owner],
      );
      venues.push({
        ...vault,
        available: true,
        asset,
        decimals,
        assets: formatUnits(assets, decimals),
        shares: shares.toString(),
        previewShares: preview.toString(),
        assetEquivalent: comparable.toString(),
        amount: amount.toString(),
        capacity: limit.toString(),
      });
    } catch (e) {
      venues.push({ ...vault, available: false, error: safeError(e) });
    }
  }
  const healthy = venues.filter((v) => v.available);
  requireThat(healthy.length > 0, "All protocols are unavailable", "NO_VENUE");
  requireThat(
    new Set(healthy.map((v) => v.asset.toLowerCase())).size === 1,
    "Vaults have different underlying assets; cannot compare their units",
  );
  const eligible = healthy.filter(
    (v) => input.action === "query" || BigInt(v.capacity) >= BigInt(v.amount),
  );
  requireThat(eligible.length > 0, "No venue has enough capacity");
  eligible.sort((a, b) => {
    const x = BigInt(a.assetEquivalent),
      y = BigInt(b.assetEquivalent);
    return x === y ? 0 : (input.action === "withdraw" ? x < y : x > y) ? -1 : 1;
  });
  const best = eligible[0];
  const result = {
    block,
    venues,
    selected: best.name,
    reason:
      input.action === "withdraw"
        ? "Lowest asset-equivalent share burn among available vaults with sufficient withdrawal capacity"
        : "Highest asset-equivalent deposit preview among available vaults with sufficient capacity",
    rateMeaning:
      "Current preview conversion, not forecast APR. Ties retain configured order.",
  };
  if (input.action !== "query") {
    const amount = BigInt(best.amount);
    let transaction;
    if (input.action === "deposit") {
      const allowance = await read(best.asset, tokenAbi, "allowance", [
        input.owner,
        best.address,
      ]);
      if (allowance < amount) {
        transaction = {
          from: input.owner,
          to: best.asset,
          value: "0x0",
          data: tokenAbi.encodeFunctionData("approve", [best.address, amount]),
        };
        result.nextStep =
          "Approve exact amount; rerun after confirmed receipt to prepare deposit.";
      } else
        transaction = {
          from: input.owner,
          to: best.address,
          value: "0x0",
          data: vaultAbi.encodeFunctionData("deposit", [amount, input.owner]),
        };
    } else
      transaction = {
        from: input.owner,
        to: best.address,
        value: "0x0",
        data: vaultAbi.encodeFunctionData("withdraw", [
          amount,
          input.owner,
          input.owner,
        ]),
      };
    result.intent = await ctx.wallet.prepare(
      transaction,
      `aggregator:${ctx.runId}`,
    );
  }
  return result;
}
