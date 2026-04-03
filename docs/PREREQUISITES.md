# Prerequisites

Everything you need to go from zero to running the HIP-1195 Hooks demo scripts.

## Table of Contents

- [Requirements](#requirements)
- [Create a Hedera Testnet Account](#create-a-hedera-testnet-account)
- [Clone and Install](#clone-and-install)
- [Configure Environment](#configure-environment)
- [Verify Setup](#verify-setup)
- [Network Switching](#network-switching)
- [Cost Expectations](#cost-expectations)
- [Verification Checklist](#verification-checklist)

## Requirements

| Requirement            | Minimum Version | Check Command                                  |
| ---------------------- | --------------- | ---------------------------------------------- |
| Node.js                | >= 18.0.0       | `node --version`                               |
| npm                    | >= 9.0.0        | `npm --version`                                |
| Hedera testnet account | ECDSA key type  | [portal.hedera.com](https://portal.hedera.com) |
| Testnet HBAR           | ~200 HBAR       | Testnet faucet (see below)                     |

## Create a Hedera Testnet Account

1. Go to [portal.hedera.com](https://portal.hedera.com) and create an account.

2. Once logged in, create a **testnet** profile. The portal generates an ECDSA key pair by default - this is the correct key type. Do not select ED25519.

3. Copy your **Account ID** (format: `0.0.XXXX`) and **HEX-encoded ECDSA private key** (hex string starting with `0x...`). You will need both for the `.env` file.

4. Fund your account using the testnet faucet. Click the "Receive" button in the portal or visit the faucet page. Request HBAR until your balance reaches at least 200 HBAR. Each faucet request grants a fixed amount, so you may need to request multiple times.

## Clone and Install

```bash
git clone https://github.com/hedera-dev/demo-hiero-hooks.git
cd demo-hiero-hooks
npm install
```

Expected output from `npm install`:

```
added XX packages in Xs
```

**TypeScript execution:** The demo scripts are TypeScript files (`.ts`). They run via `npx tsx`, which handles compilation transparently. You do not need to install `tsx` globally; `npx` fetches it on first use.

## Configure Environment

```bash
cp .env.example .env
```

Open `.env` in your editor and fill in your credentials:

```bash
# Network selection: previewnet | testnet | mainnet
HEDERA_NETWORK=testnet

# Operator credentials - get a free testnet/previewnet account at portal.hedera.com
# OPERATOR_PRIVATE_KEY must be an ECDSA private key (portal.hedera.com issues ECDSA by default)
OPERATOR_ACCOUNT_ID=0.0.XXXX
OPERATOR_PRIVATE_KEY=your-ecdsa-private-key-here
```

| Variable               | Description                                       | Example            |
| ---------------------- | ------------------------------------------------- | ------------------ |
| `HEDERA_NETWORK`       | Target network. Defaults to `testnet` if omitted. | `testnet`          |
| `OPERATOR_ACCOUNT_ID`  | Your Hedera account ID from the portal.           | `0.0.4515612`      |
| `OPERATOR_PRIVATE_KEY` | Your ECDSA private key (hex).                     | `0x45dhasd4367...` |

## Verify Setup

Run the setup verification script:

```bash
npx tsx src/00-setup-verify.ts
```

Expected output:

```
=== Hedera Hooks Demo - Setup Verification ===
Network:      testnet
Operator ID:  0.0.4515612
Mirror Node:  https://testnet.mirrornode.hedera.com

Querying operator account balance...
HBAR Balance: 200 ℏ

Setup verified. Ready to run the demo scripts.
```

If the script fails, check the table below.

### Common Errors

| Error                                                     | Cause                                                       | Fix                                                                                                                      |
| --------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ENOENT: .env` or `Missing required environment variable` | `.env` file is missing or incomplete.                       | Run `cp .env.example .env` and fill in all three variables.                                                              |
| `INVALID_SIGNATURE` or `INVALID_KEY_FORMAT`               | Wrong key type (ED25519 instead of ECDSA) or malformed key. | Copy the ECDSA private key from the portal. Ensure no extra whitespace or line breaks.                                   |
| `INSUFFICIENT_PAYER_BALANCE`                              | Account has too little HBAR.                                | Use the testnet faucet at [portal.hedera.com](https://portal.hedera.com) to add more HBAR.                               |
| `TIMEOUT` or `ECONNREFUSED`                               | Network unreachable.                                        | Check your internet connection. Verify `HEDERA_NETWORK` is set to a valid value (`previewnet`, `testnet`, or `mainnet`). |
| `Cannot find module`                                      | Dependencies not installed.                                 | Run `npm install` from the project root.                                                                                 |

## Network Switching

All scripts read `HEDERA_NETWORK` from `.env` to determine which network to use. Change a single variable to switch:

```bash
# In .env
HEDERA_NETWORK=testnet   # or testnet, or mainnet
```

The SDK client, mirror node URLs, and Hashscan links all adjust automatically based on this value.

**When you switch networks, delete `.state.json`:**

```bash
rm -f .state.json
```

The `.state.json` file stores contract IDs, account IDs, and hook IDs from previous script runs. These IDs are network-specific and will not resolve on a different network. Deleting the file forces scripts to redeploy from scratch on the new network.

## Cost Expectations

Hook operations cost more than typical Hedera transactions. Deploying a hook contract, creating an account with an attached hook, and triggering transfers with hook invocations each consume several HBAR.

A full run through all demo scripts (both the HelloHooks and ManagedTransferCap flows, plus cleanup) costs approximately **80-100 HBAR** at current testnet exchange rates. Repeating the demos or encountering errors that require retries will increase the total.

See [COSTS.md](../COSTS.md) for a detailed log of actual observed fees per operation.

**Recommendation:** Start with at least 200 HBAR in your testnet account. Testnet HBAR is free; request more from the faucet whenever your balance runs low.

## Verification Checklist

Before proceeding to the tutorial scripts, confirm each item:

- [ ] Node.js >= 18.0.0 installed (`node --version`)
- [ ] `npm install` completed without errors
- [ ] `.env` file created with all three variables populated
- [ ] `OPERATOR_PRIVATE_KEY` is an ECDSA key (not ED25519)
- [ ] `npx tsx src/00-setup-verify.ts` runs and prints your account balance
- [ ] Balance shows >= 200 HBAR
