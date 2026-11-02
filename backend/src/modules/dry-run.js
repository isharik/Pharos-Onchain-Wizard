import { z } from "zod";
import { transaction } from "../validation.js";
export const schema = z.object({ transaction });
export async function execute(ctx, input) {
  const result = await ctx.wallet.simulate(input.transaction);
  if (result.success)
    result.intent = await ctx.wallet.prepare(
      input.transaction,
      `dry:${ctx.runId}`,
    );
  return result;
}
