/**
 * hello-hooks/06-cleanup.ts
 *
 * Cleans up hook state created by the HelloHooks demo:
 *   Phase 1: Delete hook from test account via AccountUpdateTransaction
 *   Phase 2: Query mirror node to confirm hook deletion
 *   Phase 3: Remove HelloHooks keys from .state.json (does NOT delete the file)
 *
 * The HelloHooks hook is stateless, so it deletes cleanly without
 * needing to clear storage first.
 *
 * This script only touches HelloHooks state (testAccountId, testAccountPrivKey,
 * hookId, contractId).
 *
 * Run: npx tsx src/hello-hooks/06-cleanup.ts
 * Requires: .state.json with testAccountId, testAccountPrivKey, hookId
 */

import Long from "long";
import { AccountUpdateTransaction, AccountId, PrivateKey, Hbar } from "@hiero-ledger/sdk";
import { createClient } from "../utils/client.js";
import { getNetworkConfig } from "../utils/config.js";
import { recordCost } from "../utils/cost.js";
import { loadState, removeStateKeys } from "../utils/state.js";

async function main() {
  const state = loadState(
    ["testAccountId", "testAccountPrivKey", "hookId"],
    "run hello-hooks/01-deploy.ts through hello-hooks/04-query.ts first",
  );

  const { mirrorNodeUrl } = getNetworkConfig();
  const client = createClient();

  console.log("=== Step 6: Cleanup - Delete HelloHooks Hook ===");
  console.log(`HelloHooks account: ${state.testAccountId}, hookId=${state.hookId}`);

  // ---------------------------------------------------------------
  // Phase 1: Delete hook via AccountUpdateTransaction
  // ---------------------------------------------------------------
  console.log("\n--- Phase 1: Delete hook ---");
  let hookDeleted = false;

  try {
    console.log(`Deleting hookId=${state.hookId} from account ${state.testAccountId}...`);
    const testAccountKey = PrivateKey.fromStringECDSA(state.testAccountPrivKey!);
    const testAccountId = AccountId.fromString(state.testAccountId!);

    const deleteHookTx = await new AccountUpdateTransaction()
      .setAccountId(testAccountId)
      .addHookToDelete(Long.fromInt(state.hookId!))
      .setMaxTransactionFee(new Hbar(15))
      .freezeWith(client);

    const deleteHookSigned = await deleteHookTx.sign(testAccountKey);
    const deleteHookResponse = await deleteHookSigned.execute(client);
    const deleteHookReceipt = await recordCost(
      "hello-hooks/05-cleanup",
      "AccountUpdate (delete HelloHooks hook)",
      deleteHookResponse,
      client,
    );
    console.log(
      `HelloHooks hook deleted. Status: ${deleteHookReceipt?.status ?? "unknown (check transaction on HashScan)"}`,
    );
    hookDeleted = true;
  } catch (err: unknown) {
    console.error(`HelloHooks hook deletion failed: ${(err as Error).message.split("\n")[0]}`);
  }

  // ---------------------------------------------------------------
  // Phase 2: Mirror node verification
  // ---------------------------------------------------------------
  console.log("\n--- Phase 2: Mirror node verification ---");
  console.log("Waiting 5 seconds for mirror node propagation...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const hooksUrl = `${mirrorNodeUrl}/api/v1/accounts/${state.testAccountId}/hooks`;
  console.log(`Querying: ${hooksUrl}`);
  try {
    const res = await fetch(hooksUrl);
    if (!res.ok) {
      console.log(`Mirror node returned ${res.status}`);
    } else {
      const data = await res.json();
      const hook = data.hooks?.find((h: Record<string, unknown>) => h.hook_id === state.hookId);
      if (hook) {
        console.log(`hookId=${hook.hook_id}, deleted=${hook.deleted} (expected: ${hookDeleted})`);
      } else {
        console.log("Hook not found in response (may already be purged).");
      }
    }
  } catch (err: unknown) {
    console.log(`Mirror node query failed: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------
  // Phase 3: Remove HelloHooks keys from local state
  // ---------------------------------------------------------------
  console.log("\n--- Phase 3: Local cleanup ---");
  removeStateKeys(["testAccountId", "testAccountPrivKey", "hookId", "contractId"]);
  console.log("Removed HelloHooks keys from .state.json");

  console.log(`\nHelloHooks cleanup complete: ${hookDeleted ? "deleted successfully" : "deletion failed"}`);
  console.log("To re-run the HelloHooks demo, start from hello-hooks/01-deploy.ts.");

  client.close();
}

main().catch((err) => {
  console.error("Cleanup failed:", err.message);
  process.exit(1);
});
