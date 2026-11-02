import { z } from "zod";
import { address, identifier, positive } from "../validation.js";
import { requireThat, safeError } from "../errors.js";
export const tokenSchema = z.union([z.literal("native"), address]);
export const schema = z.object({
  scheduleId: identifier,
  frequency: z.enum(["weekly", "monthly"]),
  firstDue: z.string().datetime(),
  from: address,
  recipient: address,
  amount: positive,
  token: tokenSchema,
});
export function dueDate(first, frequency, index) {
  const anchor = new Date(first);
  const date = new Date(first);
  if (frequency === "weekly") date.setUTCDate(anchor.getUTCDate() + index * 7);
  else {
    date.setUTCDate(1);
    date.setUTCMonth(anchor.getUTCMonth() + index);
    const last = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(anchor.getUTCDate(), last));
  }
  return date.toISOString();
}
export async function execute(ctx, input) {
  const key = `recurring:${input.scheduleId}`,
    fingerprint = JSON.stringify(input);
  const state = ctx.store.get(key, {
    fingerprint,
    index: 0,
    payments: [],
    nextDue: input.firstDue,
  });
  requireThat(
    state.fingerprint === fingerprint,
    "Use a new schedule ID to change payment terms",
  );
  if (Date.now() < Date.parse(state.nextDue)) return state;
  const period = state.index;
  let payment = state.payments.find((p) => p.period === period);
  if (payment?.intentId) {
    const intent = await ctx.wallet.reconcile(payment.intentId);
    payment.status =
      intent.status === "confirmed"
        ? "paid"
        : intent.status === "failed"
          ? "failed"
          : "pending";
    payment.hash = intent.hash;
    if (payment.status === "paid") {
      state.index++;
      state.nextDue = dueDate(input.firstDue, input.frequency, state.index);
    }
    ctx.store.set(key, state);
    return { ...state, intent };
  }
  try {
    const transaction = await ctx.wallet.payment({
      ...input,
      reference: `${input.scheduleId}:${period}`,
    });
    const intent = await ctx.wallet.prepare(transaction, `${key}:${period}`);
    payment = {
      period,
      due: state.nextDue,
      status: "pending",
      intentId: intent.id,
    };
    state.payments = state.payments.filter((p) => p.period !== period);
    state.payments.push(payment);
    ctx.store.set(key, state);
    return { ...state, intent };
  } catch (e) {
    state.payments = state.payments.filter((p) => p.period !== period);
    state.payments.push({
      period,
      due: state.nextDue,
      status: "failed",
      error: safeError(e),
    });
    ctx.store.set(key, state);
    throw e;
  }
}
