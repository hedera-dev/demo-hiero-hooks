/**
 * managed-transfer-cap/08-transfer-after-increase.ts
 *
 * Transfers 400 MCT tokens to the cap account after the cap was increased to
 * 1000. This transfer was previously rejected (managed-transfer-cap/05-transfer-exceeds-cap.ts) because
 * 400 > 300 remaining. Now with cap=1000, allowPre() approves (400 <= 1000)
 * and allowPost() deducts 400 from 1000 -> remaining becomes 600.
 *
 * Run: npx tsx src/managed-transfer-cap/08-transfer-after-increase.ts
 * Requires: .state.json with capAccountId, capTokenId, capHookId
 * Expected: transfer succeeds; remaining cap reduced from 1000 to 600
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

const TRANSFER_AMOUNT = 400;

async function main() {
  const state = loadState(
    ["capAccountId", "capTokenId", "capHookId"],
    "run managed-transfer-cap/01-deploy.ts through managed-transfer-cap/07-increase-cap.ts first",
  );
  const { operatorId } = getNetworkConfig();
  const client = createClient();

  const tokenId = TokenId.fromString(state.capTokenId!);
  const capAccountId = AccountId.fromString(state.capAccountId!);
  const operatorAccountId = AccountId.fromString(operatorId);

  console.log("=== Step 8: Transfer After Cap Increase (400 tokens) ===");
  console.log(`Sending ${TRANSFER_AMOUNT} MCT tokens:`);
  console.log(`  From: ${operatorId} (operator)`);
  console.log(`  To:   ${capAccountId} (receiver_sig_required=true)`);
  console.log(`  Hook: hookId=${state.capHookId}`);
  console.log(`  Type: PRE_POST_TX_ALLOWANCE_HOOK`);
  console.log("\nExpected: 400 <= 1000 cap -> approved; remaining cap becomes 600.");
  console.log("Submitting TransferTransaction...");

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
    "managed-transfer-cap/08-transfer-after-increase",
    "TransferTransaction (HTS + hook invocation, after cap increase)",
    transferTx,
    client,
  );
  if (!receipt) throw new Error("Transaction failed - could not retrieve receipt");

  console.log(`\nTransfer succeeded! Status: ${receipt.status}`);
  console.log(`Transaction ID: ${transferTx.transactionId}`);
  console.log("\nallowPre() approved (400 <= 1000), allowPost() deducted 400.");
  console.log("Remaining cap is now 600 token units.");

  client.close();
}

main().catch((err) => {
  console.error("Transfer failed:", err.message);
  process.exit(1);
});
