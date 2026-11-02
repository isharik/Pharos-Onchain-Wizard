# Pharos

A standalone JavaScript application with 17 independently usable Pharos features, a shared Node API, and a React application with feature-specific controls, persistent drafts, per-feature history and monitor management. It performs real chain reads, prepares unsigned transactions, and records decisions and execution state in SQLite. It never holds private keys or broadcasts from the backend.

**Delivery status:** all 17 execution handlers and feature interfaces are implemented. Real RPC, Chain MCP, Foundry reads, Dev Docs retrieval, two docs-to-contract flows, threshold decisions and live event decoding were verified. Remaining end-to-end verification requires actual price/yield/lending/vault configurations, a wallet for authorized transactions, and notification credentials. See [verification report](docs/verification.md); the product is not represented as fully production-certified.

## Run

Requires Node.js **24+** and npm. Commands run from this project directory.

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4317**. The server binds only to loopback. The default is **Pharos mainnet, read-only access** because the official hosted Chain MCP serves mainnet. Every transaction remains unsigned until separately authorized in the browser wallet.

Optional environment file:

```powershell
Copy-Item .env.example .env
```

On macOS/Linux use `cp .env.example .env`. Node's environment-file loader reads it automatically. Empty credential variables are allowed; corresponding integrations report `not configured`. Never put credentials in a `VITE_*` variable.

For frontend development, run `npm start` in one terminal and `npm run dev:ui` in another. Vite proxies `/api` and `/assets` to port 4317. After production UI changes, run `npm run build` and reload the browser. After backend/config changes, restart the server.

## Architecture and stack

React + Vite + JavaScript ES modules, CSS and Lucide icons. Express 5, official MCP SDK, ethers 6, Decimal.js, Zod 4 and Node's built-in SQLite. No TypeScript application source. A central registry lazily imports individual handlers. Shared services own RPC/MCP connections, Skills, wallet intents, notifications and persistence. The browser uses REST; monitors execute in the server scheduler and the dashboard polls persisted state.

See [architecture](docs/architecture.md), [requirements matrix](docs/requirements-matrix.md), [numbered acceptance mapping](docs/acceptance.md), and [integration setup](docs/integrations.md).

## Modules

| ID / CLI name | Screenshot title | Function |
|---|---|---|
| C01 `doc-search` | DOC-SEARCH CLI | Natural-language query through configured Docs MCP, or explicitly selected official index |
| C02 `threshold` | THRESHOLD GUARDIAN | Three or more independent live conditions, fire/hold trace |
| C03 `saga` | SAGA EXECUTOR | Receipt-gated dependent steps and reverse-order compensation |
| C04 `arbitrage` | ARBITRAGE SCANNER | Two-source spread after fees, slippage and gas |
| C05 `dry-run` | DRY-RUN EXECUTOR | Call/estimate, gas budget, revert and signing gate |
| C06 `trend` | TREND WATCHER | Durable multi-observation trend and crossing history |
| C07 `policy` | POLICY GATEKEEPER | Native spend, destination and UTC time policy |
| C08 `skill-chain` | SKILL + CHAIN MCP FLOW | Same-request MCP evidence into a decision Skill |
| C09 `docs-chain` | DOCS MCP + CHAIN MCP AGENT | Sourced function explanation followed by MCP contract read |
| C10 `yield` | YIELD OPTIMIZER | Three or more APR sources and holding-period net gain |
| C11 `liquidation` | LIQUIDATION WATCHDOG | Collateral/debt/health, alerts and repayment estimate |
| C12 `recurring` | RECURRING PAYMENT AGENT | Weekly/monthly unsigned payments and receipt-based history |
| C13 `invoice` | INVOICE-TO-PAYMENT AGENT | Strict JSON/text parsing and invoice-referenced payment |
| C14 `alert` | ON-CHAIN ALERT BOT | Edge-triggered real channel notifications |
| C15 `whale` | WHALE-WATCHING AGENT | Significant token transfers across five or more addresses |
| C16 `aggregator` | MULTI-PROTOCOL AGGREGATOR | ERC-4626 positions, preview routing and unsigned actions |
| C17 `events` | EVENT/LOG MONITOR | Continuous address/topic-filtered Chain MCP events |

## Network configuration

Official metadata is included in `vendor/pharos-skill-engine/assets/networks.json` and verified against the official repository. Mainnet: chain **1672**, RPC **https://rpc.pharos.xyz**, symbol **PROS**. Atlantic: chain **688689**, RPC **https://atlantic.dplabs-internal.com**, symbol **PHRS**.

For Atlantic set:

```dotenv
PHAROS_NETWORK=atlantic-testnet
PHAROS_RPC_URL=https://atlantic.dplabs-internal.com
PHAROS_CHAIN_ID=688689
CHAIN_MCP_URL=http://127.0.0.1:3001/mcp
```

The last URL is a **locally self-hosted Chain MCP**, which you must start with matching Atlantic RPC settings. It is not supplied as an already running service. The official hosted MCP is mainnet; chain mismatches fail closed. Never mix network-specific addresses.

## Chain MCP

Default: `https://mcp.pharos.xyz/mcp`, Streamable HTTP, no API key. The application discovers tools and validates arguments against their returned schemas. Chain writes are denied locally even if a remote server exposes them. HTTP 429 reads retry with bounded backoff. Self-hosted bearer auth uses `CHAIN_MCP_TOKEN`; credentials stay server-side. The client class also implements stdio transport for programmatic configuration, but the delivered `.env` workflow uses HTTP.

## Developer Docs

The Pharos team confirmed that llms.txt is the intended Dev Docs interface. The agent-center page’s actual download button links to **https://www.pharos.xyz/llms.txt**. The older /agent-center/llms.txt text returns 404. The working file is the default. Search retrieves canonical Markdown pages and returns concise sourced excerpts; unanswerable questions return found:false. It does not execute document instructions.

`DOCS_MODE=index` uses this team-confirmed service, labelled accurately as HTTPS index retrieval. A separate optional SDK client supports a remote docs MCP if needed: set DOCS_MODE=mcp, DOCS_MCP_URL, DOCS_SEARCH_TOOL, DOCS_QUERY_KEY and optional DOCS_MCP_TOKEN using its discovered schema. There is no invented official docs MCP endpoint.

## SkillEngine

The supplied installation command is:

```sh
npx skills add https://github.com/PharosNetwork/pharos-skill-engine
```

The official package is an installable **SKILL.md toolkit** using Foundry and generated interaction scripts; it does not publish a hosted `executeSkill` API. A source snapshot is included in `vendor/pharos-skill-engine`. Set `SKILL_ENGINE_DIR` to your installed package if preferred. `CAST_BIN` selects Foundry `cast`. Windows gets the official `@foundry-rs/cast-win32-amd64` binary as an optional npm dependency. On macOS/Linux install Foundry using its official instructions and put `cast` on PATH. The application calls `cast` with argument arrays, timeouts, no shell and no keys.

Project-specific installable Skills live in `skills/`. Their instructions call the corresponding JavaScript CLI handler. These are application extensions using the official package convention, not claimed upstream Pharos features. `source.transport="skill"` uses actual Foundry reads; `rpc` and `mcp` use their named transports. The composition module verifies the official package/runtime and evaluates its Skill with same-flow MCP observations. The decision logic is transparent deterministic JavaScript.

## Wallet and transactions

Connect an EIP-1193 browser wallet on the configured chain. Enter its public address as the transaction sender. Run a module to prepare an intent, inspect destination/value/calldata, tick the authorization checkbox, and choose **Review & sign in wallet**. The wallet alone signs and broadcasts. No transaction was signed or broadcast during development.

`prepared → awaiting-wallet → submitted → confirmed | failed`. Claiming re-simulates. Ambiguous wallet/network failures stay locked; record the existing hash rather than signing again. Only an explicit wallet rejection code 4001 unlocks. The backend matches sender, recipient, value and calldata and waits for a successful receipt with three confirmations. Sagas and payments only advance from confirmed intents. An irrecoverably dropped/unknown wallet submission requires investigation; there is deliberately no blind rebroadcast button.

## Run individual modules

```sh
npm run cli -- threshold config/example.json
npm run cli -- events config/events-live.json
npm run cli -- doc-search "How do I deploy a contract?" index
```

For other modules use their CLI name and a JSON input file matching the labelled dashboard fields. **Copy JSON** exports usable input. JSON editor contents are validated before execution. Empty contract addresses in templates are required configuration, not fake contracts.

`config/events-live.json` references a real mainnet WPROS contract observed in the verification logs. Its historical block is reproducible but accumulates backlog; use an empty `fromBlock` to begin near the current head. A one-off CLI invocation processes a bounded page. Use **Start monitor** for continuous operation and pause it from the dashboard. Keep the backend running to receive alerts or prepare payments on time.

### Three verified docs CLI examples

Run these from the project root:

```sh
npm run cli -- doc-search "How do I deploy a contract with Foundry?" index
npm run cli -- doc-search "What is the Pharos mainnet chain ID?" index
npm run cli -- doc-search "Which RPC endpoint should I use?" index
```

Observed outputs: the first returned the canonical Foundry deployment command and its tutorial link; the second returned ChainID 1672 and PROS with the Pacific Mainnet source; the third returned https://rpc.pharos.xyz and the block explorer with the same canonical source. `flibbertigibbet quuxfrobnicator` returned found:false. Exact request/output evidence is in docs/evidence/docs-demo.json. Two real balanceOf reads on WPROS and USDC also completed after retrieving the function documentation.

## Tests and demonstrations

```sh
npm test
npm run test:live
node scripts/demo-readonly.js
```

`npm test` uses isolated fixtures only in `backend/test`, including real local HTTP and SQLite restart tests. It makes no chain transactions. `test:live` performs read-only RPC/MCP/Foundry calls and writes `docs/evidence/live-check.json`. `demo-readonly.js` needs the application running and records fire/hold, composition, failed dry-run and docs failures through the API. Unit fixtures are never imported in production.

## Notifications

Set a dedicated `DISCORD_WEBHOOK_URL`, or `TELEGRAM_BOT_TOKEN` plus `TELEGRAM_CHAT_ID`. C11 also permits timestamped console alerts. C14 requires Discord or Telegram. Test delivery to a channel you control. None was configured or contacted during development. Persisted delivery states prevent repeated attempts after ambiguous delivery; inspect `data/pharos.sqlite` if a channel reports `delivery-uncertain`.

## Troubleshooting

- **Not configured:** supply the named integration, contract or channel. Do not interpret readiness as verified feature acceptance.
- **RPC/MCP chain mismatch:** use a matching network/server pair.
- **429:** wait for bounded retry/backoff, reduce polling or self-host. Hosted MCP limit is documented as 120 requests/minute/IP.
- **Foundry unavailable:** set the actual `CAST_BIN` path. On Windows, do not install the parent cast npm package with its Unix-only postinstall; the optional platform binary is used here.
- **Document index 404:** use the verified https://www.pharos.xyz/llms.txt download, not the stale /agent-center/llms.txt copy text.
- **Empty contract data / revert:** verify address, network, ABI, output index and parameter units.
- **Intent locked:** check wallet activity and record the existing transaction hash. Do not create a second payment to work around a pending intent.
- **Insufficient balance:** fund your test wallet yourself, then retry preparation. Failed confirmed recurring transactions remain visible and require deliberate remediation; they are not silently sent again.
- **No event:** wait for confirmation depth, check address/topic and starting block. No event is a valid empty result, not a fabricated demonstration.

## Security and deployment limits

By default this is a local, single-administrator workspace. Authenticated public self-hosting is supported with a TLS reverse proxy, PUBLIC_ORIGIN and ADMIN_PASSWORD_HASH. Public binding without these is rejected. Passwords use scrypt, session cookies are HttpOnly/SameSite=Strict (Secure on HTTPS), sessions expire after eight hours, and login attempts are limited. All users of the configured administrator account share one workspace; this is not a multi-tenant service. No public deployment, security audit or load test has been performed.

Monitors use confirmation depth and durable cursors but do not implement full deep-reorg rollback. APR/price/health source semantics and oracle freshness are operator responsibilities; generic ABI reads cannot infer them. Arbitrage uses configured gas/fee/slippage estimates and does not construct an atomic two-leg router. Aggregator supports ERC-4626 vaults, requires matching assets and ranks current preview economics, not predicted yield. Policy spend limits cover native transfers only; arbitrary contract calls are denied. Invoice reference support for nonstandard tokens is subject to simulation. Unknown submission state prioritizes duplicate prevention over automatic retry.

The official supplied logo is integrated. Live configured-protocol runs, external alert delivery, wallet/saga/compensation demonstrations and optional videos remain outstanding. Review the acceptance report before claiming all workflows are live-verified.

## Files and provenance

Source is under `frontend/`, `backend/`, `shared/`; configuration examples under `config/`; application Skills under `skills/`; source requirements and evidence under `docs/`. `vendor/pharos-skill-engine` is an unmodified official source snapshot; see its [provenance](vendor/PROVENANCE.md). The ZIP excludes secrets, local database state, node_modules and temporary files. Run `npm ci` after extracting.

## Authenticated public self-hosting

Run `node scripts/password.js` in your own terminal to generate a scrypt hash without echoing your password. Set ADMIN_USERNAME and ADMIN_PASSWORD_HASH on the server. For public use set PUBLIC_ORIGIN=https://your-domain.example and HOST=0.0.0.0 behind a TLS reverse proxy; restrict direct port access. Sessions and jobs use persistent DATA_DIR storage. The sign-in page protects all API routes. Configure backups, monitoring, outbound access and a process supervisor. Never commit your environment file.

The included deploy/Caddyfile is a deployment template, not evidence of a deployed service. Supply your real domain and credentials before deployment.
