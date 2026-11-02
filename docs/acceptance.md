# Numbered requirement → component → verification

All 17 source images were inspected before implementation. The team subsequently confirmed llms.txt as the intended Dev Docs service; its working download was found on the official agent-center page. Cxx.n follows screenshot order and numbered rows. “Unit” means isolated fixtures, **not live integration acceptance**. “Live” points to saved real evidence. Module paths below are under `backend/src/modules/`. Tests are in `backend/test/modules.test.js` (matching Cxx prefix) and `infrastructure.test.js` where noted. UI configuration is in `shared/catalog.js`; each row has a dedicated navigation entry.

| Requirement | Implementation | Test or demonstration | Result |
|---|---|---|---|
| C01.1 Natural-language question input | doc-search.js; scripts/cli.js | C01 question forwarding; three API/CLI-equivalent inputs | Unit and live Dev Docs passed |
| C01.2 Concise answer with source references | infrastructure/docs.js | C01 and Docs MCP no-source test; maximum answer length and extracted references | Unit and live sourced output passed |
| C01.3 Graceful no-good-answer response | docs.js found:false branch | C01 no-match and no-source test | Unit passed |
| C01.4 README installation, usage, 3 queries with outputs | README and evidence/demo-readonly.json | Three recorded request/output pairs | Documented; three successful queries in docs-demo.json |
| C02.1 >=3 independent on-chain conditions | threshold.js / observations | C02 three-source test; demo-readonly fire run | Unit and live passed |
| C02.2 Configurable conditions/thresholds | threshold schema and workspace | C02 threshold change | Unit and live passed |
| C02.3 Values/pass-fail/final decision trace | threshold.js / Runner | C02 trace assertion; saved run | Unit and live passed |
| C02.4 Fire and hold demonstrations | scripts/demo-readonly.js | Both live outputs captured | Live passed |
| C03.1 >=3 dependent receipt-checked steps | saga.js; wallet.js reconcile | C03 success and pending-receipt tests | Unit passed; live funded-wallet demo pending |
| C03.2 Defined transient retry policy | saga attempts/maxRetries/retryAfterMs | C03 transient then exhaustion test | Unit passed; retries resume on explicit advance; uncertain sends never repeated |
| C03.3 Permanent-failure compensation path and demo | saga recover, reverse completed list | C03 forced-failure and reverse compensation fixture | Unit demo passed; actual compensation tx pending |
| C03.4 State log at every step | saga trace in SQLite | C03 trace; SQLite restart test | Unit passed |
| C03.5 Full success and forced failure/recovery runs | saga workflow fixture | C03 tests | Unit demos passed; on-chain demonstrations pending |
| C04.1 >=2 price sources same scan | arbitrage.js; common-block observations | C04 arithmetic fixture and source validation | Unit passed; actual price contracts pending |
| C04.2 Net after swap fees/slippage/gas | calculate using Decimal.js | C04 exact 14.7 result | Unit passed; configured estimates require operator validation |
| C04.3 Prepare only above configurable threshold; skip reason | arbitrage decision and wallet gate | C04 prepare/skip threshold test | Unit passed; real route payload pending |
| C04.4 Gross/cost/net/decision log every scan | Runner stores full result | C04 result fields; Runner persistence | Unit passed |
| C04.5 Safe testnet or simulated/prepared execution | Unsigned route intent, separate wallet consent | Wallet tests; no backend broadcast method | Implemented; no funds risked |
| C05.1 Simulate via call/estimate without broadcast | wallet.simulate | Wallet simulation tests; live zero-balance dry-run | Unit and live rejection passed |
| C05.2 Success/revert/reason/gas cost | wallet.simulate structured result | C05 + wallet gas margin/revert tests | Unit passed; live failure captured |
| C05.3 Before/after where possible | native balance and conservative gas projection | Wallet gas-budget test | Implemented for native balance; arbitrary state diffs explicitly unavailable |
| C05.4 Failed simulation blocks execution | dry-run.js and wallet.prepare/claim | C05 no prepare assertion | Unit and live rejection passed |
| C06.1 Persist across runs | trend.js / SQLite state | C06 and SQLite restart test | Unit passed |
| C06.2 Configurable trend requires >=3 observations | trend schema / trendMet | C06 minimum and descending test | Unit passed |
| C06.3 Restart without loss/duplicates | block dedup, SQLite | C06 repeated block + SQLite restart | Unit passed |
| C06.4 History and exact trigger moment | history/triggers fields | C06 state; demo procedure below | Implemented; live trend sequence pending |
| C06.5 Single spike does not trigger | trendMet strict multi-point rule | C06 single spike fixture | Unit demo passed |
| C07.1 Spend/allowlist/time-window config | policy schema/evaluate | C07 three rule tests | Unit passed |
| C07.2 Allow/deny and deciding rule | policy result/trace | C07 decisions | Unit passed |
| C07.3 Deny never executes; denial for each rule | policy gate and claim recheck | C07 three denials + prepare never called | Unit demo passed |
| C07.4 Audit all decisions | SQLite policy event + execution | C07 audit assertion | Unit passed |
| C08.1 Skill depends on same-flow live Chain MCP | skill-chain.js → decide → chain.call | C08 fixture + browser live run | Live decision passed; official package/runtime verified |
| C08.2 End-to-end single user request | POST /api/run/skill-chain | Browser Run module → FIRE | Live passed |
| C08.3 Flow diagram/write-up | architecture.md | Inspection of documented call sequence | Documented |
| C08.4 Real data through both tools | official Skill package convention + MCP evidence into JS decision | evidence/demo-readonly.json, live-check.json | Live MCP + installed-runtime evidence; no remote SkillEngine API exists |
| C09.1 Docs MCP explanation with sources | docs-chain.js / docs.search | C09 source gating | Unit and live team-confirmed Dev Docs passed |
| C09.2 Call same function through Chain MCP | encoded function from same descriptor | C09 two-functions test | Unit and live composed flow passed |
| C09.3 Interpret result in explanation context | decoded output/index/units + explanation | C09 output assertion | Unit and live passed; deterministic interpretation |
| C09.4 >=2 functions/contracts | generic ABI descriptor | C09 value/otherValue fixtures | Unit and live passed on WPROS and USDC |
| C10.1 >=3 live yield sources | yield.js / observations | C10 three-source fixture | Unit passed; live APR contracts pending |
| C10.2 Gas, entry/exit, holding period | Decimal net incremental yield | C10 cost fields and days | Unit passed |
| C10.3 Net recommendation or stay-put reason | sorted candidates and baseline | C10 output; formula review | Unit passed; live comparison pending |
| C10.4 If executing, unsigned only; no keys | recommendation-only module | Review: no execution/signing path | Satisfied by recommendation-only scope |
| C11.1 Live collateral/debt/health | three configured chain sources | C11 fixture and upstream-failure test | Unit passed; lending contract config pending |
| C11.2 Configurable warning/critical | liquidation schema/ordering | C11 severity test | Unit passed |
| C11.3 Timestamped console or external alert | Notifications.send | C11 delivery fixture; console infrastructure test | Unit passed; real position alert pending |
| C11.4 Concrete repay/add-collateral suggestion | proportional health recovery calculation | C11 positive repayment assertion | Unit passed; assumptions explicitly reported |
| C12.1 Weekly/monthly, amount/token/recipient | recurring schema and dueDate | C12 weekly and Jan-31 month anchor | Unit passed |
| C12.2 Timely prepare and paid/pending/failed | Scheduler + payment intent reconciliation | C12 pending/paid; scheduler tests | Unit passed; requires online backend and live wallet demo |
| C12.3 Insufficient funds/failure without double-pay | payment preflight, stable period key, locked intents | Wallet tests; C12 duplicate prevention | Unit passed; actual failed payment demo pending |
| C12.4 History and next scheduled payment | persisted payments/nextDue | C12 index and status assertions | Unit passed |
| C13.1 Two formats, payee/amount/token/reference | strict JSON and labelled-text parsers | C13 equal JSON/text fixture | Unit passed |
| C13.2 Missing/mismatch flagged, never guessed | strict schema, duplicate fields, invoice reference check | C13 missing/duplicate/ambiguous tests | Unit passed |
| C13.3 Summary + unsigned tx with reference | wallet.payment UTF-8 calldata; intent metadata | invoice/payment implementation and parser tests | Implemented; live token-specific compatibility pending |
| C13.4 Demo sample invoices | config/sample-invoice.json and .txt | C13 parser demo; see below | Unit demo passed; samples explicitly DO-NOT-PAY |
| C14.1 Configurable condition | alert schema and source adapter | C14 threshold fixture | Unit passed |
| C14.2 Real Telegram/Discord channel | actual HTTPS channel clients | Missing-channel infrastructure test | Implemented; external delivery blocked by absent credentials |
| C14.3 Event/value/explorer link | alert payload | C14 result and code path | Unit passed; actual delivery pending |
| C14.4 No repeat spam | persistent crossing state + delivery reservation | C14 repeated threshold and notification dedup tests | Unit passed |
| C15.1 >=5 configurable addresses | distinct-address guard and schema | C15 distinct/duplicate tests | Unit passed |
| C15.2 Significant per-token threshold | token list + Decimal threshold | C15 fixture; threshold branch | Implemented; live configured watch demo pending |
| C15.3 What/amount/destination/known labels | ERC-20 decoded report and labels | C15 empty-state, decoder shared behavior | Implemented; significant-transfer report demo pending |
| C15.4 Summary across watched addresses | durable recent event view | C15 recent output | Implemented; live watchlist pending |
| C16.1 >=2 protocols/vaults in one interface | two distinct ERC-4626 descriptors | C16 two-venue test | Unit passed; real vault pair pending |
| C16.2 Positions/rates + unsigned deposit/withdraw | ERC-4626 adapter and wallet.prepare | C16 query fixture; wallet tests | Query unit passed; actual action demos pending |
| C16.3 Best venue and explanation | capacity filter + comparable preview ranking | C16 selection assertion | Unit passed; live ranking pending |
| C16.4 One unavailable protocol does not break others | per-venue exception isolation | C16 one-live/one-offline test | Unit passed |
| C16.5 Architecture write-up; video encouraged | architecture.md and this demo plan | Documentation inspection | Write-up supplied; video not produced |
| C17.1 Chain MCP contract+event-signature filters | events.js get_logs | C17 filter assertions; live-check logs | Unit and live passed |
| C17.2 Continuous polling; only new/no duplicates | Scheduler + transactional event/cursor writes | C17 duplicate test; scheduler test; live second poll | Unit and live polling/dedup passed |
| C17.3 Readable decoded fields | Interface.parseLog and named args | C17 from/to/value/hash/block | Unit and live passed |
| C17.4 Catch >=1 live/test event | scripts/live-check.js | Real WPROS transfers at blocks 21938257–21938306 | Live passed; tx hashes saved |

## Demonstration procedures

Each module: open its exact sidebar title, fill the documented input, click Run module, inspect Full result and evidence and the corresponding Execution history entry. Successful run status describes application execution, not transaction settlement. Use the CLI with the same exported JSON for reproducibility.

- C01: run the three README queries using index mode; show a nonsense query returning no answer. Verified in docs-demo.json.
- C02: `node scripts/demo-readonly.js` produces real fire and hold traces with three independent reads.
- C03: on Atlantic with a matching MCP and user wallet, supply three real dependent transactions and explicit compensation transactions. Authorize each step only after inspecting it. Rerun advance after receipt confirmation; then use a separate saga ID with a deliberately reverting third step. Recover prepares compensations in reverse order. Unit fixtures demonstrate this without risking funds.
- C04: configure two same-asset price sources and native-price source; inspect gross/fees/slippage/gas/net. Change minProfit to demonstrate skip. Use an operator-reviewed testnet route only; no atomic route is constructed automatically.
- C05: run a known reverting call and show no intent; run a funded testnet transfer to show gas/native balance projection and unsigned intent. No arbitrary storage diff is claimed.
- C06: select a real changing source, configure >=3 observations, Start monitor, restart backend, inspect history and trigger moment. Single-spike rejection is reproducible in the C06 unit test.
- C07: use the C07 unit tests to show each denial independently. For an allowed actual payment, set a short UTC window, exact native spend limit and allowlisted recipient; review any resulting signature yourself.
- C08: defaults query live gas via Chain MCP, verify installed SkillEngine/Foundry and yield a decision from one Run click. Both runtime and live evidence are saved.
- C09: use the documented balanceOf descriptors on WPROS and USDC. Both explain-then-call flows passed; sources and live results are in docs-demo.json. Without a sourced function match the flow stops.
- C10: configure three actual APR-fraction contracts sharing units; compare short and long holding periods and net gain. No transaction occurs.
- C11: configure position sources and threshold, use console or your own channel, show timestamp plus repayment estimate. Validate protocol-specific health mechanics before use.
- C12: create a weekly/monthly testnet schedule, run the backend continuously, inspect pending intent, sign yourself, reconcile and show next due. Stop/restart and verify the same period does not reappear as a fresh payment.
- C13: parse the two provided sample invoices in tests. In a wallet demo replace the sample payee/reference with your own testnet values; show missing-field rejection, summary and reference-bearing calldata.
- C14: configure your channel explicitly, choose a threshold crossing and show one real delivered message with explorer link; repeat poll and verify no duplicate. Channel delivery is not yet verified.
- C15: configure five actual watched addresses, token contracts, thresholds and labels; start at a block containing a known significant transfer; inspect aggregate activity. No generic label or transfer is fabricated.
- C16: configure two actual ERC-4626 vaults with the same asset; query, then disconnect one address/RPC fixture in isolated tests and show remaining result; prepare a deposit/withdrawal for your own testnet wallet.
- C17: use `config/events-live.json`, or supply a current starting block; Start monitor, inspect decoded event rows, repeat and restart. Live evidence includes real transfers and an empty second poll.

## Points and video requirements (separate from functional acceptance)

Easy 50 points: C01, C14, C17. Medium 100 points: C02, C05, C07, C08, C09, C11, C12, C13, C15. Hard 200 points: C03, C04, C06, C10, C16. Each screenshot lists +50 with video. Base total 2050; potential video bonus 850. These are screenshot values, **not awarded or earned points**. No video was recorded. C16 separately strongly encourages a demonstration video. C05's cropped WHAT TO SUBMIT content was not visible and is not inferred.
