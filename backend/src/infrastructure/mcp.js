import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import Ajv from "ajv";
import { AppError } from "../errors.js";
const ajv = new Ajv({ strict: false, allErrors: true });
export function unwrap(result) {
  if (result.isError)
    throw new AppError(
      "MCP_TOOL_ERROR",
      result.content
        ?.filter((x) => x.type === "text")
        .map((x) => x.text)
        .join("\n") || "MCP tool failed",
      502,
    );
  if (result.structuredContent) return result.structuredContent;
  const texts = (result.content || [])
    .filter((x) => x.type === "text")
    .map((x) => x.text);
  if (texts.length === 1) {
    try {
      return JSON.parse(texts[0]);
    } catch {
      return texts[0];
    }
  }
  return { content: result.content };
}
export class McpConnection {
  constructor(name, config, timeout) {
    this.name = name;
    this.config = config;
    this.timeout = timeout;
    this.tools = [];
  }
  async connect() {
    if (this.client) return this.tools;
    if (this.pending) return this.pending;
    if (!this.config.url && !this.config.command)
      throw new AppError(
        "NOT_CONFIGURED",
        `${this.name} is not configured`,
        503,
      );
    this.pending = (async () => {
      const client = new Client({ name: "pharos", version: "1.0.0" });
      const transport = this.config.command
        ? new StdioClientTransport({
            command: this.config.command,
            args: this.config.args || [],
            stderr: "pipe",
          })
        : new StreamableHTTPClientTransport(new URL(this.config.url), {
            requestInit: {
              headers: this.config.token
                ? { Authorization: `Bearer ${this.config.token}` }
                : {},
            },
          });
      try {
        await client.connect(transport, { timeout: this.timeout });
        const found = [];
        let cursor;
        do {
          const page = await client.listTools(cursor ? { cursor } : {}, {
            timeout: this.timeout,
          });
          found.push(...page.tools);
          cursor = page.nextCursor;
        } while (cursor);
        this.tools = found;
        this.client = client;
        return found;
      } catch (e) {
        await client.close().catch(() => {});
        throw e;
      }
    })();
    try {
      return await this.pending;
    } finally {
      this.pending = null;
    }
  }
  async call(name, args) {
    await this.connect();
    const tool = this.tools.find((t) => t.name === name);
    if (!tool)
      throw new AppError(
        "TOOL_UNAVAILABLE",
        `${this.name} does not expose ${name}`,
        503,
      );
    const validate = ajv.compile(tool.inputSchema);
    if (!validate(args))
      throw new AppError("TOOL_INPUT", ajv.errorsText(validate.errors));
    if (
      this.name === "Chain MCP" &&
      ![
        "get_chain_info",
        "get_block_number",
        "get_balance",
        "get_transaction_count",
        "get_gas_price",
        "get_block",
        "get_transaction",
        "get_transaction_receipt",
        "get_code",
        "get_storage_at",
        "eth_call",
        "estimate_gas",
        "get_logs",
      ].includes(name)
    )
      throw new AppError("METHOD_DENIED", "Chain MCP writes are disabled");
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return unwrap(
          await this.client.callTool({ name, arguments: args }, undefined, {
            timeout: this.timeout,
          }),
        );
      } catch (e) {
        if (!/429|Too Many Requests/i.test(e.message) || attempt === 2) throw e;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
  }
  async close() {
    if (this.client) await this.client.close();
    this.client = null;
  }
}
