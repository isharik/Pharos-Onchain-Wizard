import { Store } from "../src/database.js";
import { Interface, toQuantity } from "ethers";
export const A = "0x1111111111111111111111111111111111111111";
export const B = "0x2222222222222222222222222222222222222222";
export const C = "0x3333333333333333333333333333333333333333";
export const D = "0x4444444444444444444444444444444444444444";
export const E = "0x5555555555555555555555555555555555555555";
export const transaction = { from: A, to: B, value: "0x0", data: "0x" };
export const gas = {
  kind: "gas",
  transport: "rpc",
  decimals: 0,
  args: [],
  index: 0,
};
export const balance = {
  kind: "balance",
  transport: "rpc",
  address: A,
  decimals: 0,
  args: [],
  index: 0,
};
export const block = {
  kind: "block",
  transport: "rpc",
  decimals: 0,
  args: [],
  index: 0,
};
export const contract = {
  kind: "contract",
  transport: "rpc",
  address: A,
  abi: ["function value() view returns(uint256)"],
  function: "value",
  args: [],
  index: 0,
  decimals: 0,
};
export function context() {
  const store = new Store(":memory:");
  return {
    store,
    runId: "test-run",
    config: {
      network: { chainId: 1672, explorer: "https://www.pharosscan.xyz" },
      timeout: 1000,
    },
    rpc: {
      verify: async () => 1672,
      block: async () => "0x64",
      request: async (method) =>
        ({
          eth_gasPrice: "0xa",
          eth_getBalance: "0x64",
          eth_blockNumber: "0x64",
          eth_estimateGas: "0x5208",
          eth_getLogs: [],
          eth_call: new Interface(contract.abi).encodeFunctionResult("value", [
            100n,
          ]),
        })[method],
    },
    chain: {
      call: async (name) =>
        name === "get_gas_price" ? { gasPriceWei: "10" } : [],
    },
    verifyChainMcp: async () => ({ chainId: 1672 }),
    skill: { inspect: async () => ({ name: "official-package-test-double" }) },
    docs: {
      search: async () => ({
        found: true,
        answer: "Sourced test fixture",
        sources: ["https://docs.pharos.xyz/"],
        transport: "mcp",
      }),
    },
    notifications: { send: async () => ({ status: "delivered" }) },
    wallet: {
      prepare: async (tx, key) => ({
        id: key,
        status: "prepared",
        transaction: tx,
      }),
      reconcile: async (id) => ({
        id,
        status: "confirmed",
        hash: "0x" + "a".repeat(64),
      }),
      simulate: async () => ({ success: true }),
      payment: async () => transaction,
    },
  };
}
