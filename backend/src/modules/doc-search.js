import { z } from "zod";
export const schema = z.object({
  question: z.string().trim().min(3).max(2000),
  source: z.enum(["mcp", "index"]).default("index"),
});
export const execute = (ctx, input) =>
  ctx.docs.search(input.question, input.source);
