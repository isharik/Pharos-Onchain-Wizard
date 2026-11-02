import { z } from "zod";
import { identifier, source, operator, decimal } from "../validation.js";
import { observations, compare } from "../infrastructure/sources.js";
export const schema = z.object({
  alertId: identifier,
  source,
  operator,
  threshold: decimal,
  channel: z.enum(["discord", "telegram"]),
});
export async function execute(ctx, input) {
  const { block, values } = await observations(ctx, [input.source]);
  const value = values[0];
  const crossed = compare(value.value, input.operator, input.threshold);
  const key = `alert:${input.alertId}`;
  const previous = ctx.store.get(key);
  const result = {
    block,
    observation: value,
    matched: crossed,
    delivery: null,
  };
  if (crossed && !previous?.matched)
    result.delivery = await ctx.notifications.send(
      `${key}:${block}`,
      input.channel,
      {
        message: `${input.alertId}: ${value.value} ${input.operator} ${input.threshold}`,
        link: `${ctx.config.network.explorer}/block/${BigInt(block)}`,
      },
    );
  ctx.store.set(key, { matched: crossed, block });
  return result;
}
