/**
 * hello-hooks/05-query.ts
 *
 * Queries the Hedera mirror node to confirm the hook is attached to the test
 * account and returns the expected state after the trigger in hello-hooks/03-trigger.ts.
 *
 * Mirror node endpoint: GET /api/v1/accounts/{id}/hooks
 *
 * Run: npx tsx src/hello-hooks/05-query.ts
 * Requires: .state.json with testAccountId, hookId
 * Expected: Hook entry with extension_point="ACCOUNT_ALLOWANCE_HOOK", deleted=false
 */

import { getNetworkConfig } from "../utils/config.js";
import { loadState } from "../utils/state.js";

async function main() {
  const state = loadState(
    ["testAccountId", "hookId"],
    "run hello-hooks/01-deploy.ts through hello-hooks/03-trigger.ts first",
  );
  const { mirrorNodeUrl } = getNetworkConfig();
  const accountId = state.testAccountId;

  console.log("=== Step 5: Query Mirror Node for Hook State ===");
  console.log("Waiting 5 seconds for mirror node propagation...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // --- Query 1: List all hooks on the test account ---
  const hooksUrl = `${mirrorNodeUrl}/api/v1/accounts/${accountId}/hooks`;
  console.log(`\nQuerying: ${hooksUrl}`);
  console.log("(Paste this URL in your browser to see the raw response)\n");

  const hooksRes = await fetch(hooksUrl);
  if (!hooksRes.ok) {
    throw new Error(`Mirror node returned ${hooksRes.status}: ${await hooksRes.text()}`);
  }
  const hooksData = await hooksRes.json();

  console.log("Response:");
  console.log(JSON.stringify(hooksData, null, 2));

  // Verify expected fields
  const hooks = hooksData.hooks ?? [];
  if (hooks.length === 0) {
    console.warn("\nWARN: No hooks found. The hook may not have propagated to the mirror node yet.");
    console.warn("Mirror node has ~3-5 second lag. Try again in a moment.");
  } else {
    const hook = hooks[0];
    console.log("\n--- Verification ---");
    console.log(`extension_point: ${hook.extension_point} (expected: ACCOUNT_ALLOWANCE_HOOK)`);
    console.log(`deleted:         ${hook.deleted}         (expected: false)`);
    console.log(`contract_id:     ${hook.contract_id}     (expected: ${state.contractId})`);

    if (hook.extension_point === "ACCOUNT_ALLOWANCE_HOOK" && !hook.deleted) {
      console.log("\nHook state verified.");
    } else {
      console.warn("\nWARN: Hook state does not match expectations - check mirror node response above.");
    }
  }
}
// Note: no SDK client needed - this script uses only the fetch API

main().catch((err) => {
  console.error("Mirror node query failed:", err.message);
  process.exit(1);
});
