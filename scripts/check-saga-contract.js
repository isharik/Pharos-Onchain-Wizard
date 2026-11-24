import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import solc from "solc";

const path = resolve("contracts/SagaDemo.sol");
const input = {
  language: "Solidity",
  sources: { "SagaDemo.sol": { content: readFileSync(path, "utf8") } },
  settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter((item) => item.severity === "error");
if (errors.length) {
  for (const error of errors) process.stderr.write(`${error.formattedMessage}\n`);
  process.exitCode = 1;
} else {
  const contract = output.contracts["SagaDemo.sol"].SagaDemo;
  if (!contract?.evm?.bytecode?.object) throw new Error("SagaDemo bytecode missing");
  process.stdout.write(`SagaDemo compiled with ${solc.version()} (${contract.abi.length} ABI entries).\n`);
}
