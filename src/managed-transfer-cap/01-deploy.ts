/**
 * managed-transfer-cap/01-deploy.ts
 *
 * Deploys the ManagedTransferCap hook contract to the configured Hedera network
 * using ContractCreateFlow (handles file upload + contract creation in a single call).
 *
 * Run: npx tsx src/managed-transfer-cap/01-deploy.ts
 * Requires: build/contracts/ManagedTransferCap.bytecode.txt (run `npm run compile` first)
 * Saves: .state.json { capContractId }
 */

import fs from "fs";
import { ContractCreateFlow } from "@hiero-ledger/sdk";
import { createClient } from "../utils/client.js";
import { recordCost, resetDemoCosts } from "../utils/cost.js";
import { loadState, saveState } from "../utils/state.js";

const BYTECODE_PATH = new URL("../../build/contracts/ManagedTransferCap.bytecode.txt", import.meta.url).pathname;

async function main() {
  loadState(); // ensures .state.json exists (creates if needed)
  resetDemoCosts("managed-transfer-cap"); // clear old ManagedTransferCap costs from previous runs
  const client = createClient();

  if (!fs.existsSync(BYTECODE_PATH)) {
    throw new Error("Bytecode not found. Run `npm run compile` first to compile the Solidity contracts.");
  }
  const bytecode = fs.readFileSync(BYTECODE_PATH, "utf8").trim();

  console.log("=== Step 1: Deploy ManagedTransferCap Hook Contract ===");
  console.log(`Bytecode length: ${bytecode.length / 2} bytes`);
  console.log("Submitting ContractCreateFlow...");

  const createTx = await new ContractCreateFlow().setBytecode(bytecode).setGas(1_000_000).execute(client);

  const receipt = await recordCost(
    "managed-transfer-cap/01-deploy",
    "ContractCreateFlow (ManagedTransferCap)",
    createTx,
    client,
  );
  if (!receipt) throw new Error("Transaction failed - could not retrieve receipt");

  const contractId = receipt.contractId;
  if (!contractId) {
    throw new Error("ContractCreate succeeded but contractId is null - check receipt");
  }

  console.log(`Contract deployed: ${contractId}`);
  console.log(`Transaction ID:   ${createTx.transactionId}`);

  saveState({ capContractId: contractId.toString() });
  console.log("Saved capContractId to .state.json");

  client.close();
}

main().catch((err) => {
  console.error("Deployment failed:", err.message);
  process.exit(1);
});
