/**
 * managed-transfer-cap/04-transfer-within-cap.ts
 *
 * Transfers 200 MCT tokens from the operator to the cap account WITH a hook
 * reference. The ManagedTransferCap hook runs in two phases:
 *   - allowPre(): checks 200 <= 500 (remaining cap) -> returns true
 *   - allowPost(): deducts 200 from 500 -> writes 300 back to slot 0x00
 *
 * Uses PRE_POST_TX_ALLOWANCE_HOOK (two-phase dispatch) instead of
 * PRE_TX_ALLOWANCE_HOOK (single-phase).
 *
 * Run: npx tsx src/managed-transfer-cap/04-transfer-within-cap.ts
 * Requires: .state.json with capAccountId, capTokenId, capHookId
 * Expected: transfer succeeds; remaining cap reduced from 500 to 300
 */

import Long from "long";
import {
  TransferTransaction,
  FungibleHookCall,
  FungibleHookType,
  EvmHookCall,
  Hbar,
  TokenId,
  AccountId,
} from "@hiero-ledger/sdk";
import { createClient } from "../utils/client.js";
import { getNetworkConfig } from "../utils/config.js";
import { recordCost } from "../utils/cost.js";
import { loadState } from "../utils/state.js";

const TRANSFER_AMOUNT = 200;

async function main() {
  const state = loadState(
    ["capAccountId", "capTokenId", "capHookId"],
    "run managed-transfer-cap/01-deploy.ts through managed-transfer-cap/03-set-cap.ts first",
  );
  const { operatorId } = getNetworkConfig();
  const client = createClient();

  const tokenId = TokenId.fromString(state.capTokenId!);
  const capAccountId = AccountId.fromString(state.capAccountId!);
  const operatorAccountId = AccountId.fromString(operatorId);

  console.log("=== Step 4: Transfer Within Cap (200 tokens) ===");
  console.log(`Sending ${TRANSFER_AMOUNT} MCT tokens:`);
  console.log(`  From: ${operatorId} (operator)`);
  console.log(`  To:   ${capAccountId} (receiver_sig_required=true)`);
  console.log(`  Hook: hookId=${state.capHookId}`);
  console.log(`  Type: PRE_POST_TX_ALLOWANCE_HOOK (two-phase: allowPre + allowPost)`);
  console.log("\nExpected: 200 <= 500 cap -> approved; remaining cap becomes 300.");
  console.log("Submitting TransferTransaction...");

  // FungibleHookCall references the hook by its client-chosen hookId.
  // PRE_POST_TX_ALLOWANCE_HOOK fires both allowPre() and allowPost().
  // gasLimit is higher than HelloHooks because of array iteration in _calculateCredit().
  const hookCall = new FungibleHookCall({
    hookId: Long.fromInt(state.capHookId!),
    evmHookCall: new EvmHookCall({ gasLimit: Long.fromInt(100_000) }),
    type: FungibleHookType.PRE_POST_TX_ALLOWANCE_HOOK,
  });

  const transferTx = await new TransferTransaction()
    .addTokenTransfer(tokenId, operatorAccountId, -TRANSFER_AMOUNT)
    .addTokenTransferWithHook(tokenId, capAccountId, TRANSFER_AMOUNT, hookCall)
    .setMaxTransactionFee(new Hbar(10))
    .execute(client);

  const receipt = await recordCost(
    "managed-transfer-cap/04-transfer-within-cap",
    "TransferTransaction (HTS + hook invocation, within cap)",
    transferTx,
    client,
  );
  if (!receipt) throw new Error("Transaction failed - could not retrieve receipt");

  console.log(`\nTransfer succeeded! Status: ${receipt.status}`);
  console.log(`Transaction ID: ${transferTx.transactionId}`);
  console.log("\nallowPre() approved (200 <= 500), allowPost() deducted 200.");
  console.log("Remaining cap is now 300 token units.");

  client.close();
}

main().catch((err) => {
  console.error("Transfer failed:", err.message);
  process.exit(1);
});
