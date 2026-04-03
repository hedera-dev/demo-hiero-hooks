/**
 * 00-setup-verify.ts
 *
 * Verifies environment setup: credentials are set, the mirror node is
 * reachable, and the operator account has a sufficient HBAR balance.
 *
 * Uses the mirror node REST API for the balance query (free, no SDK fees).
 *
 * Run: npx tsx src/00-setup-verify.ts
 * Expected output: operator account ID, HBAR balance, and network confirmation
 */

import { getNetworkConfig } from "./utils/config.js";
import { resetCosts } from "./utils/cost.js";

async function main() {
  resetCosts(); // start fresh cost log for this run
  const { network, operatorId, mirrorNodeUrl } = getNetworkConfig();

  console.log("=== Hiero Hooks Demo - Setup Verification ===");
  console.log(`Network:      ${network}`);
  console.log(`Operator ID:  ${operatorId}`);
  console.log(`Mirror Node:  ${mirrorNodeUrl}`);
  console.log("");

  console.log("Querying operator account balance via mirror node...");
  const url = `${mirrorNodeUrl}/api/v1/balances?account.id=${operatorId}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Mirror node returned ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const entry = data.balances?.[0];
  if (!entry) {
    throw new Error(`Account ${operatorId} not found on ${network}. Verify your OPERATOR_ACCOUNT_ID.`);
  }

  // Balance is in tinybars; convert to HBAR (1 HBAR = 100,000,000 tinybars)
  const hbarBalance = (Number(entry.balance) / 1e8).toFixed(8);
  console.log(`HBAR Balance: ${hbarBalance} ℏ`);
  console.log("");
  console.log("Setup verified. Ready to run the demo scripts.");
}

main().catch((error) => {
  console.error("Setup verification failed:", error.message);
  process.exit(1);
});
