/**
 * hello-hooks/04-trigger-wrong-amount.ts
 *
 * Sends 2 HBAR to the test account WITH a hook reference. The HelloHooks
 * hook inspects ProposedTransfers and rejects the transfer because the
 * amount is not exactly 1 HBAR.
 *
 * Expected: REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK
 *
 * Run: npx tsx src/hello-hooks/04-trigger-wrong-amount.ts
 * Requires: .state.json with testAccountId, hookId
 */

import Long from "long";
import {
  TransferTransaction,
  FungibleHookCall,
  FungibleHookType,
  EvmHookCall,
  Hbar,
  AccountId,
} from "@hiero-ledger/sdk";
import { createClient } from "../utils/client.js";
import { getNetworkConfig } from "../utils/config.js";
import { recordCost } from "../utils/cost.js";
import { loadState } from "../utils/state.js";

const WRONG_AMOUNT_HBAR = 2; // Not 1 HBAR - hook will reject

async function main() {
  const state = loadState(
    ["contractId", "testAccountId", "hookId"],
    "run hello-hooks/01-deploy.ts and hello-hooks/02-create-account.ts first",
  );
  const { operatorId } = getNetworkConfig();
  const client = createClient();

  const testAccountId = AccountId.fromString(state.testAccountId!);
  const operatorAccountId = AccountId.fromString(operatorId);

  console.log("=== Step 4: Transfer Wrong Amount (Hook Rejects) ===");
  console.log(`Sending ${WRONG_AMOUNT_HBAR} HBAR (not exactly 1 - hook will reject):`);
  console.log(`  From: ${operatorId} (operator)`);
  console.log(`  To:   ${testAccountId}`);
  console.log(`  Hook: hookId=${state.hookId}`);
  console.log("\nExpected: allow() returns false -> REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK");
  console.log("Submitting TransferTransaction...");

  const hookCall = new FungibleHookCall({
    hookId: Long.fromInt(state.hookId!),
    evmHookCall: new EvmHookCall({ gasLimit: Long.fromInt(100_000) }),
    type: FungibleHookType.PRE_TX_ALLOWANCE_HOOK,
  });

  const transferTx = await new TransferTransaction()
    .addHbarTransfer(operatorAccountId, new Hbar(-WRONG_AMOUNT_HBAR))
    .addHbarTransferWithHook(testAccountId, new Hbar(WRONG_AMOUNT_HBAR), hookCall)
    .setMaxTransactionFee(new Hbar(10))
    .execute(client);

  // Record cost (fee is charged even for rejected transfers)
  await recordCost(
    "hello-hooks/04-trigger-wrong-amount",
    "TransferTransaction (2 HBAR + hook invocation - rejected)",
    transferTx,
    client,
  );

  try {
    const receipt = await transferTx.getReceipt(client);
    console.log(`\nTransfer status: ${receipt.status}`);
    console.log("Unexpected: wrong amount was not rejected.");
    console.log("Verify that the deployed contract is HelloHooks with the 1 HBAR check.");
  } catch (err: unknown) {
    const message = (err as Error).message;
    const isRejection =
      message.includes("REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK") || message.includes("FAIL_INVALID");
    if (isRejection) {
      console.log(`\nTransfer correctly rejected: ${message}`);
      console.log("Hook enforcement is working - 2 HBAR is not exactly 1 HBAR.");
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
