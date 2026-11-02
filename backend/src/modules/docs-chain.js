import { z } from "zod";
import { source } from "../validation.js";
import { observations } from "../infrastructure/sources.js";
import { requireThat } from "../errors.js";
export const schema = z.object({
  question: z.string().min(3).max(2000),
  contract: source.refine(
    (s) => s.kind === "contract",
    "Contract source required",
  ),
});
export async function execute(ctx, input) {
  const explanation = await ctx.docs.search(
    `${input.question}\nFunction: ${input.contract.function}\nABI: ${input.contract.abi.join("; ")}`,
    ctx.config.docsMode || "index",
    { functionName: input.contract.function },
  );
  requireThat(
    explanation.found,
    "No sourced explanation found; chain call was not performed",
    "NO_SOURCED_ANSWER",
  );
  const { block, values } = await observations(ctx, [
    { ...input.contract, transport: "mcp" },
  ]);
  return {
    explanation,
    observation: values[0],
    block,
    interpretation: `${input.contract.function} returned ${values[0].raw}; using the supplied ABI output index ${input.contract.index} and ${input.contract.decimals} decimals gives ${values[0].value}. Interpret units using the cited documentation; decimals are operator-supplied.`,
  };
}
