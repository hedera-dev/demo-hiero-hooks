/**
 * scripts/compile.ts
 *
 * Compiles all Solidity contracts in src/contracts/ using solcjs via
 * --standard-json so that bytecode, ABI, and metadata all come from a
 * single compilation with identical settings. This ensures the metadata
 * matches the deployed bytecode exactly - required for Sourcify/HashScan
 * verification.
 *
 * Outputs to build/contracts/:
 *   <ContractName>.bytecode.txt    - hex-encoded creation bytecode
 *   <ContractName>.abi.json        - ABI array
 *   <ContractName>.metadata.json   - compiler metadata (Sourcify-compatible)
 *
 * Run: npm run compile
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const SRC_DIR = "src/contracts";
const OUT_DIR = "build/contracts";

// Find all .sol files
const solFiles = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith(".sol"));
if (solFiles.length === 0) {
  console.error("No .sol files found in src/contracts/");
  process.exit(1);
}

// Ensure output directory exists
fs.mkdirSync(OUT_DIR, { recursive: true });

console.log(`Compiling ${solFiles.length} contract(s) via standard-json...`);

// Build a single standard-json input with all source files.
// All artifacts come from one compilation so settings are guaranteed consistent.
const sources: Record<string, { content: string }> = {};
for (const solFile of solFiles) {
  const solPath = path.join(SRC_DIR, solFile);
  sources[solPath] = { content: fs.readFileSync(solPath, "utf8") };
}

const standardInput = JSON.stringify({
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "metadata"],
      },
    },
  },
});

let rawOutput: string;
try {
  rawOutput = execSync("npx solcjs --standard-json", {
    input: standardInput,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
} catch (error) {
  console.error("Compilation failed:", error);
  process.exit(1);
}

// solcjs may prepend a warning line starting with ">>>" (e.g., SMT checker)
const lines = rawOutput.split("\n");
const jsonStart = lines.findIndex((line) => line.startsWith("{"));
if (jsonStart < 0) {
  console.error("No JSON output from solcjs");
  process.exit(1);
}
const jsonStr = lines.slice(jsonStart).join("\n");

interface ContractOutput {
  abi?: unknown[];
  evm?: { bytecode?: { object?: string } };
  metadata?: string;
}

interface CompilerOutput {
  contracts?: Record<string, Record<string, ContractOutput>>;
  errors?: Array<{ severity: string; message: string; formattedMessage?: string }>;
}

const result: CompilerOutput = JSON.parse(jsonStr);

// Report errors (warnings are OK, hard errors are fatal)
if (result.errors) {
  for (const err of result.errors) {
    if (err.severity === "error") {
      console.error(err.formattedMessage || err.message);
    }
  }
  const hardErrors = result.errors.filter((e) => e.severity === "error");
  if (hardErrors.length > 0) {
    console.error(`Compilation failed with ${hardErrors.length} error(s)`);
    process.exit(1);
  }
}

const contracts = result.contracts || {};
let emitted = 0;

for (const [srcFile, srcContracts] of Object.entries(contracts)) {
  for (const [contractName, contractData] of Object.entries(srcContracts)) {
    const bytecodeHex = contractData.evm?.bytecode?.object;

    // Skip interfaces and abstract contracts (no bytecode)
    if (!bytecodeHex || bytecodeHex.length === 0) continue;

    // --- Bytecode ---
    const bytecodePath = path.join(OUT_DIR, `${contractName}.bytecode.txt`);
    fs.writeFileSync(bytecodePath, bytecodeHex);
    console.log(`  ${contractName}.bytecode.txt (${bytecodeHex.length / 2} bytes)`);

    // --- ABI ---
    if (contractData.abi) {
      const abiPath = path.join(OUT_DIR, `${contractName}.abi.json`);
      fs.writeFileSync(abiPath, JSON.stringify(contractData.abi, null, 2));
      console.log(`  ${contractName}.abi.json`);
    }

    // --- Metadata ---
    // The metadata string comes directly from the compiler - it matches the
    // bytecode exactly because both came from the same compilation.
    if (contractData.metadata) {
      const metadata = JSON.parse(contractData.metadata);

      // Inline source content so the metadata.json is self-contained for
      // Sourcify verification (no need to upload source files separately).
      for (const srcKey of Object.keys(metadata.sources || {})) {
        if (sources[srcKey]) {
          metadata.sources[srcKey].content = sources[srcKey].content;
          delete metadata.sources[srcKey].urls;
        }
      }

      const metaPath = path.join(OUT_DIR, `${contractName}.metadata.json`);
      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
      console.log(`  ${contractName}.metadata.json`);
    }

    emitted++;
  }
}

if (emitted === 0) {
  console.error("No contracts with bytecode found in compilation output");
  process.exit(1);
}

console.log(`\nCompilation complete. ${emitted} contract(s) in ${OUT_DIR}/`);
