# Verified interfaces and setup

## Chain MCP

- Official source: https://github.com/PharosNetwork/pharos-mcp
- Hosted endpoint: https://mcp.pharos.xyz/mcp
- Transport: Streamable HTTP; no hosted API key.
- Mainnet chain 1672; 13 read tools discovered live. Exact input schemas captured in `evidence/live-check.json`.
- Tools: get_chain_info, get_block_number, get_balance, get_transaction_count, get_gas_price, get_block, get_transaction, get_transaction_receipt, get_code, get_storage_at, eth_call, estimate_gas, get_logs.
- `get_logs` inclusive window maximum: 1000 blocks. The application pages at or below this limit.
- Official hosted broadcast is disabled; application writes are disabled independently.
- Schemas/transport were inspected before integration. Text content JSON and structured content responses are handled; isError is never treated as success.

For self-hosting follow the official README. Configure its PHAROS_RPC_URL/PHAROS_CHAIN_ID for the desired chain, MCP_TRANSPORT=http and a bearer token. Set the matching application CHAIN_MCP_URL/CHAIN_MCP_TOKEN. Do not expose an unauthenticated broadcast service.

## RPC

Official network metadata: https://github.com/PharosNetwork/pharos-skill-engine/blob/main/assets/networks.json. Mainnet RPC was independently verified from the standalone process. Read allowlist, expected chain ID, timeouts and 429 backoff are enforced. No signing or eth_sendRawTransaction method exists in the shared RPC wrapper.

## Developer documentation

The Pharos team confirmed llms.txt as the Dev Docs interface. The official agent-center page links its download button to https://www.pharos.xyz/llms.txt, which was fetched successfully. The earlier /agent-center/llms.txt copy text is stale (404). Default DOCS_MODE=index retrieves canonical Markdown documents listed by the working index and returns source-backed excerpts, with found:false for missing evidence. Live evidence covers three queries, a no-match query and two docs-to-chain balanceOf calls on WPROS/USDC.

Transport is accurately reported as HTTPS official-index, not JSON-RPC MCP. The separate optional SDK connection remains available for an operator-supplied Docs MCP server, with discovered tool/schema selection. Only canonical Pharos HTTPS origins are fetched; document instructions are never executed.

## SkillEngine

Official source https://github.com/PharosNetwork/pharos-skill-engine, matching supplied setup command. The package consists of SKILL.md, network/token assets, Foundry references and generated interaction-script templates. It is not an HTTP skill service. Source snapshot is preserved in vendor; project-specific Skills invoke the JavaScript CLI. Foundry version and an actual mainnet balance read were verified. Linux/macOS require cast on PATH; Windows optional npm platform binary is installed by npm ci.

No private-key workflow from upstream examples is exposed in this application. User signing stays in the browser wallet. All Foundry calls use execFile argument arrays, bounded output, timeout and hidden Windows execution.

## Protocol configuration

For numeric reads supply `kind:contract`, `address`, complete view-function `abi`, `function`, `args`, `index` and `decimals`. Only view/pure ABI sources are accepted. Native balance, gas and block sources are also supported. Source transport is rpc, mcp or skill. Numeric calculation uses Decimal.js and BigInt. Prices must use identical quote/base units; yields must be APR fractions; debt/collateral must share quote units. The application does not fabricate protocol discovery or prices.

Aggregator accepts at least two actual ERC-4626 vault addresses and reads asset/balanceOf/convertToAssets/previewDeposit/previewWithdraw/maxDeposit/maxWithdraw. Non-ERC-4626 protocols need explicit new adapters and tests. No vault deployment is invented.

## Channels and wallets

Notifications use real Discord webhooks or Telegram sendMessage with server-side credentials. C11 supports console; C14 requires an external channel. No external channel was configured during verification. Delivery-uncertain state is never blindly retried, preventing duplicate alerts at the expense of manual recovery.

Wallets implement EIP-1193. The browser requires matching chain/account, explicit authorization, a fresh server simulation and wallet signature. Exact transactions are matched on return; receipt status and confirmations determine settlement. No wallet was connected and no funds were moved during verification.
