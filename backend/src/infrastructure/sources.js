import { Interface, formatUnits, toQuantity } from "ethers";
import Decimal from "decimal.js";
import { AppError, requireThat } from "../errors.js";
export function mcpValue(value, keys) {
  if (typeof value === "string" || typeof value === "number") return value;
  for (const key of keys) if (value?.[key] !== undefined) return value[key];
  throw new AppError(
    "MCP_RESPONSE",
    `Missing MCP field: ${keys.join(" / ")}`,
    502,
  );
}
export async function readSource(ctx, source, block) {
  let raw;
  if (source.transport === "skill") return ctx.skill.read(source, block);
  if (source.transport === "mcp") {
    await ctx.verifyChainMcp();
    if (source.kind === "gas")
      raw = mcpValue(await ctx.chain.call("get_gas_price", {}), [
        "gasPriceWei",
      ]);
    if (source.kind === "balance")
      raw = mcpValue(
        await ctx.chain.call("get_balance", { address: source.address, block }),
        ["balanceWei", "balanceHex"],
      );
    if (source.kind === "block") raw = block;
  } else {
    if (source.kind === "gas") raw = await ctx.rpc.request("eth_gasPrice");
    if (source.kind === "balance")
      raw = await ctx.rpc.request("eth_getBalance", [source.address, block]);
    if (source.kind === "block") raw = block;
  }
  if (source.kind === "contract") {
    const iface = new Interface(source.abi);
    const fragment = iface.getFunction(source.function);
    requireThat(
      fragment && ["view", "pure"].includes(fragment.stateMutability),
      "Source ABI function must be view or pure",
    );
    const transaction = {
      to: source.address,
      data: iface.encodeFunctionData(fragment, source.args),
    };
    const encoded =
      source.transport === "mcp"
        ? mcpValue(await ctx.chain.call("eth_call", { transaction, block }), [
            "result",
            "data",
            "returnData",
          ])
        : await ctx.rpc.request("eth_call", [transaction, block]);
    requireThat(
      encoded !== "0x",
      "Contract returned no data",
      "EMPTY_CHAIN_DATA",
    );
    raw = iface.decodeFunctionResult(fragment, encoded)[source.index];
  }
  requireThat(
    raw !== undefined && raw !== null,
    "Chain observation missing",
    "EMPTY_CHAIN_DATA",
  );
  return {
    value: formatUnits(BigInt(raw), source.decimals),
    raw: String(raw),
    block: String(block),
    transport: source.transport || "rpc",
    source,
  };
}
export function compare(value, operator, threshold) {
  const n = new Decimal(value),
    t = new Decimal(threshold);
  return {
    gt: () => n.gt(t),
    gte: () => n.gte(t),
    lt: () => n.lt(t),
    lte: () => n.lte(t),
    eq: () => n.eq(t),
  }[operator]();
}
export async function observations(ctx, sources) {
  const block = await ctx.rpc.block();
  const values = [];
  for (const s of sources) values.push(await readSource(ctx, s, block));
  return { block, values };
}
export const hexBlock = (n) => toQuantity(BigInt(n));
