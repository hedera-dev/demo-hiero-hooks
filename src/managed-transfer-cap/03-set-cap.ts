/**
 * managed-transfer-cap/03-set-cap.ts
 *
 * Writes the initial transfer cap value (500) to the hook's storage slot 0x00
 * via HookStoreTransaction. The ManagedTransferCap contract reads this value
 * in allowPre() to check if inbound transfers fit within the remaining cap.
 *
 * HookStoreTransaction writes raw EVM storage slots directly, bypassing the EVM.
 * No gas cost for EVM execution; the hook owner pays only the Hedera transaction fee.
 * The node scopes storage to (entity, hook_id) per HIP-1195 spec.
 *
 * Run: npx tsx src/managed-transfer-cap/03-set-cap.ts
 * Requires: .state.json with capContractId, capAccountId, capAccountPrivKey, capHookId
 * Saves: nothing (on-chain state update only)
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
import { recordCost } from "../utils/cost.js";
import { loadState } from "../utils/state.js";
import { toMinimalBytes } from "../utils/crypto.js";

// Initial cap: 500 token units
const CAP_VALUE = 500;

async function main() {
  const state = loadState(
    ["capContractId", "capAccountId", "capAccountPrivKey", "capHookId"],
    "run managed-transfer-cap/01-deploy.ts and managed-transfer-cap/02-create-account.ts first",
  );

  const client = createClient();
  const capAccountKey = PrivateKey.fromStringECDSA(state.capAccountPrivKey!);
  const capAccountId = AccountId.fromString(state.capAccountId!);

  console.log("=== Step 3: Set Transfer Cap via HookStoreTransaction ===");
  console.log(`Cap value: ${CAP_VALUE} token units`);

  // Encode cap as big-endian uint256 (32 bytes), then apply minimal representation.
  // 500 = 0x01F4. The minimal representation strips leading zero bytes.
  const capBuffer = Buffer.alloc(32, 0);
  capBuffer.writeBigUInt64BE(BigInt(CAP_VALUE), 24); // write at offset 24 (last 8 bytes)
  const minimalValue = toMinimalBytes(capBuffer);
  console.log(`Encoded value (minimal): 0x${minimalValue.toString("hex")}`);
  console.log("Writing to hook-scoped storage slot 0x00...");

  // Slot key 0x00: fully-zero 32-byte buffer -> minimal representation is empty bytes
  const slotKey = new Uint8Array(0);

  const hookStoreTx = await new HookStoreTransaction()
    .setHookId(
      new HookId({
        entityId: new HookEntityId({ accountId: capAccountId }),
        hookId: Long.fromInt(state.capHookId!),
      }),
    )
    .addStorageUpdate(
      new EvmHookStorageSlot({
        key: slotKey,
        value: minimalValue,
      }),
    )
    .setMaxTransactionFee(new Hbar(10))
    .freezeWith(client);

  const signedTx = await hookStoreTx.sign(capAccountKey);
  const txResponse = await signedTx.execute(client);
  const receipt = await recordCost(
    "managed-transfer-cap/03-set-cap",
    "HookStoreTransaction (set cap to 500)",
    txResponse,
    client,
  );

  console.log(`Cap set! Status: ${receipt?.status ?? "unknown"}`);
  console.log(`Transaction ID: ${txResponse.transactionId}`);
  console.log("\nCap set to 500 token units");
  console.log("Slot 0x00 now holds uint256(500). Transfers up to 500 will be approved.");
  console.log("Run managed-transfer-cap/04-transfer-within-cap.ts to test a transfer within the cap.");

  client.close();
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
