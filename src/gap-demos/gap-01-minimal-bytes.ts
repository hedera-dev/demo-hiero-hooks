/**
 * gap-01-minimal-bytes.ts
 *
 * Gap S-4: EVM_HOOK_STORAGE_UPDATE_BYTES_MUST_USE_MINIMAL_REPRESENTATION
 *
 * HookStoreTransaction requires all keys and values to use minimal big-endian
 * byte representation (no leading zeros). Slot 0x00 must be sent as empty bytes,
 * not 32 zero bytes. The hedera-docs PR #362 example code uses
 * new Uint8Array(32).fill(0) - this is the broken form that triggers the error.
 *
 * This script demonstrates the error by intentionally sending 32 zero bytes
 * for slot 0x00, then shows the correct form.
 *
 * Run:      npx tsx src/gap-demos/gap-01-minimal-bytes.ts
 * Requires: .state.json with capAccountId, capAccountPrivKey, capHookId
 *           (run managed-transfer-cap/01-deploy.ts and 02-create-account.ts first)
 */

import Long from "long";
import {
  HookStoreTransaction,
  HookId,
  HookEntityId,
  AccountId,
  PrivateKey,
  Hbar,
  EvmHookStorageSlot,
} from "@hiero-ledger/sdk";
import { createClient } from "../utils/client.js";
import { loadState } from "../utils/state.js";
import { toMinimalBytes } from "../utils/crypto.js";

function encodeUint256(value: number): Buffer {
  const buf = Buffer.alloc(32, 0);
  buf.writeBigUInt64BE(BigInt(value), 24);
  return buf;
}

async function main() {
  const state = loadState(
    ["capAccountId", "capAccountPrivKey", "capHookId"],
    "run managed-transfer-cap/01-deploy.ts and managed-transfer-cap/02-create-account.ts first",
  );

  const client = createClient();
  const capAccountKey = PrivateKey.fromStringECDSA(state.capAccountPrivKey!);
  const capAccountId = AccountId.fromString(state.capAccountId!);

  console.log("=== Gap S-4: EVM_HOOK_STORAGE_UPDATE_BYTES_MUST_USE_MINIMAL_REPRESENTATION ===");
  console.log("");
  console.log("Gap:  HookStoreTransaction requires minimal big-endian representation.");
  console.log("      Slot 0x00 must be empty bytes []; 32 zero bytes trigger this error.");
  console.log("      hedera-docs PR #362 example uses new Uint8Array(32).fill(0) - broken.");
  console.log(`Account: ${state.capAccountId}  hookId: ${state.capHookId}`);
  console.log("");

  // -----------------------------------------------------------------------
  // Attempt 1: BROKEN - 32 zero bytes for slot 0x00
  // -----------------------------------------------------------------------
  console.log("--- Attempt 1: BROKEN - slot key as 32 zero bytes ---");
  try {
    const brokenKey = new Uint8Array(32); // 32 zero bytes - NOT minimal representation
    console.log(`Slot key (broken): ${brokenKey.length} bytes, all zeros`);
    console.log("Submitting HookStoreTransaction with non-minimal slot key...");

    const tx = await new HookStoreTransaction()
      .setHookId(
        new HookId({
          entityId: new HookEntityId({ accountId: capAccountId }),
          hookId: Long.fromInt(state.capHookId!),
        }),
      )
      .addStorageUpdate(
        new EvmHookStorageSlot({
          key: brokenKey,
          value: toMinimalBytes(encodeUint256(999)),
        }),
      )
      .setMaxTransactionFee(new Hbar(10))
      .freezeWith(client);

    const signed = await tx.sign(capAccountKey);
    const response = await signed.execute(client);
    await response.getReceipt(client);
    console.log("Unexpected: transaction succeeded - gap may be resolved.");
  } catch (err: unknown) {
    const msg = (err as Error).message;
    if (msg.includes("EVM_HOOK_STORAGE_UPDATE_BYTES_MUST_USE_MINIMAL_REPRESENTATION")) {
      console.log("Got expected error: EVM_HOOK_STORAGE_UPDATE_BYTES_MUST_USE_MINIMAL_REPRESENTATION");
      console.log("Gap confirmed: non-minimal key bytes rejected at precheck (no state change).");
    } else {
      console.log(`Got error (different than expected): ${msg.split("\n")[0]}`);
    }
  }

  console.log("");

  // -----------------------------------------------------------------------
  // Attempt 2: CORRECT - empty bytes for slot 0x00 (minimal representation)
  // -----------------------------------------------------------------------
  console.log("--- Attempt 2: CORRECT - slot key as empty bytes ---");
  try {
    const correctKey = new Uint8Array(0); // empty = slot 0x00 in minimal representation
    console.log(`Slot key (correct): ${correctKey.length} bytes (empty bytes = slot 0x00)`);
    console.log("Submitting HookStoreTransaction with minimal slot key...");

    const tx = await new HookStoreTransaction()
      .setHookId(
        new HookId({
          entityId: new HookEntityId({ accountId: capAccountId }),
          hookId: Long.fromInt(state.capHookId!),
        }),
      )
      .addStorageUpdate(
        new EvmHookStorageSlot({
          key: correctKey,
          value: toMinimalBytes(encodeUint256(500)),
        }),
      )
      .setMaxTransactionFee(new Hbar(10))
      .freezeWith(client);

    const signed = await tx.sign(capAccountKey);
    const response = await signed.execute(client);
    const receipt = await response.getReceipt(client);
    console.log(`Success! Status: ${receipt.status}`);
    console.log(`Transaction: ${response.transactionId}`);
    console.log("Workaround confirmed: empty bytes for slot 0x00 works.");
  } catch (err: unknown) {
    console.error(`Unexpected failure: ${(err as Error).message.split("\n")[0]}`);
  }

  console.log("");
  console.log("=== Summary ===");
  console.log("Use new Uint8Array(0) for slot 0x00, not new Uint8Array(32).fill(0).");
  console.log("Use toMinimalBytes() from src/utils/crypto.ts for all encoded values.");
  console.log("Docs fix needed in: create-a-hookstore-transaction.mdx (hedera-docs PR #362)");

  client.close();
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
