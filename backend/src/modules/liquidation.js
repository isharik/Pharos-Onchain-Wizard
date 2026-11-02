import { z } from "zod";
import Decimal from "decimal.js";
import { identifier, source, positive, channel } from "../validation.js";
import { observations } from "../infrastructure/sources.js";
import { requireThat } from "../errors.js";
export const schema = z.object({
  positionId: identifier,
  collateral: source,
  debt: source,
  health: source,
  warning: positive,
  critical: positive,
  target: positive,
  channel,
});
export async function execute(ctx, input) {
  requireThat(
    new Decimal(input.critical).lt(input.warning) &&
      new Decimal(input.warning).lt(input.target),
    "Require critical < warning < target",
  );
  const { block, values } = await observations(ctx, [
    input.collateral,
    input.debt,
    input.health,
  ]);
  const [collateral, debt, health] = values.map((x) => new Decimal(x.value));
  const severity = debt.eq(0)
    ? "healthy"
    : health.lte(input.critical)
      ? "critical"
      : health.lte(input.warning)
        ? "warning"
        : "healthy";
  const repay = Decimal.max(
    0,
    debt.times(new Decimal(1).minus(health.div(input.target))),
  );
  const add = health.gt(0)
    ? Decimal.max(
        0,
        collateral.times(new Decimal(input.target).div(health).minus(1)),
      )
    : null;
  const result = {
    block,
    values,
    severity,
    repayQuote: repay.toFixed(),
    addCollateralQuote: add?.toFixed() ?? null,
    assumption:
      "Recovery estimates assume proportional health factor, fixed prices and liquidation parameters; verify protocol-specific mechanics.",
  };
  const stateKey = `liquidation:${input.positionId}`;
  const previous = ctx.store.get(stateKey);
  if (severity !== "healthy" && previous?.severity !== severity)
    result.delivery = await ctx.notifications.send(
      `${stateKey}:${block}`,
      input.channel,
      {
        message: `${severity}: health ${health.toFixed()}. Repay approximately ${repay.toFixed()} in debt quote units to target ${input.target}.`,
        link: `${ctx.config.network.explorer}/block/${BigInt(block)}`,
      },
    );
  ctx.store.set(stateKey, { severity, block });
  return result;
}
