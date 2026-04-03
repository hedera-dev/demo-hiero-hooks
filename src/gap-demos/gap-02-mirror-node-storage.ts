/**
 * gap-02-mirror-node-storage.ts
 *
 * Gap M-1: Hook storage query endpoint documented but not deployed
 *
 * hedera-docs PR #362 documents this endpoint for querying hook storage:
 *   GET /api/v1/accounts/{id}/hooks/{hookId}/storage
 *
 * As of April 2026, this endpoint returns 404 on both testnet and previewnet.
 * The fallback (GET /api/v1/contracts/{id}/state) also returns empty results
 * because hook-scoped storage is separate from EVM contract storage.
 *
 * Run:      npx tsx src/gap-demos/gap-02-mirror-node-storage.ts
 * Requires: .state.json with capAccountId, capHookId
 *           (run managed-transfer-cap/02-create-account.ts first)
 */

import { getNetworkConfig } from "../utils/config.js";
import { loadState } from "../utils/state.js";

async function main() {
  const state = loadState(
    ["capAccountId", "capHookId"],
    "run managed-transfer-cap/02-create-account.ts first",
  );

  const { mirrorNodeUrl } = getNetworkConfig();

  console.log("=== Gap M-1: Hook storage query endpoint not deployed ===");
  console.log("");
  console.log("Gap:  hedera-docs PR #362 documents GET /api/v1/accounts/{id}/hooks/{hookId}/storage");
  console.log("      but this endpoint returns 404 on testnet and previewnet (April 2026).");
  console.log(`Account: ${state.capAccountId}  hookId: ${state.capHookId}`);
  console.log("");

  // -----------------------------------------------------------------------
  // Attempt 1: documented storage endpoint
  // -----------------------------------------------------------------------
  const storageUrl = `${mirrorNodeUrl}/api/v1/accounts/${state.capAccountId}/hooks/${state.capHookId}/storage`;
  console.log("--- Attempt 1: Documented hook storage endpoint ---");
  console.log(`URL: ${storageUrl}`);

  try {
    const res = await fetch(storageUrl);
    console.log(`HTTP status: ${res.status} ${res.statusText}`);
    if (!res.ok) {
      const body = await res.text();
      console.log(`Response: ${body.slice(0, 300)}`);
      console.log("Gap confirmed: endpoint not deployed (404).");
    } else {
      const data = await res.json();
      console.log("Unexpected: endpoint returned data (gap may be resolved):");
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (err: unknown) {
    console.log(`Fetch error: ${(err as Error).message}`);
  }

  console.log("");

  // -----------------------------------------------------------------------
  // Attempt 2: contract state fallback (also doesn't work for hook storage)
  // -----------------------------------------------------------------------
  const contractStateUrl = `${mirrorNodeUrl}/api/v1/contracts/${state.capAccountId}/state`;
  console.log("--- Attempt 2: Contract state endpoint (does not show hook storage) ---");
  console.log(`URL: ${contractStateUrl}`);

  try {
    const res = await fetch(contractStateUrl);
    console.log(`HTTP status: ${res.status} ${res.statusText}`);
    if (res.ok) {
      const data = await res.json();
      const slotCount = (data.state ?? []).length;
      console.log(`Storage slots returned: ${slotCount}`);
      if (slotCount === 0) {
        console.log("Gap confirmed: hook storage not visible via /contracts/{id}/state.");
        console.log("Hook-scoped storage is separate from EVM contract storage.");
      }
    } else {
      console.log("Endpoint returned error.");
    }
  } catch (err: unknown) {
    console.log(`Fetch error: ${(err as Error).message}`);
  }

  console.log("");

  // -----------------------------------------------------------------------
  // Workaround: HOOKSTORE transaction history confirms writes landed
  // -----------------------------------------------------------------------
  const hookstoreUrl = `${mirrorNodeUrl}/api/v1/transactions?account.id=${state.capAccountId}&transactiontype=HOOKSTORE&limit=5&order=desc`;
  console.log("--- Workaround: Query HOOKSTORE transaction history ---");
  console.log(`URL: ${hookstoreUrl}`);

  try {
    const res = await fetch(hookstoreUrl);
    const data = await res.json();
    const txList: Record<string, unknown>[] = data.transactions ?? [];
    console.log(`HOOKSTORE transactions found: ${txList.length}`);
    if (txList.length > 0) {
      console.log("Workaround confirmed: HOOKSTORE history is accessible.");
      const most_recent = txList[0];
      console.log(`Most recent: ${most_recent.transaction_id}  result: ${most_recent.result}`);
    } else {
      console.log("No HOOKSTORE transactions found. Run managed-transfer-cap/03-set-cap.ts first.");
    }
  } catch (err: unknown) {
    console.log(`Fetch error: ${(err as Error).message}`);
  }

  console.log("");
  console.log("=== Summary ===");
  console.log("Gap M-1: /api/v1/accounts/{id}/hooks/{hookId}/storage returns 404 (not deployed).");
  console.log("         /api/v1/contracts/{id}/state does not surface hook storage either.");
  console.log("Workaround: use /api/v1/transactions?transactiontype=HOOKSTORE to confirm writes.");
  console.log("            Verify hook logic by running transfers and observing SUCCESS vs REJECTED.");
  console.log("Fix needed: deploy the storage endpoint, or document it as coming soon.");
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
