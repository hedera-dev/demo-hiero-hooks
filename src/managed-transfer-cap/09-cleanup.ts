/**
 * managed-transfer-cap/09-cleanup.ts
 *
 * Cleans up hook state created by the ManagedTransferCap demo:
 *   Phase 1: Clear slot 0x00 via HookStoreTransaction (omit value for deletion)
 *   Phase 2: Attempt hook deletion via AccountUpdateTransaction.addHookToDelete()
 *   Phase 3: Query mirror node to verify
 *   Phase 4: Remove ManagedTransferCap keys from .state.json
 *
 * Known gap: HOOK_DELETION_REQUIRES_ZERO_STORAGE_SLOTS may reject the deletion
 * if storage clearance did not propagate. The script handles this gracefully.
 *
 * Run: npx tsx src/managed-transfer-cap/09-cleanup.ts
 * Requires: .state.json with capContractId, capAccountId, capAccountPrivKey, capHookId, capTokenId
 */

import Long from "long";
import {
  HookStoreTransaction,
  AccountUpdateTransaction,
  HookId,
  HookEntityId,
  AccountId,
  PrivateKey,
  Hbar,
  EvmHookStorageSlot,
} from "@hiero-ledger/sdk";
import { createClient } from "../utils/client.js";
import { getNetworkConfig } from "../utils/config.js";
import { recordCost } from "../utils/cost.js";
import { loadState, removeStateKeys } from "../utils/state.js";

async function main() {
  const state = loadState(
    ["capContractId", "capAccountId", "capAccountPrivKey", "capHookId", "capTokenId"],
    "run managed-transfer-cap/01-deploy.ts through managed-transfer-cap/08-transfer-after-increase.ts first",
  );

  const { mirrorNodeUrl } = getNetworkConfig();
  const client = createClient();
  const capAccountKey = PrivateKey.fromStringECDSA(state.capAccountPrivKey!);
  const capAccountId = AccountId.fromString(state.capAccountId!);

  console.log("=== Step 9: Cleanup - Delete ManagedTransferCap Hook ===");
  console.log(`Cap account: ${state.capAccountId}, hookId=${state.capHookId}`);

  // ---------------------------------------------------------------
  // Phase 1: Clear slot 0x00 via HookStoreTransaction
  // ---------------------------------------------------------------
  console.log("\n--- Phase 1: Clear hook storage (slot 0x00) ---");
  try {
    // Omitting value in EvmHookStorageSlot signals deletion of that slot
    const clearTx = await new HookStoreTransaction()
      .setHookId(
        new HookId({
          entityId: new HookEntityId({ accountId: capAccountId }),
          hookId: Long.fromInt(state.capHookId!),
        }),
      )
      .addStorageUpdate(
        new EvmHookStorageSlot({
          key: new Uint8Array(0), // slot 0x00 in minimal representation
        }),
      )
      .setMaxTransactionFee(new Hbar(10))
      .freezeWith(client);

    const clearSigned = await clearTx.sign(capAccountKey);
    const clearResponse = await clearSigned.execute(client);
    const clearReceipt = await recordCost(
      "managed-transfer-cap/09-cleanup",
      "HookStoreTransaction (clear slot 0x00)",
      clearResponse,
      client,
    );
    console.log(`Slot 0x00 cleared. Status: ${clearReceipt?.status ?? "unknown"}`);
  } catch (err: unknown) {
    console.error(`Storage clearance failed: ${(err as Error).message.split("\n")[0]}`);
  }

  // ---------------------------------------------------------------
  // Phase 2: Delete hook via AccountUpdateTransaction
  // ---------------------------------------------------------------
  console.log("\n--- Phase 2: Delete hook ---");
  let hookDeleted = false;

  try {
    console.log(`Deleting hookId=${state.capHookId} from account ${state.capAccountId}...`);

    const deleteHookTx = await new AccountUpdateTransaction()
      .setAccountId(capAccountId)
      .addHookToDelete(Long.fromInt(state.capHookId!))
      .setMaxTransactionFee(new Hbar(15))
      .freezeWith(client);

    const deleteHookSigned = await deleteHookTx.sign(capAccountKey);
    const deleteHookResponse = await deleteHookSigned.execute(client);
    const deleteHookReceipt = await recordCost(
      "managed-transfer-cap/09-cleanup",
      "AccountUpdate (delete ManagedTransferCap hook)",
      deleteHookResponse,
      client,
    );
    console.log(`Hook deleted. Status: ${deleteHookReceipt?.status ?? "unknown (check transaction on HashScan)"}`);
    hookDeleted = true;
  } catch (err: unknown) {
    const errorMsg = (err as Error).message;
    if (errorMsg.includes("HOOK_DELETION_REQUIRES_ZERO_STORAGE_SLOTS")) {
      console.warn("Known gap: HOOK_DELETION_REQUIRES_ZERO_STORAGE_SLOTS");
      console.warn("The network requires all hook storage slots to be cleared before deletion.");
      console.warn("Storage clearance may not have propagated yet. Try again after a few seconds.");
    } else {
      console.error(`Hook deletion failed: ${errorMsg.split("\n")[0]}`);
    }
  }

  // ---------------------------------------------------------------
  // Phase 3: Mirror node verification
  // ---------------------------------------------------------------
  console.log("\n--- Phase 3: Mirror node verification ---");
  console.log("Waiting 5 seconds for mirror node propagation...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const hooksUrl = `${mirrorNodeUrl}/api/v1/accounts/${state.capAccountId}/hooks`;
  console.log(`Querying: ${hooksUrl}`);
  try {
    const res = await fetch(hooksUrl);
    if (!res.ok) {
      console.log(`Mirror node returned ${res.status}`);
    } else {
      const data = await res.json();
      const hook = data.hooks?.find((h: Record<string, unknown>) => h.hook_id === state.capHookId);
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
  // Phase 4: Remove ManagedTransferCap keys from local state
  // ---------------------------------------------------------------
  console.log("\n--- Phase 4: Local cleanup ---");
  removeStateKeys(["capContractId", "capAccountId", "capAccountPrivKey", "capTokenId", "capHookId"]);
  console.log("Removed ManagedTransferCap keys from .state.json");

  console.log(
    `\nManagedTransferCap cleanup complete: ${hookDeleted ? "deleted successfully" : "deletion failed or deferred"}`,
  );
  console.log("To re-run the demo, start from managed-transfer-cap/01-deploy.ts.");

  client.close();
}

main().catch((err) => {
  console.error("Cleanup failed:", err.message);
  process.exit(1);
});
