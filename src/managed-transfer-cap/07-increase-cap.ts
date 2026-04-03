/**
 * managed-transfer-cap/07-increase-cap.ts
 *
 * Writes a new cap value (1000) to slot 0x00 via HookStoreTransaction,
 * replacing the previous remaining cap. This demonstrates that the hook
 * owner can dynamically adjust the cap without redeploying the contract.
 *
 * Run: npx tsx src/managed-transfer-cap/07-increase-cap.ts
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

// New cap: 1000 token units
const NEW_CAP_VALUE = 1000;

async function main() {
  const state = loadState(
    ["capContractId", "capAccountId", "capAccountPrivKey", "capHookId"],
    "run managed-transfer-cap/01-deploy.ts through managed-transfer-cap/06-query.ts first",
  );

  const client = createClient();
  const capAccountKey = PrivateKey.fromStringECDSA(state.capAccountPrivKey!);
  const capAccountId = AccountId.fromString(state.capAccountId!);

  console.log("=== Step 7: Increase Transfer Cap ===");
  console.log(`New cap value: ${NEW_CAP_VALUE} token units`);

  // Encode 1000 as big-endian uint256 (32 bytes), then apply minimal representation.
  // 1000 = 0x03E8.
  const capBuffer = Buffer.alloc(32, 0);
  capBuffer.writeBigUInt64BE(BigInt(NEW_CAP_VALUE), 24);
  const minimalValue = toMinimalBytes(capBuffer);
  console.log(`Encoded value (minimal): 0x${minimalValue.toString("hex")}`);
  console.log("Writing to hook-scoped storage slot 0x00...");

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
    "managed-transfer-cap/07-increase-cap",
    "HookStoreTransaction (increase cap to 1000)",
    txResponse,
    client,
  );

  console.log(`Cap updated! Status: ${receipt?.status ?? "unknown"}`);
  console.log(`Transaction ID: ${txResponse.transactionId}`);
  console.log("\nCap increased to 1000 token units");
  console.log("Transfers up to 1000 will now be approved.");
  console.log("Run managed-transfer-cap/08-transfer-after-increase.ts to test.");

  client.close();
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
