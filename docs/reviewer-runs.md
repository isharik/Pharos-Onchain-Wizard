# Reviewer runs: x402 Agent Buyer and Saga Executor

Both workflows require a browser wallet controlled by the reviewer or presenter. Never put a private key in this app, a repository, a video, or a support message. The app prepares transactions and asks the wallet to sign; the on-chain explorer is the independent record.

## Before recording

1. Connect a wallet with a small amount of Atlantic testnet PHRS for payments and gas. Verify the wallet is on chain `688689` in its network selector.
2. Open the browser developer console only if troubleshooting. Do not show wallet recovery phrases or environment secrets on screen.
3. Keep the app's History tab open after each run. Capture the transaction hash, receipt status, and explorer link for each signed step.

## x402 Agent Buyer: paid completion

1. Open **X402 Agent Buyer** and click **Load full purchase**. This fills the two OctoBot paid resources, `/data` and `/premium`, with a 0.015 PHRS budget and a 0.01 PHRS per-call cap, expressed in wei. The endpoints are live services; inspect their actual quoted prices before paying.
2. Click **Inspect paid APIs**. Both offers must say **approval required**. If an endpoint is asleep on Render, retry after it wakes; if the scheme, price, or recipient differs from the expected quote, stop and review it.
3. For the first offer, review the destination, amount, and Atlantic network. Tick the review box and click **Pay & unlock in wallet**. Confirm only if the wallet shows the same details.
4. Wait for the payment to settle. Open the explorer link and the **Purchased API result**. The persistent ledger should show the price, resource, transaction hash, and running total.
5. Repeat for the second resource. The page should show **2/2 resources purchased** and both real API results. Record both explorer transaction links.
6. Click **Load budget-stop run**, then **Inspect paid APIs**. Pay for the first resource with a separate wallet confirmation. The second offer must be refused because its price would exceed the 0.005 PHRS total budget. The page should show one purchase out of two requested resources, not a completed task. Record the first transaction link and the refusal reason.
7. If the wallet returned a transaction hash but API settlement is delayed, use **Verify existing payment**. The hash remains in this browser until verified. Do not press a new pay button or send a second transfer.

The OctoBot seller currently implements a Pharos native-transfer x402 scheme. Other x402 payment schemes are intentionally refused before wallet approval. The buyer does not claim a paid call succeeded until the seller returns a matching settlement receipt.

## Saga Executor: deploy once

1. Open [contracts/SagaDemo.sol](../contracts/SagaDemo.sol) in the repository and copy its source into a new file in Remix IDE.
2. In Remix, compile with Solidity `0.8.24` or a compatible newer `0.8.x` compiler. Select `SagaDemo`.
3. In **Deploy & Run Transactions**, choose **Injected Provider** and confirm the wallet is on Pharos Atlantic, chain `688689`. Deploy `SagaDemo` with no constructor arguments and no value. Save the deployed contract address and the deployment transaction link.
4. Run the app on Atlantic. If `.env` was copied from `.env.example`, change **all three** values below; the example file otherwise pins mainnet RPC and chain ID. Restart the backend and UI. On Vercel, set the same three environment variables in a separate Atlantic preview/project or temporarily in production, then redeploy. Confirm the feature header says **Pharos Atlantic · Chain 688689** before any saga transaction.

   ```dotenv
   PHAROS_NETWORK=atlantic-testnet
   PHAROS_RPC_URL=https://atlantic.dplabs-internal.com
   PHAROS_CHAIN_ID=688689
   ```

The fixture escrows a small PHRS amount. Only the wallet that starts a run can advance or recover it. Successful completion refunds the escrow. A failed third step can be compensated in reverse order: `rewind`, then `recover`, which refunds the escrow. Use a small amount such as `0.001` PHRS and keep extra testnet PHRS for gas.

## Saga Executor: successful run

1. Open **Saga Executor**, connect the same Atlantic wallet, paste the deployed contract address, leave **Force step three** unchecked, and click **Fill three-step workflow**.
2. Review the generated transactions: `start(runId)` with escrow value, `advance(runId)` with zero value, and `finish(runId,false)` with zero value. Leave the unique workflow ID unchanged throughout the run.
3. Click **Advance workflow**, review and sign the prepared first transaction. Use **Verify transaction / receipt** until it is confirmed. Then click **Check receipt & advance**.
4. Repeat for the second and third steps. Each next transaction is only prepared after the previous receipt is confirmed. Two extra confirmations may be needed after a transaction lands.
5. Confirm **complete**, three completed steps, three transaction links, and the final `Transition` event at stage `3` in the contract/explorer.

## Saga Executor: forced failure and recovery

1. Check **Force step three to fail before broadcast** and click **Fill three-step workflow**. This generates a new unique run ID. Keep the same deployed contract and wallet.
2. Sign and verify steps one and two as above. On step three, `finish(runId,true)` deliberately reverts during the app's simulation. The app records a permanent failure and does not send a reverting transaction or charge gas for it.
3. Click **Prepare / check recovery**. Review and sign the `rewind(runId)` compensation. Verify its receipt, then click **Prepare / check recovery** again.
4. Review and sign the `recover(runId)` compensation. Verify its receipt, then click **Prepare / check recovery** once more. The final status must be **compensated** and the contract run must be at stage `4` with zero escrow.
5. Capture the failure trace and the four explorer links: two forward transactions and two recovery transactions. A forced simulation failure has no transaction hash because it was intentionally blocked before broadcast.

## Evidence to submit

| Run | Evidence |
| --- | --- |
| Paid x402 completion | Two settlement ledger entries, purchased API results, two Atlantic explorer links, total spend |
| x402 budget stop | Refused second offer with the actual quoted price and budget reason |
| Saga success | Deployment link, three step links, complete state trace |
| Saga recovery | Two forward links, failed simulation trace, two compensation links, compensated state trace |

Unit tests and a successful build show that code paths are implemented; they do **not** replace these live, wallet-signed reviewer runs. Do not state that a live run passed until the corresponding hashes and receipts have been captured.
