const field = (name, label, type = "text", value = "", help = "") => ({
  name,
  label,
  type,
  value,
  help,
});
const source = { kind: "gas", transport: "rpc", decimals: 9 };
const call = {
  kind: "contract",
  transport: "rpc",
  address: "",
  abi: ["function totalAssets() view returns (uint256)"],
  function: "totalAssets",
  args: [],
  index: 0,
  decimals: 18,
};
const tx = { from: "", to: "", value: "0x0", data: "0x" };
export const catalog = [
  {
    id: "doc-search",
    code: "C01",
    title: "DOC-SEARCH CLI",
    group: "Documentation",
    description:
      "Search the team-confirmed Pharos Dev Docs service and retain each source.",
    dependencies: ["docs"],
    fields: [
      field(
        "question",
        "Your question",
        "textarea",
        "What is the Pharos mainnet chain ID?",
      ),
      field("source", "Documentation source", "select", "index", "index,mcp"),
    ],
  },
  {
    id: "threshold",
    code: "C02",
    title: "THRESHOLD GUARDIAN",
    group: "Skills",
    description:
      "Evaluate independent live conditions and explain the fire or hold decision.",
    dependencies: ["rpc"],
    fields: [
      field("conditions", "Conditions", "json", [
        { name: "Gas price", source, operator: "lt", threshold: "20" },
        {
          name: "Pharos zero-address balance",
          source: {
            kind: "balance",
            transport: "rpc",
            address: "0x0000000000000000000000000000000000000000",
            decimals: 18,
          },
          operator: "gte",
          threshold: "0",
        },
        {
          name: "Current block",
          source: { kind: "block", transport: "rpc", decimals: 0 },
          operator: "gt",
          threshold: "0",
        },
      ]),
    ],
  },
  {
    id: "saga",
    code: "C03",
    title: "SAGA EXECUTOR",
    group: "Skills",
    description:
      "Advance a dependent transaction workflow only after each receipt is verified.",
    dependencies: ["rpc", "wallet"],
    fields: [
      field("sagaId", "Workflow ID", "text", "my-workflow"),
      field(
        "operation",
        "Operation",
        "select",
        "advance",
        "advance,inspect,recover",
      ),
      field("steps", "Steps and compensations", "json", [
        { name: "Approve", transaction: tx, compensation: null },
        { name: "Swap", transaction: tx, compensation: null },
        { name: "Deposit", transaction: tx, compensation: null },
      ]),
      field("maxRetries", "Transient retry limit", "number", 2),
    ],
  },
  {
    id: "arbitrage",
    code: "C04",
    title: "ARBITRAGE SCANNER",
    group: "Skills",
    description:
      "Compare two quotes in one block and calculate profit after all configured costs.",
    dependencies: ["rpc"],
    fields: [
      field("sources", "Two price sources", "json", [
        { ...call, label: "Pool A" },
        { ...call, label: "Pool B" },
      ]),
      field("amount", "Base-asset quantity", "text", "1"),
      field("feeBps", "Combined swap fees (bps)", "number", 60),
      field("slippageBps", "Slippage allowance (bps)", "number", 50),
      field("gasUnits", "Estimated route gas", "text", "300000"),
      field(
        "nativePrice",
        "Native token price source (quote units)",
        "json",
        call,
      ),
      field("minProfit", "Minimum profit (quote units)", "text", "0.01"),
      field("transaction", "Optional route transaction", "json", null),
    ],
  },
  {
    id: "dry-run",
    code: "C05",
    title: "DRY-RUN EXECUTOR",
    group: "Skills",
    description:
      "Simulate a transaction, inspect revert evidence, and prepare only successful calls.",
    dependencies: ["rpc"],
    fields: [field("transaction", "Transaction to simulate", "json", tx)],
  },
  {
    id: "trend",
    code: "C06",
    title: "TREND WATCHER",
    group: "Skills",
    description:
      "Persist observations and act only when a multi-observation trend is confirmed.",
    dependencies: ["rpc"],
    monitor: true,
    fields: [
      field("watchId", "Watch ID", "text", "gas-trend"),
      field("source", "Observation source", "json", source),
      field("direction", "Direction", "select", "down", "down,up"),
      field("observations", "Required observations", "number", 3),
    ],
  },
  {
    id: "policy",
    code: "C07",
    title: "POLICY GATEKEEPER",
    group: "Skills",
    description:
      "Enforce spend limits, destination allowlists and UTC execution windows.",
    dependencies: [],
    fields: [
      field("policy", "Policy", "json", {
        spendLimit: "1",
        allowlist: [],
        startHourUTC: 9,
        endHourUTC: 17,
      }),
      field("transaction", "Requested transaction", "json", tx),
    ],
  },
  {
    id: "skill-chain",
    code: "C08",
    title: "SKILL + CHAIN MCP FLOW",
    group: "Composition",
    description:
      "Feed live Chain MCP evidence into a threshold Skill in one request.",
    dependencies: ["chain"],
    fields: [
      field("conditions", "Chain MCP conditions", "json", [
        {
          name: "Gas",
          source: { ...source, transport: "mcp" },
          operator: "lt",
          threshold: "20",
        },
      ]),
    ],
  },
  {
    id: "docs-chain",
    code: "C09",
    title: "DOCS MCP + CHAIN MCP AGENT",
    group: "Composition",
    description:
      "Retrieve a sourced explanation, call that function, then decode its result.",
    dependencies: ["docs", "chain"],
    fields: [
      field(
        "question",
        "Documentation question",
        "textarea",
        "Explain the function and its returned units.",
      ),
      field("contract", "Contract function", "json", {
        ...call,
        transport: "mcp",
      }),
    ],
  },
  {
    id: "yield",
    code: "C10",
    title: "YIELD OPTIMIZER",
    group: "Portfolio",
    description:
      "Compare live yields against switching costs over your minimum holding period.",
    dependencies: ["rpc"],
    fields: [
      field("sources", "Yield sources", "json", [
        {
          kind: "vaultYield",
          transport: "mcp",
          address: "",
          shareUnits: "1000000",
          lookbackBlocks: 600000,
          label: "Vault A",
        },
        {
          kind: "vaultYield",
          transport: "mcp",
          address: "",
          shareUnits: "1000000",
          lookbackBlocks: 600000,
          label: "Vault B",
        },
        {
          kind: "vaultYield",
          transport: "mcp",
          address: "",
          shareUnits: "1000000",
          lookbackBlocks: 600000,
          label: "Vault C",
        },
      ]),
      field("current", "Current source index", "number", 0),
      field("principal", "Principal (shared quote units)", "text", "1000"),
      field("holdingDays", "Minimum holding days", "number", 30),
      field("entryBps", "Entry fee (bps)", "number", 0),
      field("exitBps", "Exit fee (bps)", "number", 0),
      field("gasUnits", "Rebalance gas estimate", "text", "300000"),
      field("nativePrice", "Native price in shared quote units", "json", {
        kind: "fixed",
        transport: "rpc",
        value: "",
        label: "Current PROS price",
      }),
      field(
        "transaction",
        "Optional reviewed rebalance transaction",
        "json",
        null,
        "Prepared for your wallet only after a positive recommendation; it is never signed or broadcast by Pharos.",
      ),
    ],
  },
  {
    id: "liquidation",
    code: "C11",
    title: "LIQUIDATION WATCHDOG",
    group: "Portfolio",
    description:
      "Read lending risk and report the repayment needed to reach your target health.",
    dependencies: ["rpc"],
    monitor: true,
    fields: [
      field("positionId", "Position ID", "text", "my-position"),
      field("collateral", "Collateral source (quote units)", "json", call),
      field("debt", "Debt source (same quote units)", "json", call),
      field("health", "Health-factor source", "json", call),
      field("warning", "Warning health factor", "text", "1.3"),
      field("critical", "Critical health factor", "text", "1.1"),
      field("target", "Recovery target", "text", "1.5"),
      field(
        "channel",
        "Alert channel",
        "select",
        "console",
        "console,discord,telegram",
      ),
    ],
  },
  {
    id: "recurring",
    code: "C12",
    title: "RECURRING PAYMENT AGENT",
    group: "Payments",
    description:
      "Schedule unsigned payments, reconcile receipts, and prevent duplicate periods.",
    dependencies: ["rpc", "wallet"],
    monitor: true,
    fields: [
      field("scheduleId", "Schedule ID", "text", "monthly-subscription"),
      field("frequency", "Frequency", "select", "monthly", "weekly,monthly"),
      field("firstDue", "First due (UTC ISO date)", "text", ""),
      field("from", "Payer address"),
      field("recipient", "Recipient address"),
      field("amount", "Amount", "text", "0.01"),
      field(
        "token",
        "Token",
        "text",
        "native",
        "native or a token contract address",
      ),
    ],
  },
  {
    id: "invoice",
    code: "C13",
    title: "INVOICE-TO-PAYMENT AGENT",
    group: "Payments",
    description:
      "Validate structured JSON or labelled text invoices and prepare an unsigned payment.",
    dependencies: ["rpc", "wallet"],
    fields: [
      field("format", "Invoice format", "select", "json", "json,text"),
      field(
        "invoice",
        "Invoice content",
        "textarea",
        '{\n  "payee": "",\n  "amount": "0.01",\n  "token": "native",\n  "reference": "INV-001"\n}',
      ),
      field("from", "Payer address"),
    ],
  },
  {
    id: "alert",
    code: "C14",
    title: "ON-CHAIN ALERT BOT",
    group: "Monitoring",
    description:
      "Send a real channel alert when a configurable chain condition crosses its threshold.",
    dependencies: ["rpc", "channel"],
    monitor: true,
    fields: [
      field("alertId", "Alert ID", "text", "gas-alert"),
      field("source", "Observation source", "json", source),
      field("operator", "Condition", "select", "gt", "gt,gte,lt,lte"),
      field("threshold", "Threshold", "text", "20"),
      field(
        "channel",
        "Delivery channel",
        "select",
        "discord",
        "discord,telegram",
      ),
    ],
  },
  {
    id: "whale",
    code: "C15",
    title: "WHALE-WATCHING AGENT",
    group: "Monitoring",
    description:
      "Track significant ERC-20 transfers across at least five watched addresses.",
    dependencies: ["rpc"],
    monitor: true,
    fields: [
      field("watchId", "Watch ID", "text", "whale-watch"),
      field("addresses", "Watched addresses (at least 5)", "json", []),
      field("tokens", "Token contracts and thresholds", "json", [
        { address: "", threshold: "1000" },
      ]),
      field("labels", "Known destination labels", "json", {}),
      field("fromBlock", "Starting block (optional)", "text", ""),
    ],
  },
  {
    id: "aggregator",
    code: "C16",
    title: "MULTI-PROTOCOL AGGREGATOR",
    group: "Portfolio",
    description:
      "Compare independent ERC-4626 vaults and prepare a deposit or withdrawal for the best venue.",
    dependencies: ["rpc", "wallet"],
    fields: [
      field("vaults", "ERC-4626 vaults (at least 2)", "json", [
        {
          name: "R25 Axil Consumer Credit · 7D",
          address: "0x1c2bc8b553d9a7e61f7531a3a4bf2162f4569268",
        },
        {
          name: "R25 Axil Consumer Credit · 6M",
          address: "0xee26bb0989691735c997dfdc49a4a607f75e190b",
        },
      ]),
      field(
        "owner",
        "Wallet address",
        "text",
        "0x0000000000000000000000000000000000000000",
        "Use your wallet for a personal query or any deposit/withdrawal preparation.",
      ),
      field("action", "Action", "select", "query", "query,deposit,withdraw"),
      field("amount", "Asset amount", "text", "1"),
    ],
  },
  {
    id: "events",
    code: "C17",
    title: "EVENT/LOG MONITOR",
    group: "Monitoring",
    description:
      "Continuously query Chain MCP and decode only new matching contract events.",
    dependencies: ["chain"],
    monitor: true,
    fields: [
      field("watchId", "Monitor ID", "text", "transfer-monitor"),
      field("address", "Contract address"),
      field(
        "event",
        "Event ABI",
        "text",
        "event Transfer(address indexed from, address indexed to, uint256 value)",
      ),
      field("fromBlock", "Starting block (optional)", "text", ""),
      field("confirmations", "Confirmation depth", "number", 3),
    ],
  },
  {
    id: "x402-buyer",
    code: "C18",
    title: "X402 AGENT BUYER",
    group: "Payments",
    description: "Inspect paid API offers, enforce a budget, and retain an idempotent payment ledger.",
    dependencies: ["wallet"],
    fields: [
      field("task", "Task to complete", "textarea", "Fetch and compare both paid API resources."),
      field("endpoints", "Two x402 API URLs", "json", ["", ""]),
      field("budget", "Total budget (base units)", "text", "0"),
      field("priceCap", "Maximum per-call price (base units)", "text", "0"),
    ],
  },
];
