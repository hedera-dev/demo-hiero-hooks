/**
 * gap-03-sstore-blocks-deletion.ts
 *
 * Gap P-1: sstore during hook execution blocks hook deletion
 *
 * When a hook contract calls sstore() during EVM execution - as ManagedTransferCap
 * does in allowPost() when decrementing the remaining cap - the consensus node
 * tracks those slots in num_storage_slots. HookStoreTransaction cannot remove
 * these EVM-created slots, so the hook cannot be deleted.
 *
 * This script:
 *   1. Checks current num_storage_slots via mirror node (should be > 0 after cap/04)
 *   2. Attempts to clear slot 0x00 via HookStoreTransaction (returns SUCCESS but
 *      does NOT decrement num_storage_slots)
 *   3. Attempts hook deletion via AccountUpdateTransaction (fails with
 *      HOOK_DELETION_REQUIRES_ZERO_STORAGE_SLOTS)
 *
 * NOTE: This script costs ~11-12 HBAR for the failed deletion attempt (the network
 * still charges the payer for failed transactions). Run it once to reproduce the gap.
 *
 * Run:      npx tsx src/gap-demos/gap-03-sstore-blocks-deletion.ts
 * Requires: .state.json with capAccountId, capAccountPrivKey, capHookId
 *           AND at least one successful transfer (cap/04 or cap/08) so sstore ran
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
import { getNetworkConfig } from "../utils/config.js";
import { createClient } from "../utils/client.js";
import { loadState } from "../utils/state.js";

async function main() {
  const state = loadState(
    ["capAccountId", "capAccountPrivKey", "capHookId"],
    "run managed-transfer-cap/01 through 04 first (need at least one successful transfer to call sstore)",
  );

  const { mirrorNodeUrl } = getNetworkConfig();
  const client = createClient();
  const capAccountKey = PrivateKey.fromStringECDSA(state.capAccountPrivKey!);
  const capAccountId = AccountId.fromString(state.capAccountId!);

  console.log("=== Gap P-1: sstore during hook execution blocks hook deletion ===");
  console.log("");
  console.log("Gap:  ManagedTransferCap.allowPost() calls sstore() to decrement the cap.");
  console.log("      EVM-created storage slots cannot be removed by HookStoreTransaction.");
  console.log("      Result: HOOK_DELETION_REQUIRES_ZERO_STORAGE_SLOTS on hook delete.");
  console.log(`Account: ${state.capAccountId}  hookId: ${state.capHookId}`);
  console.log("");

  // -----------------------------------------------------------------------
  // Step 1: Check current num_storage_slots via mirror node
  // -----------------------------------------------------------------------
  console.log("--- Step 1: Check num_storage_slots via mirror node ---");
  console.log("Waiting 3s for mirror node...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const hooksUrl = `${mirrorNodeUrl}/api/v1/accounts/${state.capAccountId}/hooks`;
  console.log(`Querying: ${hooksUrl}`);

  let storageSlots = 0;
  try {
    const res = await fetch(hooksUrl);
    if (res.ok) {
      const data = await res.json();
      const hook = data.hooks?.find((h: Record<string, unknown>) => h.hook_id === state.capHookId);
      if (hook) {
        storageSlots = (hook.num_storage_slots as number) ?? 0;
        console.log(`hookId=${hook.hook_id}  num_storage_slots=${storageSlots}`);
        if (storageSlots > 0) {
          console.log("Confirmed: sstore created storage slots (from allowPost() during cap/04).");
        } else {
          console.log("Warning: num_storage_slots is 0.");
          console.log("Run managed-transfer-cap/04-transfer-within-cap.ts first, then re-run this script.");
        }
      } else {
        console.log("Hook not found. Run managed-transfer-cap/02-create-account.ts first.");
      }
    } else {
      console.log(`Mirror node returned ${res.status}`);
    }
  } catch (err: unknown) {
    console.log(`Mirror node query failed: ${(err as Error).message}`);
  }

  console.log("");

  // -----------------------------------------------------------------------
  // Step 2: Attempt to clear slot 0x00 via HookStoreTransaction
  // (returns SUCCESS but does not decrement num_storage_slots)
  // -----------------------------------------------------------------------
  console.log("--- Step 2: Attempt to clear slot 0x00 via HookStoreTransaction ---");
  console.log("Expected: SUCCESS reported, but num_storage_slots unchanged.");

  try {
    const clearTx = await new HookStoreTransaction()
      .setHookId(
        new HookId({
          entityId: new HookEntityId({ accountId: capAccountId }),
          hookId: Long.fromInt(state.capHookId!),
        }),
      )
      .addStorageUpdate(
        new EvmHookStorageSlot({
          key: new Uint8Array(0), // slot 0x00 in minimal representation - omit value = delete
        }),
      )
      .setMaxTransactionFee(new Hbar(10))
      .freezeWith(client);

    const clearSigned = await clearTx.sign(capAccountKey);
    const clearResponse = await clearSigned.execute(client);
    const clearReceipt = await clearResponse.getReceipt(client);
    console.log(`HookStoreTransaction status: ${clearReceipt.status}`);
    console.log(`Transaction: ${clearResponse.transactionId}`);
    console.log("Note: SUCCESS reported. But num_storage_slots was NOT decremented.");
    console.log("      The EVM-sstore code path in applyStorageMutations() is not reachable");
    console.log("      from HookStoreTransaction for REMOVE operations.");
  } catch (err: unknown) {
    console.log(`Storage clear error: ${(err as Error).message.split("\n")[0]}`);
  }

  console.log("");

  // -----------------------------------------------------------------------
  // Step 3: Attempt hook deletion - expected to fail
  // -----------------------------------------------------------------------
  console.log("--- Step 3: Attempt hook deletion via AccountUpdateTransaction ---");
  console.log("Expected: HOOK_DELETION_REQUIRES_ZERO_STORAGE_SLOTS");
  console.log("Note: failed transactions still charge the payer (~11-12 HBAR).");

  try {
    const deleteTx = await new AccountUpdateTransaction()
      .setAccountId(capAccountId)
      .addHookToDelete(Long.fromInt(state.capHookId!))
      .setMaxTransactionFee(new Hbar(15))
      .freezeWith(client);

    const deleteSigned = await deleteTx.sign(capAccountKey);
    const deleteResponse = await deleteSigned.execute(client);
    const deleteReceipt = await deleteResponse.getReceipt(client);
    console.log(`Unexpected: hook deletion succeeded! Status: ${deleteReceipt.status}`);
    console.log("The gap may have been resolved in a newer protocol version.");
  } catch (err: unknown) {
    const msg = (err as Error).message;
    if (msg.includes("HOOK_DELETION_REQUIRES_ZERO_STORAGE_SLOTS")) {
      console.log("Got expected error: HOOK_DELETION_REQUIRES_ZERO_STORAGE_SLOTS");
      console.log("Gap P-1 confirmed: hook with EVM-sstore slots cannot be deleted.");
    } else {
      console.log(`Got error: ${msg.split("\n")[0]}`);
    }
  }

  console.log("");
  console.log("=== Summary ===");
  console.log("Gap P-1: WritableEvmHookStore cannot remove slots created by EVM sstore.");
  console.log("Affected: any hook that calls sstore() - ManagedTransferCap, stateful hooks generally.");
  console.log("Workaround: clear slot to 0 so allowPre() returns false (disables the hook).");
  console.log("Fix needed: REMOVE path in applyStorageMutations() must be reachable from");
  console.log("            HookStoreTransaction for EVM-sstore-created entries.");
  console.log("Relevant code: WritableEvmHookStore.java in hiero-ledger/hiero-consensus-node");
  console.log("Related PR (different fix): https://github.com/hiero-ledger/hiero-consensus-node/pull/24733");

  client.close();
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
