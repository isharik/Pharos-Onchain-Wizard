export class AppError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export function requireThat(condition, message, code = "INVALID_INPUT") {
  if (!condition) throw new AppError(code, message);
}
export function safeError(error) {
  const message = String(error?.message || error)
    .replace(/https?:\/\/[^\s"')]+/g, "[endpoint]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 800);
  return {
    code:
      error.code && typeof error.code === "string"
        ? error.code
        : "EXECUTION_FAILED",
    message,
  };
}
export const json = (value) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
