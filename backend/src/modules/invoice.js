import { z } from "zod";
import { address, positive } from "../validation.js";
import { tokenSchema } from "./recurring.js";
import { requireThat } from "../errors.js";
export const schema = z.object({
  format: z.enum(["json", "text"]),
  invoice: z.string().min(1).max(20000),
  from: address,
});
const invoiceSchema = z
  .object({
    payee: address,
    amount: positive,
    token: tokenSchema,
    reference: z.string().min(1).max(120),
  })
  .strict();
export function parseInvoice(format, text) {
  if (format === "json") return invoiceSchema.parse(JSON.parse(text));
  const result = {};
  for (const line of text.split(/\r?\n/).filter((x) => x.trim())) {
    const match = line.match(
      /^\s*(payee|amount|token|reference)\s*:\s*(.+?)\s*$/i,
    );
    requireThat(
      match,
      "Use labelled fields Payee, Amount, Token, Reference; unsupported text is not guessed",
    );
    const key = match[1].toLowerCase();
    requireThat(!Object.hasOwn(result, key), `Duplicate ${key} field`);
    result[key] = match[2];
  }
  return invoiceSchema.parse(result);
}
export async function execute(ctx, input) {
  const invoice = parseInvoice(input.format, input.invoice);
  const key = `invoice:${input.from.toLowerCase()}:${invoice.reference}`;
  const old = ctx.store.get(key);
  requireThat(
    !old || JSON.stringify(old) === JSON.stringify(invoice),
    "Invoice reference already exists with different payment fields",
    "INVOICE_MISMATCH",
  );
  const transaction = await ctx.wallet.payment({
    from: input.from,
    recipient: invoice.payee,
    ...invoice,
  });
  const intent = await ctx.wallet.prepare(transaction, key, { invoice });
  ctx.store.set(key, invoice);
  return {
    summary: invoice,
    unsignedTransaction: transaction,
    intent,
    referenceEncoding:
      "UTF-8 in native calldata or trailing ERC-20 calldata; exact transaction is simulated before signing.",
  };
}
