/**
 * managed-transfer-cap/06-query.ts
 *
 * Queries the Hedera mirror node to confirm the ManagedTransferCap hook is
 * attached to the cap account and returns the expected state. Also queries
 * HOOKSTORE transactions to verify cap writes.
 *
 * Mirror node endpoints:
 *   - GET /api/v1/accounts/{id}/hooks
 *   - GET /api/v1/transactions?account.id={id}&transactiontype=HOOKSTORE
 *
 * Run: npx tsx src/managed-transfer-cap/06-query.ts
 * Requires: .state.json with capContractId, capAccountId
 */

import { getNetworkConfig } from "../utils/config.js";
import { loadState } from "../utils/state.js";

async function main() {
  const state = loadState(
    ["capContractId", "capAccountId"],
    "run managed-transfer-cap/01-deploy.ts through managed-transfer-cap/05-transfer-exceeds-cap.ts first",
  );
  const { mirrorNodeUrl, operatorId } = getNetworkConfig();
  const accountId = state.capAccountId;

  console.log("=== Step 6: Query Hook State via Mirror Node ===");
  console.log("Waiting 5 seconds for mirror node propagation...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // --- Query 1: List all hooks on the cap account ---
  const hooksUrl = `${mirrorNodeUrl}/api/v1/accounts/${accountId}/hooks`;
  console.log(`\nQuerying: ${hooksUrl}`);
  console.log("(Paste this URL in your browser to see the raw response)\n");

  const hooksRes = await fetch(hooksUrl);
  if (!hooksRes.ok) {
    throw new Error(`Mirror node returned ${hooksRes.status}: ${await hooksRes.text()}`);
  }
  const hooksData = await hooksRes.json();

  console.log("Hooks response:");
  console.log(JSON.stringify(hooksData, null, 2));

  // Verify expected fields
  const hooks = hooksData.hooks ?? [];
  if (hooks.length === 0) {
    console.warn("\nWARN: No hooks found. The hook may not have propagated to the mirror node yet.");
    console.warn("Mirror node has ~3-5 second lag. Try again in a moment.");
  } else {
    const hook = hooks[0];
    console.log("\n--- Hook Verification ---");
    console.log(`extension_point: ${hook.extension_point} (expected: ACCOUNT_ALLOWANCE_HOOK)`);
    console.log(`deleted:         ${hook.deleted}         (expected: false)`);
    console.log(`contract_id:     ${hook.contract_id}     (expected: ${state.capContractId})`);

    if (hook.extension_point === "ACCOUNT_ALLOWANCE_HOOK" && !hook.deleted) {
      console.log("\nHook state verified.");
    } else {
      console.warn("\nWARN: Hook state does not match expectations - check mirror node response above.");
    }
  }

  // --- Query 2: HOOKSTORE transactions ---
  console.log("\n--- HOOKSTORE Transactions ---");
  const hookstoreUrl = `${mirrorNodeUrl}/api/v1/transactions?account.id=${operatorId}&transactiontype=HOOKSTORE&limit=5&order=desc`;
  console.log(`Querying: ${hookstoreUrl}\n`);

  const hookstoreRes = await fetch(hookstoreUrl);
  if (!hookstoreRes.ok) {
    console.warn(`Mirror node returned ${hookstoreRes.status} for HOOKSTORE query`);
  } else {
    const hookstoreData = await hookstoreRes.json();
    const transactions = hookstoreData.transactions ?? [];
    if (transactions.length === 0) {
      console.log("No HOOKSTORE transactions found.");
    } else {
      console.log(`Found ${transactions.length} HOOKSTORE transaction(s):`);
      for (const tx of transactions) {
        console.log(`  ${tx.transaction_id} - ${tx.result} (${tx.consensus_timestamp})`);
      }
    }
  }
}
// Note: no SDK client needed - this script uses only the fetch API

main().catch((err) => {
  console.error("Mirror node query failed:", err.message);
  process.exit(1);
});
