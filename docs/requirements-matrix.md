# Requirements matrix — attachment review completed before implementation

Source: all 17 challenge screenshots supplied on 2026-11-02, in supplied order. Original challenge IDs are not visible; C01–C17 are local traceability IDs, not claimed official IDs. Every screenshot awards an additional 50 points with video. No video is supplied. C16 additionally encourages a demo video. C05 cuts off the content below “WHAT TO SUBMIT”; that unseen content is unknown. The official logo supplied later is integrated unchanged. Implementation status does not imply live acceptance: see [verification.md](verification.md).

| ID | Challenge | Required functionality | Required integrations | Acceptance tests | Status |
|---|---|---|---|---|---|
| C01 | DOC-SEARCH CLI | Natural-language CLI; concise sourced answers; graceful no-match; install/usage and 3 queries with outputs | Developer Docs MCP | C01.1–4 | Implemented; see numbered verification |
| C02 | THRESHOLD GUARDIAN | At least 3 independent chain conditions; configurable thresholds; per-condition trace; fire and hold demos | SkillEngine, chain reads | C02.1–4 | Implemented; see numbered verification |
| C03 | SAGA EXECUTOR | At least 3 dependent receipt-verified steps; transient retries; permanent-failure compensation and demo; persistent step state; success and failure/recovery demos | SkillEngine, wallet, receipts | C03.1–5 | Implemented; see numbered verification |
| C04 | ARBITRAGE SCANNER | Two live price sources per scan; swap fees/slippage/gas; configurable profit threshold and skip explanation; full cost trace; safe testnet or prepared execution | SkillEngine, quote contracts | C04.1–5 | Implemented; see numbered verification |
| C05 | DRY-RUN EXECUTOR | Call/estimate without broadcasting; success/revert/reason/gas cost; predicted changes where possible; failed simulation blocks execution | SkillEngine, RPC, wallet | C05.1–4 | Implemented; see numbered verification |
| C06 | TREND WATCHER | Persistent observations; configurable >=3 observation rule; restart and deduplication; history and trigger instant; single-spike rejection demo | SkillEngine, chain, SQLite | C06.1–5 | Implemented; see numbered verification |
| C07 | POLICY GATEKEEPER | Spend/allowlist/time-window rules; allow/deny and rule; deny cannot execute and each denial demo; audit log | SkillEngine, SQLite | C07.1–4 | Implemented; see numbered verification |
| C08 | SKILL + CHAIN MCP FLOW | Skill output depends on same-flow live Chain MCP data; single request; flow write-up; real composed demo | SkillEngine + Chain MCP | C08.1–4 | Implemented; see numbered verification |
| C09 | DOCS MCP + CHAIN MCP AGENT | Sourced Docs MCP explanation; same function called through Chain MCP; contextual result interpretation; >=2 functions/contracts | Docs MCP + Chain MCP | C09.1–4 | Implemented; see numbered verification |
| C10 | YIELD OPTIMIZER | >=3 live sources; gas/entry/exit/holding period; net gain or stay-put reason; unsigned-only optional execution | RPC, protocol adapters, wallet | C10.1–4 | Implemented; see numbered verification |
| C11 | LIQUIDATION WATCHDOG | Live collateral/debt/health; configurable warning/critical; timestamped real channel or console; concrete repay/add-collateral suggestion | Lending adapter, notifications | C11.1–4 | Implemented; see numbered verification |
| C12 | RECURRING PAYMENT AGENT | Weekly/monthly amount/token/recipient; timely preparation and paid/pending/failed tracking; insufficient balance/failure without duplicates; history and next due | RPC, wallet, SQLite scheduler | C12.1–4 | Implemented; see numbered verification |
| C13 | INVOICE-TO-PAYMENT AGENT | Extract payee/amount/token/reference from >=2 formats; flag missing/mismatch; summary and unsigned tx including reference; sample invoices demo | Parser, token metadata, wallet | C13.1–4 | Implemented; see numbered verification |
| C14 | ON-CHAIN ALERT BOT | Configurable condition; real Telegram/Discord-like channel; event/value/tx or explorer link; no repeat spam | RPC, notification channel, SQLite | C14.1–4 | Implemented; see numbered verification |
| C15 | WHALE-WATCHING AGENT | >=5 configurable addresses; significant per-token/value threshold; asset/amount/destination/known labels; aggregate recent activity | RPC logs/blocks, SQLite | C15.1–4 | Implemented; see numbered verification |
| C16 | MULTI-PROTOCOL AGGREGATOR | >=2 protocols/vaults; positions/rates and unsigned deposits/withdrawals; best venue with reason; isolation of unavailable protocol; architecture/demo video encouragement | Protocol adapters, RPC, wallet | C16.1–5 | Implemented; see numbered verification |
| C17 | EVENT/LOG MONITOR | Chain MCP address/topic filter; continuous deduplicated polling; ABI decoded readable fields; >=1 live/test event | Chain MCP, scheduler, SQLite | C17.1–4 | Implemented; see numbered verification |

## Implementation plan

1. Shared JavaScript registry with exact screenshot titles, configuration schemas and individual execution handlers. Each numbered item above retains its Cxx.n identifier in verification documentation.
2. Node 24 Express API with SQLite execution/state/outbox records, bounded requests, input validation, sanitized structured errors, server-only configuration and loopback-only default binding.
3. Official MCP SDK Streamable HTTP/stdio connections kept separate for chain and docs; discover schemas before calling. Verify chain ID against RPC. Never fall back from a required MCP silently.
4. Use the actual installable Pharos SkillEngine SKILL.md convention (confirmed by setup screenshot), with Foundry-backed reads and installable module Skills. It is not an HTTP execution service. Keep deterministic application logic distinct from that skill package.
5. Protocols and oracle contracts configured explicitly with ABI, output units and chain; no invented deployed addresses, yields or prices. Pin reads to a common block. Use integer/fixed precision financial calculations.
6. Wallet signs only after explicit review. Backend prepares and verifies; never holds keys. Sagas resume by verifying receipts and prepare compensations; uncertain submissions never automatically rebroadcast.
7. Durable scheduler for monitors and recurring preparation, persistent deduplication and failure records. External notifications require explicitly configured channel.
8. React/Vite shell, dedicated module-specific forms/workspaces, actual connection state, execution evidence, settings and activity views. No fabricated activity or substitute logo.
9. Unit tests cover validation, decisions and failures; integration tests exercise API, persistence and live read-only services when reachable. Browser checks cover all navigation and representative execution controls. Produce README, mapping, verification report, source folder and ZIP.

## Setup screenshots

- Chain MCP: `https://mcp.pharos.xyz/mcp`, confirmed against official repository and available tool schemas; hosted server is read-only.
- SkillEngine: `npx skills add https://github.com/PharosNetwork/pharos-skill-engine`. Official repository is a SKILL.md package invoking Foundry, not a hosted runtime API.
- Agent docs: `https://www.pharos.xyz/agent-center/llms.txt`. This is a documentation index, not evidence of a Developer Docs MCP transport or tool schema. Support separately and label provenance; C01/C09 MCP acceptance remains pending until an actual docs server is provided.

## Evidence and acceptance boundaries

Initial live tool evidence: `pharos_mcp/get_chain_info` returned chain ID 1672, latest block 21936588, client portal/1.0.0, RPC https://rpc.pharos.xyz. Duplicate connection `pharos/get_chain_info` returned HTTP 429. These verify the connected tool only; standalone application integration must be checked separately. Public official source: https://github.com/PharosNetwork/pharos-mcp. Network metadata source: https://github.com/PharosNetwork/pharos-skill-engine/blob/main/assets/networks.json.

## Final input clarifications

Product renamed to Pharos, Features terminology applied, original logo received and integrated byte-for-byte. Team confirmed llms.txt as Dev Docs interface. Working URL https://www.pharos.xyz/llms.txt is linked by the official agent-center page; the earlier endpoint shown in explanatory text is stale. Docs search and two docs-to-chain contract flows now have live evidence. Original extraction statements above record the initial evidence available before these clarifications.
