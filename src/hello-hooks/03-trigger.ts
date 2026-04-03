/**
 * hello-hooks/03-trigger.ts
 *
 * Sends exactly 1 HBAR to the test account WITH a hook reference. The
 * HelloHooks hook inspects ProposedTransfers and approves only transfers
 * of exactly 1 HBAR to the hook owner.
 *
 * FungibleHookCall works for both HBAR and HTS fungible token transfers -
 * there is no separate HbarHookCall type.
 *
 * Run: npx tsx src/hello-hooks/03-trigger.ts
 * Requires: .state.json with testAccountId, hookId
 * Expected: Transfer succeeds (exactly 1 HBAR matches the hook's check)
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

const TRANSFER_AMOUNT_HBAR = 1;

async function main() {
  const state = loadState(
    ["contractId", "testAccountId", "hookId"],
    "run hello-hooks/01-deploy.ts and hello-hooks/02-create-account.ts first",
  );
  const { operatorId } = getNetworkConfig();
  const client = createClient();

  const testAccountId = AccountId.fromString(state.testAccountId!);
  const operatorAccountId = AccountId.fromString(operatorId);

  console.log("=== Step 3: Transfer Exactly 1 HBAR (Hook Approves) ===");
  console.log(`Sending ${TRANSFER_AMOUNT_HBAR} HBAR:`);
  console.log(`  From: ${operatorId} (operator)`);
  console.log(`  To:   ${testAccountId}`);
  console.log(`  Hook: hookId=${state.hookId}`);
  console.log("\nThe hook inspects ProposedTransfers and approves only exactly 1 HBAR.");
  console.log("Submitting TransferTransaction...");

  const hookCall = new FungibleHookCall({
    hookId: Long.fromInt(state.hookId!),
    evmHookCall: new EvmHookCall({ gasLimit: Long.fromInt(100_000) }),
    type: FungibleHookType.PRE_TX_ALLOWANCE_HOOK,
  });

  const transferTx = await new TransferTransaction()
    .addHbarTransfer(operatorAccountId, new Hbar(-TRANSFER_AMOUNT_HBAR))
    .addHbarTransferWithHook(testAccountId, new Hbar(TRANSFER_AMOUNT_HBAR), hookCall)
    .setMaxTransactionFee(new Hbar(10))
    .execute(client);

  const receipt = await recordCost(
    "hello-hooks/03-trigger",
    "TransferTransaction (1 HBAR + hook invocation)",
    transferTx,
    client,
  );
  if (!receipt) throw new Error("Transaction failed - could not retrieve receipt");

  console.log(`\nTransfer succeeded! Status: ${receipt.status}`);
  console.log(`Transaction ID: ${transferTx.transactionId}`);
  console.log("\nThe hook read ProposedTransfers, found exactly 1 HBAR credit, and approved.");

  client.close();
}

main().catch((err) => {
  console.error("Transfer failed:", err.message);
  console.error("\nIf REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK: the hook rejected the amount.");
  console.error("If FAIL_INVALID: hook EVM execution failed; verify bytecode.");
  process.exit(1);
});
