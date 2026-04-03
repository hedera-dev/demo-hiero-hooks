# Hedera Hooks Demo

End-to-end demo for [HIP-1195 Hiero Hooks](https://github.com/hiero-ledger/hiero-improvement-proposals/blob/main/HIP/hip-1195.md) - programmable account-level logic that executes on transfers without smart contract overhead.

## What You'll Build

Two standalone hook demos - pick one or run both:

- **HelloHooks** (`src/hello-hooks/`) - a hook that inspects ProposedTransfers and approves only exactly 1 HBAR transfers
- **ManagedTransferCap** (`src/managed-transfer-cap/`) - enforces a configurable transfer cap on inbound token transfers, managed cheaply via HookStoreTransaction

## What You'll Learn

- How Hiero hooks bring account abstraction to Hedera
- Writing and deploying Solidity hook contracts (HIP-1195 interface)
- Attaching hooks to accounts at creation time
- Triggering hooks via `FungibleHookCall` in `TransferTransaction`
- Updating hook storage cheaply with `HookStoreTransaction`
- Querying hook state via the Hedera mirror node REST API

## Quick Start

### 1. Prerequisites

- Node.js >= 18
- A Hedera testnet account ([portal.hedera.com](https://portal.hedera.com))
- ~200 HBAR (testnet faucet at portal)

See [docs/PREREQUISITES.md](docs/PREREQUISITES.md) for detailed setup instructions.

### 2. Install and Configure

```bash
npm install
cp .env.example .env
# Edit .env with your account ID and private key
```

> **SDK note:** `@hiero-ledger/sdk@2.83.0-beta.1` is pre-npm. Tarballs in `vendor/` were built from the GitHub tag. Once published to npm, replace the three `file:vendor/...` entries in `package.json` with `"@hiero-ledger/sdk": "2.83.0-beta.1"` and remove the sub-package entries, then re-run `npm install`.

### 3. Compile Contracts

```bash
npm run compile
```

### 4. Verify Setup

```bash
npx tsx src/00-setup-verify.ts
```

### 5. Run a Demo

Each demo lives in its own directory with numbered scripts. Run them in order.

**HelloHooks** (6 scripts - deploys a hook that approves only exactly 1 HBAR transfers):

```bash
npx tsx src/hello-hooks/01-deploy.ts
npx tsx src/hello-hooks/02-create-account.ts
npx tsx src/hello-hooks/03-trigger.ts
npx tsx src/hello-hooks/04-trigger-wrong-amount.ts
npx tsx src/hello-hooks/05-query.ts
npx tsx src/hello-hooks/06-cleanup.ts
```

**ManagedTransferCap** (9 scripts - deploys a stateful two-phase hook that enforces a transfer cap):

```bash
npx tsx src/managed-transfer-cap/01-deploy.ts
npx tsx src/managed-transfer-cap/02-create-account.ts
npx tsx src/managed-transfer-cap/03-set-cap.ts
npx tsx src/managed-transfer-cap/04-transfer-within-cap.ts
npx tsx src/managed-transfer-cap/05-transfer-exceeds-cap.ts
npx tsx src/managed-transfer-cap/06-query.ts
npx tsx src/managed-transfer-cap/07-increase-cap.ts
npx tsx src/managed-transfer-cap/08-transfer-after-increase.ts
npx tsx src/managed-transfer-cap/09-cleanup.ts
```

See [docs/GUIDE.md](docs/GUIDE.md) for the full step-by-step walkthrough with expected outputs.

## Network Switching

```bash
HEDERA_NETWORK=testnet npx tsx src/00-setup-verify.ts    # testnet (default)
HEDERA_NETWORK=previewnet npx tsx src/00-setup-verify.ts  # previewnet
```

> Delete `.state.json` when switching networks. All IDs are network-specific.

## Tests

Integration tests run against testnet and exercise the same on-chain flows as the demo scripts.

```bash
# Run all tests
npm test

# Run only HelloHooks tests
npx vitest run test/hello-hooks.test.ts

# Run only ManagedTransferCap tests
npx vitest run test/managed-transfer-cap.test.ts

# Watch mode (re-runs on file changes)
npm run test:watch
```

> Tests deploy fresh contracts and accounts per run (~60s total, costs ~60 HBAR on testnet).

## Contract Verification on HashScan

After deploying a contract, you can verify its source code on [HashScan](https://hashscan.io) using the included metadata generation script. This produces a `metadata.json` bundle that HashScan accepts for Sourcify verification.

```bash
# Generate metadata for a deployed contract
./generate_hedera_sc_metadata.sh HelloHooks
./generate_hedera_sc_metadata.sh ManagedTransferCap

# Output is written to verify-bundles/<ContractName>/metadata.json
```

To verify on HashScan:

1. Go to `https://hashscan.io/<network>/contract/<contract-id>`
2. Click "Verify Contract"
3. Upload the `metadata.json` file from `verify-bundles/<ContractName>/`

## Docs

- [docs/BACKGROUND.md](docs/BACKGROUND.md) - What hooks are, why they exist, how they compare to alternatives
- [docs/PREREQUISITES.md](docs/PREREQUISITES.md) - Detailed setup and account creation
- [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) - Architecture, script flow, SDK classes
- [docs/GUIDE.md](docs/GUIDE.md) - Step-by-step walkthrough with expected outputs
