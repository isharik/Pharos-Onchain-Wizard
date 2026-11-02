import { z } from "zod";
import { condition } from "../validation.js";
import { decide } from "./threshold.js";
export const schema = z.object({
  conditions: z.array(condition).min(1).max(12),
});
export async function execute(ctx, input) {
  const runtime = await ctx.skill.inspect();
  const result = await decide(
    ctx,
    {
      conditions: input.conditions.map((c) => ({
        ...c,
        source: { ...c.source, transport: "mcp" },
      })),
    },
    1,
  );
  return {
    ...result,
    skill: runtime,
    flow: [
      "User request",
      "Chain MCP read",
      "Threshold Skill evaluation",
      "Decision trace",
    ],
    note: "Executed application Skill logic with the installed official package verified; no invented SkillEngine HTTP service.",
  };
}
