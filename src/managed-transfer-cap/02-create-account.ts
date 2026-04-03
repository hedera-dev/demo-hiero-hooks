/**
 * managed-transfer-cap/02-create-account.ts
 *
 * Creates a test account with receiver_sig_required=true and a
 * PRE_POST_TX_ALLOWANCE_HOOK attached at creation time. Also creates an HTS
 * fungible token (MCT - Managed Cap Token) and associates it with the account.
 *
 * receiver_sig_required=true ensures ALL inbound transfers must go through the
 * hook - senders cannot bypass the cap by omitting the hook reference.
 *
 * Run: npx tsx src/managed-transfer-cap/02-create-account.ts
 * Requires: .state.json with capContractId (run managed-transfer-cap/01-deploy.ts first)
 * Saves: .state.json { capAccountId, capAccountPrivKey, capTokenId, capHookId }
 */

import {
  AccountCreateTransaction,
  TokenCreateTransaction,
  TokenAssociateTransaction,
  TokenType,
  TokenSupplyType,
  Hbar,
  PrivateKey,
  ContractId,
  HookCreationDetails,
  HookExtensionPoint,
  EvmHook,
} from "@hiero-ledger/sdk";
import { createClient } from "../utils/client.js";
import { getNetworkConfig } from "../utils/config.js";
import { recordCost } from "../utils/cost.js";
import { loadState, saveState } from "../utils/state.js";

// Client-chosen hookId: an arbitrary integer that identifies this hook on the account.
// Must match the hookId used in FungibleHookCall (managed-transfer-cap/04-transfer-within-cap.ts etc.).
const HOOK_ID = 2;

async function main() {
  const state = loadState(["capContractId"], "run managed-transfer-cap/01-deploy.ts first");
  const { operatorId } = getNetworkConfig();
  const client = createClient();

  const capAccountKey = PrivateKey.generateECDSA();
  console.log("=== Step 2: Create Test Account, Token, and Attach Hook ===");
  console.log("Generated ECDSA key for test account");

  // --- Create account with hook and receiver_sig_required ---
  console.log(`Creating account with hookId=${HOOK_ID}, receiver_sig_required=true...`);

  const hookDetails = new HookCreationDetails({
    extensionPoint: HookExtensionPoint.ACCOUNT_ALLOWANCE_HOOK,
    hookId: HOOK_ID,
    evmHook: new EvmHook({ contractId: ContractId.fromString(state.capContractId!) }),
  });

  const accountCreate = await new AccountCreateTransaction()
    .setECDSAKeyWithAlias(capAccountKey.publicKey)
    .setInitialBalance(new Hbar(10))
    .setReceiverSignatureRequired(true)
    .setMaxTransactionFee(new Hbar(15))
    .addHook(hookDetails)
    .freezeWith(client);
  const accountSigned = await accountCreate.sign(capAccountKey);
  const accountTx = await accountSigned.execute(client);

  const accountReceipt = await recordCost(
    "managed-transfer-cap/02-create-account",
    "AccountCreate + hook (ManagedTransferCap)",
    accountTx,
    client,
  );
  if (!accountReceipt) throw new Error("Transaction failed - could not retrieve receipt");

  const capAccountId = accountReceipt.accountId;
  if (!capAccountId) throw new Error("AccountCreate succeeded but accountId is null");
  console.log(`Test account created: ${capAccountId}`);
  console.log(`Hook attached with hookId=${HOOK_ID} -> contract ${state.capContractId}`);

  // --- Create HTS fungible token (MCT) ---
  console.log("\nCreating HTS fungible token (MCT - Managed Cap Token)...");

  const tokenTx = await new TokenCreateTransaction()
    .setTokenName("Managed Cap Token")
    .setTokenSymbol("MCT")
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(0)
    .setInitialSupply(10_000)
    .setSupplyType(TokenSupplyType.Finite)
    .setMaxSupply(10_000)
    .setTreasuryAccountId(operatorId)
    .execute(client);

  const tokenReceipt = await recordCost(
    "managed-transfer-cap/02-create-token",
    "TokenCreateTransaction (MCT)",
    tokenTx,
    client,
  );
  if (!tokenReceipt) throw new Error("Token creation failed - could not retrieve receipt");

  const capTokenId = tokenReceipt.tokenId;
  if (!capTokenId) throw new Error("TokenCreate succeeded but tokenId is null");
  console.log(`Token created: ${capTokenId} (MCT, supply=10000, decimals=0)`);

  // --- Associate token with the cap account ---
  console.log("\nAssociating MCT token with cap account...");

  const assocTx = await new TokenAssociateTransaction()
    .setAccountId(capAccountId)
    .setTokenIds([capTokenId])
    .freezeWith(client);
  const assocSigned = await assocTx.sign(capAccountKey);
  const assocResponse = await assocSigned.execute(client);

  await recordCost(
    "managed-transfer-cap/02-associate-token",
    "TokenAssociateTransaction (MCT -> cap account)",
    assocResponse,
    client,
  );
  console.log("Token associated with cap account");

  // --- Save state ---
  // WARNING: Private key is stored in .state.json for demo convenience only.
  // In production, use a KMS or environment variable - never persist keys to disk.
  saveState({
    capAccountId: capAccountId.toString(),
    capAccountPrivKey: capAccountKey.toStringRaw(),
    capTokenId: capTokenId.toString(),
    capHookId: HOOK_ID,
  });
  console.log(`\nSaved capAccountId, capTokenId, capHookId=${HOOK_ID} to .state.json`);

  client.close();
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
