import fs from "fs";
import type { Client, TransactionReceipt, TransactionResponse } from "@hiero-ledger/sdk";
import { getNetworkConfig } from "./config.js";

const COSTS_FILE = ".costs.json";
const COSTS_MD = "COSTS.md";

interface CostEntry {
  script: string;
  operation: string;
  feeHbar: string;
  txId: string;
  network: string;
  timestamp: string;
}

/**
 * Removes old entries for a specific demo prefix from .costs.json.
 * Call from each demo's 01-deploy.ts so re-running a demo replaces
 * its old costs without affecting the other demo's entries.
 *
 * @param demoPrefix - e.g., "hello-hooks" or "managed-transfer-cap"
 */
export function resetDemoCosts(demoPrefix: string): void {
  if (!fs.existsSync(COSTS_FILE)) return;
  try {
    const costs: CostEntry[] = JSON.parse(fs.readFileSync(COSTS_FILE, "utf8"));
    const filtered = costs.filter((e) => !e.script.startsWith(demoPrefix));
    fs.writeFileSync(COSTS_FILE, JSON.stringify(filtered, null, 2));
  } catch {
    // Corrupted file - just delete it
    fs.unlinkSync(COSTS_FILE);
  }
}

/**
 * Resets the entire cost log. Called from 00-setup-verify.ts.
 */
export function resetCosts(): void {
  if (fs.existsSync(COSTS_FILE)) fs.unlinkSync(COSTS_FILE);
  if (fs.existsSync(COSTS_MD)) fs.unlinkSync(COSTS_MD);
}

/**
 * Records the actual fee charged for a transaction and regenerates COSTS.md.
 *
 * Uses getRecord() to fetch the full TransactionRecord (which includes the actual
 * fee deducted - NOT the setMaxTransactionFee ceiling). Appends to .costs.json
 * and regenerates COSTS.md from the full history.
 *
 * Returns the receipt so callers can access status, contractId, etc. without
 * a separate getReceipt() call.
 */
export async function recordCost(
  script: string,
  operation: string,
  txResponse: TransactionResponse,
  client: Client,
): Promise<TransactionReceipt | null> {
  try {
    const record = await txResponse.getRecord(client);
    const { network } = getNetworkConfig();
    const feeHbar = record.transactionFee.toString();
    const txId = txResponse.transactionId.toString();

    const entry: CostEntry = {
      script,
      operation,
      feeHbar,
      txId,
      network,
      timestamp: new Date().toISOString(),
    };

    let costs: CostEntry[] = [];
    if (fs.existsSync(COSTS_FILE)) {
      try {
        costs = JSON.parse(fs.readFileSync(COSTS_FILE, "utf8"));
      } catch {
        costs = [];
      }
    }
    costs.push(entry);
    fs.writeFileSync(COSTS_FILE, JSON.stringify(costs, null, 2));
    await regenerateCostsMd(costs);

    console.log(`  Fee charged: ${feeHbar}`);
    return record.receipt;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Non-fatal: precheck rejections or record retrieval failures skip cost recording.
    console.log(`  Fee: not recorded (${message.split("\n")[0]})`);
    try {
      return await txResponse.getReceipt(client);
    } catch {
      return null;
    }
  }
}

/**
 * Fetches the current HBAR/USD exchange rate from the mirror node.
 * Returns USD per 1 HBAR, or null if the fetch fails.
 */
async function fetchHbarUsdRate(): Promise<number | null> {
  try {
    const { mirrorNodeUrl } = getNetworkConfig();
    const res = await fetch(`${mirrorNodeUrl}/api/v1/network/exchangerate`);
    if (!res.ok) return null;
    const data = await res.json();
    const rate = data.current_rate;
    if (!rate || !rate.cent_equivalent || !rate.hbar_equivalent) return null;
    // cent_equivalent cents per hbar_equivalent HBAR -> USD per HBAR
    return rate.cent_equivalent / rate.hbar_equivalent / 100;
  } catch {
    return null;
  }
}

/**
 * Parses the HBAR fee string (e.g., "5.04905054 ℏ") into a number.
 */
function parseHbar(feeStr: string): number {
  const cleaned = feeStr.replace(/[^\d.]/g, "");
  return parseFloat(cleaned) || 0;
}

/** Known demo prefixes for grouping costs. */
const DEMO_GROUPS: { prefix: string; title: string }[] = [
  { prefix: "hello-hooks", title: "HelloHooks" },
  { prefix: "managed-transfer-cap", title: "ManagedTransferCap" },
];

function renderDemoTable(
  entries: CostEntry[],
  usdRate: number | null,
): { tableLines: string[]; totalHbar: number } {
  const hasUsd = usdRate !== null;
  const tableLines: string[] = [];
  let totalHbar = 0;

  if (hasUsd) {
    tableLines.push("| Script | Operation | Fee (HBAR) | Fee (USD) | Transaction ID |");
    tableLines.push("|--------|-----------|------------|-----------|----------------|");
  } else {
    tableLines.push("| Script | Operation | Fee (HBAR) | Transaction ID |");
    tableLines.push("|--------|-----------|------------|----------------|");
  }

  for (const entry of entries) {
    const hbarAmount = parseHbar(entry.feeHbar);
    totalHbar += hbarAmount;

    if (hasUsd) {
      const usdAmount = (hbarAmount * usdRate!).toFixed(4);
      tableLines.push(
        `| \`${entry.script}\` | ${entry.operation} | ${entry.feeHbar} | $${usdAmount} | \`${entry.txId}\` |`,
      );
    } else {
      tableLines.push(
        `| \`${entry.script}\` | ${entry.operation} | ${entry.feeHbar} | \`${entry.txId}\` |`,
      );
    }
  }

  return { tableLines, totalHbar };
}

async function regenerateCostsMd(costs: CostEntry[]): Promise<void> {
  const usdRate = await fetchHbarUsdRate();
  const hasUsd = usdRate !== null;

  const lines: string[] = [
    "# Transaction Cost Log",
    "",
    "Actual fees charged per operation, recorded automatically as demo scripts run.",
    "Reset by running `npx tsx src/00-setup-verify.ts`.",
    "",
    "> `setMaxTransactionFee` is a ceiling - only the amount shown here is deducted.",
  ];

  if (hasUsd) {
    lines.push(
      `> Exchange rate: 1 HBAR = $${usdRate!.toFixed(4)} USD (from mirror node at generation time).`,
    );
  }

  // Group entries by demo
  for (const group of DEMO_GROUPS) {
    const entries = costs.filter((e) => e.script.startsWith(group.prefix));
    if (entries.length === 0) continue;

    lines.push("");
    lines.push(`## ${group.title}`);
    lines.push("");

    const { tableLines, totalHbar } = renderDemoTable(entries, usdRate);
    lines.push(...tableLines);
    lines.push("");

    if (hasUsd) {
      const totalUsd = (totalHbar * usdRate!).toFixed(4);
      lines.push(`**Subtotal: ${totalHbar.toFixed(8)} HBAR ($${totalUsd} USD)**`);
    } else {
      lines.push(`**Subtotal: ${totalHbar.toFixed(8)} HBAR**`);
    }
  }

  // Grand total
  const grandTotalHbar = costs.reduce((sum, e) => sum + parseHbar(e.feeHbar), 0);
  if (costs.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("");
    if (hasUsd) {
      const grandTotalUsd = (grandTotalHbar * usdRate!).toFixed(4);
      lines.push(`**Grand Total: ${grandTotalHbar.toFixed(8)} HBAR ($${grandTotalUsd} USD)**`);
    } else {
      lines.push(`**Grand Total: ${grandTotalHbar.toFixed(8)} HBAR**`);
    }
  }

  lines.push("");
  lines.push(`_Last updated: ${new Date().toISOString()}_`);
  lines.push("");

  fs.writeFileSync(COSTS_MD, lines.join("\n"));
}
