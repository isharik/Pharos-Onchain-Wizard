# Pharos Onchain Wizard

Pharos Onchain Wizard is a developer workspace for reading Pharos on-chain data, running policy and decision flows, monitoring contracts, preparing wallet-authorized actions, and keeping a persistent execution history.

It is a JavaScript full-stack application with a React interface, Express API, Pharos RPC, Chain MCP, Developer Docs retrieval, SkillEngine/Foundry reads, and SQLite-backed local history.

The application is non-custodial: it never stores private keys or signs transactions. Any action that can move funds must be reviewed and signed in the user’s browser wallet.

## What it does

- Reads live Pharos mainnet data through RPC and Chain MCP.
- Searches canonical Pharos developer documentation with source links.
- Runs configurable on-chain decision and monitoring workflows.
- Simulates transactions before wallet submission.
- Prepares unsigned transactions for explicit wallet review.
- Stores feature inputs, execution history, monitor cursors, decision traces, and errors.
- Provides a unified dashboard, feature navigation, connection status, and activity history.

## Features

| Feature | What it does |
|---|---|
| DOC-SEARCH CLI | Searches Pharos documentation and returns a concise, sourced answer. |
| THRESHOLD GUARDIAN | Evaluates three or more chain conditions and records a fire/hold trace. |
| SAGA EXECUTOR | Runs receipt-gated dependent steps with retry and compensation support. |
| ARBITRAGE SCANNER | Compares two quotes and calculates net profit after fees, slippage, and gas. |
| DRY-RUN EXECUTOR | Simulates a transaction, reports gas/revert evidence, and blocks unsafe execution. |
| TREND WATCHER | Persists observations and triggers only after a configurable multi-block trend. |
| POLICY GATEKEEPER | Checks native spend limits, allowlists, and time-window policies. |
| SKILL + CHAIN MCP FLOW | Sends live Chain MCP evidence into a decision Skill in one request. |
| DOCS MCP + CHAIN MCP AGENT | Explains a documented function, reads it on-chain, and interprets the result. |
| YIELD OPTIMIZER | Compares configured APR sources against fees, gas, and holding period. |
| LIQUIDATION WATCHDOG | Watches collateral, debt, and health factor and estimates recovery actions. |
| RECURRING PAYMENT AGENT | Manages weekly or monthly unsigned payment schedules without double-paying. |
| INVOICE-TO-PAYMENT AGENT | Validates invoices and prepares a payment containing the invoice reference. |
| ON-CHAIN ALERT BOT | Watches a chain condition and sends an edge-triggered notification. |
| WHALE-WATCHING AGENT | Tracks significant ERC-20 transfers for five or more watched addresses. |
| MULTI-PROTOCOL AGGREGATOR | Compares ERC-4626 vaults and prepares a user-signed deposit or withdrawal. |
| EVENT/LOG MONITOR | Polls Chain MCP for new contract events and persists decoded results. |
| X402 AGENT BUYER | Inspects two x402 paid APIs, enforces spend limits, and keeps an idempotent payment ledger. |

## Run locally

Requires Node.js 24+.

```sh
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:4317`.

For local development, run `npm start` and `npm run dev:ui` in separate terminals.

## Test

```sh
npm test
npm run test:live
```

`npm test` runs isolated application tests. `npm run test:live` only performs read-only calls to Pharos RPC, Chain MCP, Developer Docs, and Foundry.

## Included live defaults

- Threshold Guardian includes a safe three-read mainnet configuration.
- Event/Log Monitor has a WPROS Transfer example in `config/events-live.json`.
- Multi-Protocol Aggregator includes two verified Pharos mainnet ERC-4626 vaults in `config/aggregator-live.json`.

## Configuration

Copy `.env.example` to `.env` to configure optional services such as Discord, Telegram, a remote Docs MCP, authentication, or an alternate network. Keep all secrets server-side; never commit `.env` or place secrets in frontend variables.

Default network: Pharos Mainnet, chain ID `1672`, RPC `https://rpc.pharos.xyz`, native token `PROS`.

## Temporary Vercel + Render team testing

Vercel hosts the browser interface; Render hosts the API and SQLite-backed workspace. To let a team review it briefly without an administrator login, deploy the repository to Render as a **Web Service** with build command `npm ci && npm run build` and start command `npm run start`, then configure:

```env
HOST=0.0.0.0
PUBLIC_ORIGIN=https://your-render-service.onrender.com
CORS_ORIGIN=https://your-vercel-project.vercel.app
ALLOW_PUBLIC_ACCESS=true
DATA_DIR=/tmp/pharos-data
```

Remove `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` from that Render service. On Vercel, import the repository as a Vite project and add this build-time variable:

```env
VITE_API_BASE_URL=https://your-render-service.onrender.com
```

Redeploy Vercel after setting the variable. This mode makes the shared workspace writable by anyone with its Vercel URL, so do not set private notification or payment credentials, and remove `ALLOW_PUBLIC_ACCESS` after the review. Render free-tier `/tmp` data is erased when its instance restarts; attach a persistent disk and use `DATA_DIR=/var/data` if retained history is required.

## Vercel-only review deployment

The repository also includes a same-origin Vercel Function at `/api/*`, so a reviewer can deploy one Vercel project without Render or an administrator login. Before redeploying, remove `VITE_API_BASE_URL` from Vercel Environment Variables so the frontend calls its own `/api` route. Keep the Vite defaults (`npm run build`, output directory `dist`, root `./`) and redeploy.

Vercel Functions may be recycled at any time. Their `/tmp` database and scheduled monitor loop are therefore not durable. Use the Render deployment with a persistent disk for durable activity history and continuous monitors.

## Important limits

The project contains working feature flows, validation, persistence, and tests. Some end-to-end demonstrations require external information that is not bundled with the repository:

- A user wallet and explicit signature for transactions.
- Discord or Telegram credentials for real external alert delivery.
- Verified same-asset price sources for arbitrage.
- Three comparable live APR sources for yield comparison.
- A real lending position for liquidation monitoring.
- Two live x402 endpoints and a compatible wallet for x402 payments.

The application does not fabricate those results or auto-send transactions.

## Project documentation

- [Architecture](docs/architecture.md)
- [Feature acceptance mapping](docs/acceptance.md)
- [Requirements matrix](docs/requirements-matrix.md)
- [Integration details](docs/integrations.md)
- [Verification report](docs/verification.md)
