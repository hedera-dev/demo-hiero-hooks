/**
 * hello-hooks/02-create-account.ts
 *
 * Creates a test account with an ACCOUNT_ALLOWANCE_HOOK attached at creation
 * time. The HelloHooks hook is invoked via FungibleHookCall and returns true,
 * approving all inbound transfers.
 *
 * Key insight: hookId is CLIENT-CHOSEN at creation time, not assigned by the
 * network. The same hookId must be referenced in FungibleHookCall (hello-hooks/03-trigger.ts).
 *
 * No HTS token is needed for the basic demo - hello-hooks/03-trigger.ts sends plain HBAR.
 * Hooks work identically for HBAR and HTS fungible tokens; FungibleHookCall
 * covers both.
 *
 * Run: npx tsx src/hello-hooks/02-create-account.ts
 * Requires: .state.json with contractId (run hello-hooks/01-deploy.ts first)
 * Saves: .state.json { testAccountId, testAccountPrivKey, hookId }
 */

import {
  AccountCreateTransaction,
  Hbar,
  PrivateKey,
  ContractId,
  HookCreationDetails,
  HookExtensionPoint,
  EvmHook,
} from "@hiero-ledger/sdk";
import { createClient } from "../utils/client.js";
import { recordCost } from "../utils/cost.js";
import { loadState, saveState } from "../utils/state.js";

// Client-chosen hookId: an arbitrary integer that identifies this hook
// on the account. Must match the hookId used in FungibleHookCall (hello-hooks/03-trigger.ts).
const HOOK_ID = 1;

async function main() {
  const state = loadState(["contractId"], "run hello-hooks/01-deploy.ts first");
  const client = createClient();

  // ECDSA key required on Hedera (portal.hedera.com issues ECDSA by default)
  const testAccountKey = PrivateKey.generateECDSA();
  console.log("=== Step 2: Create Test Account and Attach Hook ===");
  console.log("Generated ECDSA key for test account");

  // --- Create test account with hook ---
  // The hook is attached at account creation using addHook(). This is simpler
  // than AccountUpdateTransaction and avoids an extra transaction.
  // hookId is CLIENT-CHOSEN: we set it here and reference the same value in hello-hooks/03-trigger.ts.
  console.log(`Creating test account with hookId=${HOOK_ID}...`);

  const hookDetails = new HookCreationDetails({
    extensionPoint: HookExtensionPoint.ACCOUNT_ALLOWANCE_HOOK,
    hookId: HOOK_ID,
    evmHook: new EvmHook({ contractId: ContractId.fromString(state.contractId!) }),
  });

  // .sign() is async in the Hiero SDK - must be awaited before .execute()
  const accountCreate = await new AccountCreateTransaction()
    .setECDSAKeyWithAlias(testAccountKey.publicKey)
    .setInitialBalance(new Hbar(10))
    .setMaxTransactionFee(new Hbar(15))
    .addHook(hookDetails)
    .freezeWith(client);
  const accountSigned = await accountCreate.sign(testAccountKey);
  const accountTx = await accountSigned.execute(client);

  const accountReceipt = await recordCost(
    "hello-hooks/02-create-account",
    "AccountCreate + hook (HelloHooks)",
    accountTx,
    client,
  );
  if (!accountReceipt) throw new Error("Transaction failed - could not retrieve receipt");

  const testAccountId = accountReceipt.accountId;
  if (!testAccountId) throw new Error("AccountCreate succeeded but accountId is null");
  console.log(`Test account created: ${testAccountId}`);
  console.log(`Hook attached with hookId=${HOOK_ID} -> contract ${state.contractId}`);
  console.log(`Transaction ID: ${accountTx.transactionId}`);

  // --- Save state ---
  // WARNING: Private key is stored in .state.json for demo convenience only.
  // In production, use a KMS or environment variable - never persist keys to disk.
  saveState({
    testAccountId: testAccountId.toString(),
    testAccountPrivKey: testAccountKey.toStringRaw(),
    hookId: HOOK_ID,
  });
  console.log(`\nSaved testAccountId, hookId=${HOOK_ID} to .state.json`);

  client.close();
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
