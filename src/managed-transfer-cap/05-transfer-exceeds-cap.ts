/**
 * managed-transfer-cap/05-transfer-exceeds-cap.ts
 *
 * Attempts a 400 MCT token transfer to the cap account. After the previous
 * transfer of 200, the remaining cap is 300. Since 400 > 300, the hook's
 * allowPre() returns false and the transfer is rejected.
 *
 * Expected: REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK
 *
 * Run: npx tsx src/managed-transfer-cap/05-transfer-exceeds-cap.ts
 * Requires: .state.json with capAccountId, capTokenId, capHookId
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
    "run managed-transfer-cap/01-deploy.ts through managed-transfer-cap/04-transfer-within-cap.ts first",
  );
  const { operatorId } = getNetworkConfig();
  const client = createClient();

  const tokenId = TokenId.fromString(state.capTokenId!);
  const capAccountId = AccountId.fromString(state.capAccountId!);
  const operatorAccountId = AccountId.fromString(operatorId);

  console.log("=== Step 5: Transfer Exceeding Cap (400 tokens) ===");
  console.log(`Sending ${TRANSFER_AMOUNT} MCT tokens:`);
  console.log(`  From:      ${operatorId} (operator)`);
  console.log(`  To:        ${capAccountId} (receiver_sig_required=true)`);
  console.log(`  Hook:      hookId=${state.capHookId}`);
  console.log(`  Type:      PRE_POST_TX_ALLOWANCE_HOOK`);
  console.log("\nExpected: 400 > 300 remaining cap -> REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK");
  console.log("Submitting TransferTransaction...");

  const hookCall = new FungibleHookCall({
    hookId: Long.fromInt(state.capHookId!),
    evmHookCall: new EvmHookCall({ gasLimit: Long.fromInt(100_000) }),
    type: FungibleHookType.PRE_POST_TX_ALLOWANCE_HOOK,
  });

  // REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK is a consensus-level rejection: the tx reaches
  // the network, the hook runs and returns false, the transfer is denied. The fee IS
  // charged even though the transfer fails. We record it before checking the receipt.
  const transferTx = await new TransferTransaction()
    .addTokenTransfer(tokenId, operatorAccountId, -TRANSFER_AMOUNT)
    .addTokenTransferWithHook(tokenId, capAccountId, TRANSFER_AMOUNT, hookCall)
    .setMaxTransactionFee(new Hbar(10))
    .execute(client);

  await recordCost(
    "managed-transfer-cap/05-transfer-exceeds-cap",
    "TransferTransaction (HTS + hook invocation, exceeds cap - rejected)",
    transferTx,
    client,
  );

  try {
    const receipt = await transferTx.getReceipt(client);
    console.log(`\nTransfer status: ${receipt.status}`);
    console.log(`Transaction ID:  ${transferTx.transactionId}`);
    console.log("\nUnexpected: transfer was not rejected.");
    console.log("Verify that the deployed contract is from ManagedTransferCap.bytecode.txt.");
  } catch (err: unknown) {
    const isRejection =
      (err as Error).message.includes("REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK") ||
      (err as Error).message.includes("FAIL_INVALID");
    if (isRejection) {
      console.log(`\nTransfer correctly rejected: ${(err as Error).message}`);
      console.log("Hook enforcement is working - 400 exceeds remaining cap of 300.");
      console.log("Run managed-transfer-cap/07-increase-cap.ts to raise the cap.");
    } else {
      throw err;
    }
  }

  client.close();
}

main().catch((err) => {
  console.error("Unexpected error:", err.message);
  process.exit(1);
});
