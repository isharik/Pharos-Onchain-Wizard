import { z } from "zod";
import { isAddress } from "ethers";
export const address = z.string().refine(isAddress, "Invalid EVM address");
export const decimal = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Use a non-negative decimal string");
export const positive = decimal.refine(
  (x) => Number(x) > 0,
  "Must be positive",
);
export const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const transaction = z
  .object({
    from: address,
    to: address,
    value: z
      .string()
      .regex(/^0x[0-9a-fA-F]+$/)
      .default("0x0"),
    data: z
      .string()
      .regex(/^0x([0-9a-fA-F]{2})*$/)
      .default("0x"),
  })
  .strict();
export const source = z
  .object({
    kind: z.enum([
      "gas",
      "balance",
      "block",
      "contract",
      "vaultYield",
      "fixed",
    ]),
    transport: z.enum(["rpc", "mcp", "skill"]).default("rpc"),
    address: address.optional(),
    abi: z.array(z.string()).min(1).max(50).optional(),
    function: z.string().max(200).optional(),
    args: z.array(z.unknown()).max(30).default([]),
    index: z.number().int().min(0).max(30).default(0),
    decimals: z.number().int().min(0).max(36).default(0),
    label: z.string().max(100).optional(),
    value: decimal.optional(),
    shareUnits: z
      .string()
      .regex(/^\d+$/, "Share units must be a whole number")
      .refine(
        (value) => /^\d+$/.test(value) && BigInt(value) > 0n,
        "Share units must be positive",
      )
      .optional(),
    lookbackBlocks: z.coerce.number().int().min(100).max(2_000_000).optional(),
  })
  .superRefine((s, c) => {
    if (s.kind === "balance" && !s.address)
      c.addIssue({ code: "custom", message: "Balance source needs address" });
    if (s.kind === "contract" && (!s.address || !s.abi || !s.function))
      c.addIssue({
        code: "custom",
        message: "Contract source needs address, ABI, function",
      });
    if (
      s.kind === "vaultYield" &&
      (!s.address || !s.shareUnits || !s.lookbackBlocks)
    )
      c.addIssue({
        code: "custom",
        message:
          "Annualized vault yield needs a vault address, share units and lookback blocks",
      });
    if (s.kind === "fixed" && (!s.value || Number(s.value) <= 0))
      c.addIssue({
        code: "custom",
        message: "Configured source needs a positive value",
      });
  });
export const operator = z.enum(["gt", "gte", "lt", "lte", "eq"]);
export const condition = z.object({
  name: z.string().min(1).max(100),
  source,
  operator,
  threshold: decimal,
});
export const count = (min, max) => z.coerce.number().int().min(min).max(max);
export const channel = z.enum(["console", "discord", "telegram"]);
