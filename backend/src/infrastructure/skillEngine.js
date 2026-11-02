import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Interface, formatUnits } from "ethers";
import { AppError, requireThat } from "../errors.js";
const exec = promisify(execFile);
// Official SkillEngine is a SKILL.md package backed by Foundry, not a remote execute API.
export class SkillEngine {
  constructor(config) {
    this.config = config;
  }
  async inspect() {
    if (!this.config.skillDir)
      throw new AppError(
        "NOT_CONFIGURED",
        "Set SKILL_ENGINE_DIR to the installed official pharos-skill-engine package",
        503,
      );
    const skill = await readFile(
      join(this.config.skillDir, "SKILL.md"),
      "utf8",
    );
    requireThat(
      skill.includes("pharos-skill-engine"),
      "Configured directory is not the official SkillEngine package",
    );
    const { stdout } = await exec(this.config.castBin, ["--version"], {
      timeout: this.config.timeout,
      windowsHide: true,
    });
    return {
      kind: "installable-skill",
      name: "pharos-skill-engine",
      runtime: stdout.trim(),
    };
  }
  async read(source, block) {
    await this.inspect();
    let args;
    if (source.kind === "gas") args = ["gas-price"];
    if (source.kind === "balance")
      args = ["balance", source.address, "--block", block];
    if (source.kind === "block")
      return {
        value: BigInt(block).toString(),
        raw: BigInt(block).toString(),
        block,
        transport: "skill",
      };
    let iface, fragment;
    if (source.kind === "contract") {
      iface = new Interface(source.abi);
      fragment = iface.getFunction(source.function);
      requireThat(
        ["view", "pure"].includes(fragment.stateMutability),
        "Skill read requires view/pure ABI",
      );
      args = [
        "call",
        source.address,
        "--data",
        iface.encodeFunctionData(fragment, source.args),
        "--block",
        block,
      ];
    }
    args.push("--rpc-url", this.config.network.rpc);
    const { stdout } = await exec(this.config.castBin, args, {
      timeout: this.config.timeout,
      maxBuffer: 1048576,
      windowsHide: true,
    });
    const raw = iface
      ? iface.decodeFunctionResult(fragment, stdout.trim())[source.index]
      : BigInt(stdout.trim());
    return {
      value: formatUnits(raw, source.decimals),
      raw: String(raw),
      block,
      transport: "skill",
      runtime: "Foundry cast",
    };
  }
}
