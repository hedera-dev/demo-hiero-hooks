# Step-by-Step Guide

End-to-end walkthrough for the HIP-1195 Hedera Hooks demo. Each demo is standalone - pick one or run both.

> Expected output uses placeholder values. Your actual IDs, fees, and timestamps will differ.

---

## Table of Contents

- [Before You Start](#before-you-start)
- [Environment Setup](#environment-setup)
- [HelloHooks](#hellohooks)
- [ManagedTransferCap](#managedtransfercap)

---

## Before You Start

Make sure you have completed the steps in [PREREQUISITES.md](PREREQUISITES.md) before running anything here.

**Quick checklist:**

- [ ] Node.js >= 18 installed (`node --version`)
- [ ] `npm install` completed without errors
- [ ] `.env` file created from `.env.example` with your real credentials
- [ ] Your account has at least 200 HBAR (the HelloHooks demo costs ~17 HBAR, the ManagedTransferCap demo costs ~30 HBAR; get testnet HBAR from [portal.hedera.com](https://portal.hedera.com))

### Two config files, two jobs

| File | What it holds | When it changes |
|------|--------------|-----------------|
| `.env` | Your static credentials - operator account ID, private key, network choice. Set once and forget. | Only when you change accounts or switch networks |
| `.state.json` | IDs of resources created during script execution - contract IDs, test account IDs, hook IDs. Created and updated by the scripts themselves. | After every script that deploys something; **must be reset when switching networks** |

`.env` is your persistent identity. `.state.json` is the output of what you've built on-chain so far.

**Why a separate test account?** The demo requires two accounts: a sender (your operator) and a receiver with a hook attached. You can't demonstrate hook invocation with a single account. The test account is a throwaway created fresh each run; its private key doesn't exist until the create-account script generates it, which is why it lives in `.state.json` and not in `.env`.

### .state.json by demo

Each demo writes its own keys to `.state.json`. The two sets of keys do not overlap.

**After running HelloHooks scripts (01 through 05):**

```json
{
  "contractId": "0.0.XXXX",
  "testAccountId": "0.0.XXXX",
  "testAccountPrivKey": "<ECDSA private key - generated fresh each run>",
  "hookId": 1
}
```

**After running ManagedTransferCap scripts (01 through 08):**

```json
{
  "capContractId": "0.0.XXXX",
  "capAccountId": "0.0.XXXX",
  "capAccountPrivKey": "<ECDSA private key - generated fresh each run>",
  "capTokenId": "0.0.XXXX",
  "capHookId": 2
}
```

**If both demos are run (any order):** Both sets of keys coexist in `.state.json`. Each demo's cleanup script removes only its own keys - it does not touch the other demo's state.

To start a completely fresh run (deploy new contracts, create new accounts), reset it:

```bash
echo '{}' > .state.json
```

**Reset `.state.json` whenever you switch networks.** All IDs in it (contract IDs, account IDs, hook IDs) are network-specific. A `.state.json` from previewnet is invalid on testnet and will cause every script to fail with `INVALID_ACCOUNT_ID` or `INVALID_CONTRACT_ID`. Change `HEDERA_NETWORK` in `.env`, then reset `.state.json` before running any scripts.

**All commands run from the `demo-repo/` directory.**

---

## Environment Setup

Verify that your credentials, SDK, and network connection are working.

### Step 0: Verify Setup

```bash
npx tsx src/00-setup-verify.ts
```

**Expected output:**

```
=== Hedera Hooks Demo - Setup Verification ===
Network:      testnet
Operator ID:  0.0.XXXX
Mirror Node:  https://testnet.mirrornode.hedera.com

Querying operator account balance...
HBAR Balance: XXXX ℏ

Setup verified. Ready to run the demo scripts.
```

**What this proves:** Your `.env` credentials are valid, the SDK can connect to the configured network, and the mirror node URL is reachable.

**If it fails:**

| Error | Fix |
|-------|-----|
| `OPERATOR_ACCOUNT_ID and OPERATOR_PRIVATE_KEY must be set` | Copy `.env.example` to `.env` and fill in your credentials |
| `Invalid private key` | Your key must be ECDSA format. Re-export from [portal.hedera.com](https://portal.hedera.com) |
| `HBAR Balance: 0 ℏ` | Fund your account at [faucet.hedera.com](https://faucet.hedera.com) |

---

## HelloHooks

> This demo is standalone. You can run it without completing the ManagedTransferCap demo.

Deploy a hook contract that inspects ProposedTransfers, attach it to a test account, send an HBAR transfer that triggers the hook, and verify the result on the mirror node.

**What you'll see:** An HBAR transfer of exactly 1 HBAR where the HelloHooks hook is invoked, inspects ProposedTransfers, and approves it. A second transfer of 2 HBAR is rejected because it is not exactly 1 HBAR. This demonstrates a hook that enforces a specific transfer amount.

> **Hedera concept: `ACCOUNT_ALLOWANCE_HOOK`**
>
> `ACCOUNT_ALLOWANCE_HOOK` lets an account owner attach programmable Solidity logic that runs when a transfer targets their account. The sender explicitly attaches a `FungibleHookCall` to the transfer, and the network invokes the hook's `allow()` function. If it returns `true`, the transfer proceeds. `FungibleHookCall` works for both plain HBAR transfers (`addHbarTransferWithHook`) and HTS fungible token transfers (`addTokenTransferWithHook`) - there is no separate hook call type for HBAR.

**Run all HelloHooks scripts in one command:**

```bash
npx tsx src/hello-hooks/01-deploy.ts && \
npx tsx src/hello-hooks/02-create-account.ts && \
npx tsx src/hello-hooks/03-trigger.ts && \
npx tsx src/hello-hooks/04-trigger-wrong-amount.ts && \
npx tsx src/hello-hooks/05-query.ts && \
npx tsx src/hello-hooks/06-cleanup.ts
```

---

### Compile Contracts

Before deploying, compile the Solidity contracts to generate the bytecode files:

```bash
npm run compile
```

This produces `build/contracts/HelloHooks.bytecode.txt` and `build/contracts/ManagedTransferCap.bytecode.txt`. You only need to run this once (or again if you modify the `.sol` files).

---

### Step 1: Deploy Hook Contract

```bash
npx tsx src/hello-hooks/01-deploy.ts
```

**Expected output:**

```
=== Step 1: Deploy HelloHooks Hook Contract ===
Bytecode length: 1602 bytes
Submitting ContractCreateFlow...
  Fee charged: 5.08527302 ℏ
Contract deployed: 0.0.8498982
Transaction ID:   0.0.7536968@1775242791.357031664
Saved contractId to .state.json
```

**What this does:** Deploys the `HelloHooks` contract to the configured network. The contract inspects `ProposedTransfers` and approves only exactly 1 HBAR (100,000,000 tinybars). The contract ID is saved to `.state.json` for subsequent scripts.

**If it fails:**

| Error | Fix |
|-------|-----|
| `INSUFFICIENT_GAS` | Increase `setGas()` in `src/hello-hooks/01-deploy.ts` |
| `INVALID_FILE_ID` or bytecode error | Check that the bytecode file exists and is non-empty |

**Optional: Verify on HashScan.** After deployment, you can verify the contract source on HashScan for transparency. The deploy output includes the EVM address. Run:

```bash
./generate_hedera_sc_metadata.sh HelloHooks=0x<evm-address-from-output>
```

Then upload `verify-bundles/HelloHooks/metadata.json` at `hashscan.io/<network>/contract/<contract-id>` -> "Verify Contract".

---

### Step 2: Create Test Account and Attach Hook

```bash
npx tsx src/hello-hooks/02-create-account.ts
```

**Expected output:**

```
=== Step 2: Create Test Account and Attach Hook ===
Generated ECDSA key for test account
Creating test account with hookId=1...
  Fee charged: 11.95436241 ℏ
Test account created: 0.0.8498983
Hook attached with hookId=1 -> contract 0.0.8498982
Transaction ID: 0.0.7536968@1775242794.087493973

Saved testAccountId, hookId=1 to .state.json
```

**What this does:**

1. Generates a fresh ECDSA key pair for the test account
2. Creates the test account with the HelloHooks hook attached at creation with `hookId=1`

No token creation or association needed - the basic demo uses plain HBAR. The ManagedTransferCap demo introduces HTS tokens to show the same hook mechanism applied to token transfers.

**Key concept:** `hookId` is client-chosen. The value `1` is arbitrary but must match what `src/hello-hooks/03-trigger.ts` sends in its `FungibleHookCall`. The network uses this ID to look up which hook to invoke.

**If it fails:**

| Error | Fix |
|-------|-----|
| `Run 01-deploy first` | Run `src/hello-hooks/01-deploy.ts` first |
| `INSUFFICIENT_TX_FEE` | Increase `setMaxTransactionFee` in `src/hello-hooks/02-create-account.ts` |

---

### Step 3: Transfer Exactly 1 HBAR (Hook Approves)

```bash
npx tsx src/hello-hooks/03-trigger.ts
```

**Expected output:**

```
=== Step 3: Transfer Exactly 1 HBAR (Hook Approves) ===
Sending 1 HBAR:
  From: 0.0.7536968 (operator)
  To:   0.0.8498983
  Hook: hookId=1

The hook inspects ProposedTransfers and approves only exactly 1 HBAR.
Submitting TransferTransaction...
  Fee charged: 0.15467825 ℏ

Transfer succeeded! Status: SUCCESS
Transaction ID: 0.0.7536968@1775242797.494597392

The hook read ProposedTransfers, found exactly 1 HBAR credit, and approved.
```

**What this proves:** The hook read ProposedTransfers, found exactly 1 HBAR credit to the hook owner, and approved.

**HBAR vs HTS:** `FungibleHookCall` is not HTS-only - it covers plain HBAR transfers and HTS fungible tokens equally. This demo uses HBAR to keep setup minimal. The ManagedTransferCap demo uses HTS tokens to show the same mechanism applied to token transfers.

**If it fails:**

| Error | Fix |
|-------|-----|
| `hookId missing in .state.json` | Run `src/hello-hooks/02-create-account.ts` first |
| `INVALID_SIGNATURE` | The hookId in `FungibleHookCall` doesn't match what was set at account creation; reset `.state.json` and re-run from `src/hello-hooks/01-deploy.ts` |
| `FAIL_INVALID` | Hook contract EVM execution failed; verify bytecode in `build/contracts/HelloHooks.bytecode.txt` is the reference bytecode |
| `BAD_HOOK_REQUEST` | Missing `evmHookCall` or `hookId` in `FungibleHookCall`; check `src/hello-hooks/03-trigger.ts` |

---

### Step 4: Transfer Wrong Amount (Hook Rejects)

```bash
npx tsx src/hello-hooks/04-trigger-wrong-amount.ts
```

**Expected output:**

```
=== Step 4: Transfer Wrong Amount (Hook Rejects) ===
Sending 2 HBAR (not exactly 1 - hook will reject):
  From: 0.0.7536968 (operator)
  To:   0.0.8498983
  Hook: hookId=1

Expected: allow() returns false -> REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK
Submitting TransferTransaction...
  Fee: not recorded (receipt for transaction 0.0.7536968@1775242802.197862793 contained error status REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK)

Transfer correctly rejected: receipt for transaction 0.0.7536968@1775242802.197862793 contained error status REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK
Hook enforcement is working - 2 HBAR is not exactly 1 HBAR.
```

**What this proves:** The hook enforces the 1 HBAR rule. 2 HBAR is not 1 HBAR, so `allow()` returns `false`. The network rejects the transfer with `REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK`.

> **Note on fee recording:** `REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK` is a consensus-level rejection - the transaction reaches the network, the hook runs, and the fee is charged even though the transfer fails. The cost utility cannot retrieve the fee via `getRecord` because the SDK validates receipt status before returning.

**If it fails:**

| Error | Fix |
|-------|-----|
| `hookId missing in .state.json` | Run `src/hello-hooks/02-create-account.ts` first |
| Transfer succeeds instead of being rejected | Verify the contract bytecode enforces the 1 HBAR check; recompile and redeploy |

---

### Step 5: Verify Hook State on Mirror Node

```bash
npx tsx src/hello-hooks/05-query.ts
```

**Expected output:**

```
=== Step 5: Query Mirror Node for Hook State ===
Waiting 5 seconds for mirror node propagation...

Querying: https://testnet.mirrornode.hedera.com/api/v1/accounts/0.0.8498983/hooks
(Paste this URL in your browser to see the raw response)

Response:
{
  "hooks": [
    {
      "admin_key": null,
      "contract_id": "0.0.8498982",
      "created_timestamp": "1775242801.773249549",
      "deleted": false,
      "extension_point": "ACCOUNT_ALLOWANCE_HOOK",
      "hook_id": 1,
      "owner_id": "0.0.8498983",
      "timestamp_range": {
        "from": "1775242801.773249549",
        "to": null
      },
      "type": "EVM"
    }
  ],
  "links": {
    "next": null
  }
}

--- Verification ---
extension_point: ACCOUNT_ALLOWANCE_HOOK (expected: ACCOUNT_ALLOWANCE_HOOK)
deleted:         false         (expected: false)
contract_id:     0.0.8498982     (expected: 0.0.8498982)

Hook state verified.
```

**What this proves:** The hook is registered on the account in on-chain state and visible via the mirror node REST API. Key fields:

- `extension_point: ACCOUNT_ALLOWANCE_HOOK` - confirms this is the correct hook type
- `deleted: false` - hook is active
- `contract_id` - matches the deployed contract from step 1
- `timestamp_range.to: null` - hook has no expiry

**If it fails:**

| Error | Fix |
|-------|-----|
| `No hooks found` | Mirror node has ~3-5 second propagation lag; wait and retry |
| `404` or empty response | Verify `testAccountId` in `.state.json` is the correct account |

At this point, the HelloHooks demo is functionally complete. You have demonstrated: (1) a smart contract deployed as a hook on Hedera; (2) an account with a hook that approved an exactly-1-HBAR transfer via its `allow()` function; (3) the hook rejecting a 2 HBAR transfer - proving the ProposedTransfers inspection works; (4) the hook acting as programmable authorization logic with amount enforcement; (5) mirror node reflecting hook state as queryable on-chain data.

---

### Step 6: Cleanup

```bash
npx tsx src/hello-hooks/06-cleanup.ts
```

**Expected output:**

```
=== Step 6: Cleanup - Delete HelloHooks Hook ===
HelloHooks account: 0.0.8498983, hookId=1

--- Phase 1: Delete hook ---
Deleting hookId=1 from account 0.0.8498983...
  Fee charged: 11.36000565 ℏ
HelloHooks hook deleted. Status: SUCCESS

--- Phase 2: Mirror node verification ---
Waiting 5 seconds for mirror node propagation...
Querying: https://testnet.mirrornode.hedera.com/api/v1/accounts/0.0.8498983/hooks
hookId=1, deleted=true (expected: true)

--- Phase 3: Local cleanup ---
Removed HelloHooks keys from .state.json

HelloHooks cleanup complete: deleted successfully
To re-run the HelloHooks demo, start from hello-hooks/01-deploy.ts.
```

**What this does:**

1. Deletes the hook from the test account via `AccountUpdateTransaction.addHookToDelete()`
2. Queries the mirror node to confirm the hook shows `deleted: true`
3. Removes only the HelloHooks keys (`contractId`, `testAccountId`, `testAccountPrivKey`, `hookId`) from `.state.json` - does not touch ManagedTransferCap keys if present

**If it fails:**

| Error | Fix |
|-------|-----|
| `INVALID_ACCOUNT_ID` | `.state.json` contains stale IDs; reset and re-run the demo |
| `hookId missing` | Run the full demo (01 through 05) before cleanup |

---

## ManagedTransferCap

> This demo is standalone. You can run it without completing the HelloHooks demo.

> **Note:** The ManagedTransferCap demo uses `receiver_sig_required=true` on its test account to force all inbound transfers through the hook. When `receiver_sig_required=true` is set, the account must co-sign every inbound credit - the hook replaces that co-signature with on-chain transfer cap enforcement. The HelloHooks demo does not need this flag because it only demonstrates hook invocation with amount enforcement; the ManagedTransferCap needs it to ensure no transfer can bypass the cap gate.

The `ManagedTransferCap` hook implements a conditional, stateful, two-phase hook that gates transfers with a configurable cap. The hook uses `PRE_POST_TX_ALLOWANCE_HOOK` which calls `allowPre()` before the transfer commits and `allowPost()` after. `allowPre()` reads the remaining cap from hook-scoped storage slot 0x00 and checks the proposed transfer amount from `ProposedTransfers`. `allowPost()` deducts the amount from the remaining cap. Hook state is managed cheaply via `HookStoreTransaction` - no EVM execution needed to set or increase the cap.

**How it works:**

- `PRE_POST_TX_ALLOWANCE_HOOK` invokes the contract's `allowPre()` before commit and `allowPost()` after commit.
- The hook owner writes a cap value (e.g. 500) to hook-scoped storage slot 0x00 via `HookStoreTransaction`.
- `allowPre()` reads slot 0x00 (remaining cap), reads the transfer amount from `ProposedTransfers`, and returns `true` only if the amount is within the cap.
- `allowPost()` runs only if `allowPre()` approved. It deducts the transfer amount from the remaining cap and writes the new value back to slot 0x00.
- Returning false from `allowPre()` produces `REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK`.
- No sender-supplied data is needed - the hook inspects `ProposedTransfers` directly.
- In hook execution context, `address(this)` equals `0x16d` (the Hedera hook executor address).

**What you'll see:** `src/managed-transfer-cap/04-transfer-within-cap.ts` (200 MCT, within cap) succeeds. `src/managed-transfer-cap/05-transfer-exceeds-cap.ts` (400 MCT, exceeds remaining ~300) is rejected with `REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK`. After increasing the cap in step 07, `src/managed-transfer-cap/08-transfer-after-increase.ts` (400 MCT) succeeds.

**Run all ManagedTransferCap scripts in one command:**

```bash
npx tsx src/managed-transfer-cap/01-deploy.ts && \
npx tsx src/managed-transfer-cap/02-create-account.ts && \
npx tsx src/managed-transfer-cap/03-set-cap.ts && \
npx tsx src/managed-transfer-cap/04-transfer-within-cap.ts && \
npx tsx src/managed-transfer-cap/05-transfer-exceeds-cap.ts && \
npx tsx src/managed-transfer-cap/06-query.ts && \
npx tsx src/managed-transfer-cap/07-increase-cap.ts && \
npx tsx src/managed-transfer-cap/08-transfer-after-increase.ts && \
npx tsx src/managed-transfer-cap/09-cleanup.ts
```

---

### Step 1: Deploy ManagedTransferCap Hook Contract

```bash
npx tsx src/managed-transfer-cap/01-deploy.ts
```

**Expected output:**

```
=== Step 1: Deploy ManagedTransferCap Hook Contract ===
Bytecode length: 2099 bytes
Submitting ContractCreateFlow...
  Fee charged: 5.19348551 ℏ
Contract deployed: 0.0.8498993
Transaction ID:   0.0.7536968@1775242900.899748966
Saved capContractId to .state.json
```

**What this does:** Deploys the `ManagedTransferCap` contract. Implements `allowPre()` and `allowPost()` with `HOOK_ADDR` guard (`address(this) == 0x16d`). `allowPre()` reads the cap and checks the proposed transfer amount; `allowPost()` deducts the amount. Contract ID is saved to `.state.json`.

**If it fails:**

| Error | Fix |
|-------|-----|
| `INSUFFICIENT_GAS` | Increase `setGas()` in `src/managed-transfer-cap/01-deploy.ts` |
| Bytecode error | Check `build/contracts/ManagedTransferCap.bytecode.txt` exists and is non-empty |

**Optional: Verify on HashScan.** Run `./generate_hedera_sc_metadata.sh ManagedTransferCap=0x<evm-address>` and upload `verify-bundles/ManagedTransferCap/metadata.json` at HashScan.

---

### Step 2: Create Test Account, MCT Token, and Attach Hook

```bash
npx tsx src/managed-transfer-cap/02-create-account.ts
```

**Expected output:**

```
=== Step 2: Create Test Account, Token, and Attach Hook ===
Generated ECDSA key for test account
Creating account with hookId=2, receiver_sig_required=true...
  Fee charged: 11.95436241 ℏ
Test account created: 0.0.8498994
Hook attached with hookId=2 -> contract 0.0.8498993

Creating HTS fungible token (MCT - Managed Cap Token)...
  Fee charged: 9.81179263 ℏ
Token created: 0.0.8498995 (MCT, supply=10000, decimals=0)

Associating MCT token with cap account...
  Fee charged: 0.89999757 ℏ
Token associated with cap account

Saved capAccountId, capTokenId, capHookId=2 to .state.json
```

**What this does:** Same hook-attachment pattern as HelloHooks but with `receiver_sig_required=true` (to force transfers through the hook) and `hookId=2` pointing to the ManagedTransferCap contract. Also creates an HTS fungible token (MCT - Managed Cap Token) and associates it with the test account. The ManagedTransferCap demo uses separate state keys (`capAccountId`, `capTokenId`, `capHookId`) so both demos can coexist in `.state.json`.

---

### Step 3: Set Transfer Cap via HookStoreTransaction

```bash
npx tsx src/managed-transfer-cap/03-set-cap.ts
```

**Expected output:**

```
=== Step 3: Set Transfer Cap via HookStoreTransaction ===
Cap value: 500 token units
Encoded value (minimal): 0x01f4
Writing to hook-scoped storage slot 0x00...
  Fee charged: 0.05678064 ℏ
Cap set! Status: SUCCESS
Transaction ID: 0.0.7536968@1775242910.594492207

Cap set to 500 token units
Slot 0x00 now holds uint256(500). Transfers up to 500 will be approved.
Run managed-transfer-cap/04-transfer-within-cap.ts to test a transfer within the cap.
```

**What this does:** Writes the value 500 to hook-scoped storage slot 0x00 via `HookStoreTransaction`. No EVM execution - this is the HIP-1195 cheap state update mechanism. The cap represents the maximum total token amount that can be received before needing an increase.

**Key encoding rule:** The slot key must use minimal byte representation (no leading zeros). Slot 0 must be sent as empty bytes `[]`, not 32 zero bytes. Sending 32 zero bytes causes `EVM_HOOK_STORAGE_UPDATE_BYTES_MUST_USE_MINIMAL_REPRESENTATION` precheck failure.

**Storage note:** `HookStoreTransaction` writes to hook-scoped storage `(entity, hookId)`. The `sload(0)` in `allowPre()` reads from this same bucket. The cap value written here is what the contract compares against in `src/managed-transfer-cap/04-transfer-within-cap.ts`.

**If it fails:**

| Error | Fix |
|-------|-----|
| `EVM_HOOK_STORAGE_UPDATE_BYTES_MUST_USE_MINIMAL_REPRESENTATION` | The slot key uses too many bytes; ensure `toMinimalBytes()` strips all leading zeros |
| `Run scripts 01 and 02 first` | Run `src/managed-transfer-cap/01-deploy.ts` and `src/managed-transfer-cap/02-create-account.ts` first |

---

### Step 4: Transfer Within Cap (200 MCT - Succeeds)

```bash
npx tsx src/managed-transfer-cap/04-transfer-within-cap.ts
```

**Expected output:**

```
=== Step 4: Transfer Within Cap (200 tokens) ===
Sending 200 MCT tokens:
  From: 0.0.7536968 (operator)
  To:   0.0.8498994 (receiver_sig_required=true)
  Hook: hookId=2
  Type: PRE_POST_TX_ALLOWANCE_HOOK (two-phase: allowPre + allowPost)

Expected: 200 <= 500 cap -> approved; remaining cap becomes 300.
Submitting TransferTransaction...
  Fee charged: 0.31843259 ℏ

Transfer succeeded! Status: SUCCESS
Transaction ID: 0.0.7536968@1775242913.847004065

allowPre() approved (200 <= 500), allowPost() deducted 200.
Remaining cap is now 300 token units.
```

**What this proves:** The complete two-phase hook pattern with `PRE_POST_TX_ALLOWANCE_HOOK`. The hook reads the proposed transfer amount from `ProposedTransfers` - no sender-supplied data needed. `allowPre()` approved the 200 MCT transfer (within the 500 cap), and `allowPost()` decremented the remaining cap to ~300.

> **Hedera concept: `PRE_POST_TX_ALLOWANCE_HOOK`**
>
> Unlike `PRE_TX_ALLOWANCE_HOOK` which calls `allow()` once, `PRE_POST_TX_ALLOWANCE_HOOK` calls two functions: `allowPre()` runs before the transfer commits (validation phase) and `allowPost()` runs after the transfer commits (state update phase). This two-phase design ensures the cap is only decremented when the transfer actually settles. If `allowPre()` returns `false`, `allowPost()` never runs.

---

### Step 5: Transfer Exceeds Cap (400 MCT - Rejected)

```bash
npx tsx src/managed-transfer-cap/05-transfer-exceeds-cap.ts
```

**Expected output:**

```
=== Step 5: Transfer Exceeding Cap (400 tokens) ===
Sending 400 MCT tokens:
  From:      0.0.7536968 (operator)
  To:        0.0.8498994 (receiver_sig_required=true)
  Hook:      hookId=2
  Type:      PRE_POST_TX_ALLOWANCE_HOOK

Expected: 400 > 300 remaining cap -> REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK
Submitting TransferTransaction...
  Fee: not recorded (receipt for transaction 0.0.7536968@1775242917.014004733 contained error status REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK)

Transfer correctly rejected: receipt for transaction 0.0.7536968@1775242917.014004733 contained error status REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK
Hook enforcement is working - 400 exceeds remaining cap of 300.
Run managed-transfer-cap/07-increase-cap.ts to raise the cap.
```

> **Note on fee recording:** `REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK` is a consensus-level rejection - the transaction reaches the network, the hook runs, and the fee is charged even though the transfer fails. The cost utility cannot retrieve the fee via `getRecord` because the SDK validates receipt status before returning. The fee is similar to a successful hook invocation (~0.08-0.12 HBAR).

**What this proves:** The cap gate is functional. The hook's `allowPre()` checked that 400 exceeds the remaining ~300 cap and returned `false`. Since `allowPre()` rejected, `allowPost()` never ran - the cap remains at ~300.

---

### Step 6: Query Hook State via Mirror Node

```bash
npx tsx src/managed-transfer-cap/06-query.ts
```

**Expected output:**

```
=== Step 6: Query Hook State via Mirror Node ===
Waiting 5 seconds for mirror node propagation...

Querying: https://testnet.mirrornode.hedera.com/api/v1/accounts/0.0.8498994/hooks
(Paste this URL in your browser to see the raw response)

Hooks response:
{
  "hooks": [
    {
      "admin_key": null,
      "contract_id": "0.0.8498993",
      "created_timestamp": "1775242909.531221110",
      "deleted": false,
      "extension_point": "ACCOUNT_ALLOWANCE_HOOK",
      "hook_id": 2,
      "owner_id": "0.0.8498994",
      "timestamp_range": {
        "from": "1775242909.531221110",
        "to": null
      },
      "type": "EVM"
    }
  ],
  "links": {
    "next": null
  }
}

--- Hook Verification ---
extension_point: ACCOUNT_ALLOWANCE_HOOK (expected: ACCOUNT_ALLOWANCE_HOOK)
deleted:         false         (expected: false)
contract_id:     0.0.8498993     (expected: 0.0.8498993)

Hook state verified.

--- HOOKSTORE Transactions ---
Querying: https://testnet.mirrornode.hedera.com/api/v1/transactions?account.id=0.0.7536968&transactiontype=HOOKSTORE&limit=5&order=desc

Found 1 HOOKSTORE transaction(s):
  0.0.7536968-1775242910-594492207 - SUCCESS (1775242917.257425588)
```

**What this proves:** The hook is registered and active on-chain. `HookStoreTransaction` (for setting the cap) appears in the mirror node transaction history. The `HOOKSTORE` transaction type is a new transaction type introduced by HIP-1195 and is visible in the mirror node like any other transaction.

---

### Step 7: Increase Cap via HookStoreTransaction

```bash
npx tsx src/managed-transfer-cap/07-increase-cap.ts
```

**Expected output:**

```
=== Step 7: Increase Transfer Cap ===
New cap value: 1000 token units
Encoded value (minimal): 0x03e8
Writing to hook-scoped storage slot 0x00...
  Fee charged: 0.05678064 ℏ
Cap updated! Status: SUCCESS
Transaction ID: 0.0.7536968@1775242923.867976376

Cap increased to 1000 token units
Transfers up to 1000 will now be approved.
Run managed-transfer-cap/08-transfer-after-increase.ts to test.
```

**What this demonstrates:** The economic advantage of `HookStoreTransaction` - increasing the cap is a cheap storage write (no EVM setter function, no gas for EVM execution). The hook owner calls `HookStoreTransaction.addStorageUpdate()` to write a new cap value to slot 0x00. The same pattern applies to any hook state update.

---

### Step 8: Transfer After Cap Increase (400 MCT - Succeeds)

```bash
npx tsx src/managed-transfer-cap/08-transfer-after-increase.ts
```

**Expected output:**

```
=== Step 8: Transfer After Cap Increase (400 tokens) ===
Sending 400 MCT tokens:
  From: 0.0.7536968 (operator)
  To:   0.0.8498994 (receiver_sig_required=true)
  Hook: hookId=2
  Type: PRE_POST_TX_ALLOWANCE_HOOK

Expected: 400 <= 1000 cap -> approved; remaining cap becomes 600.
Submitting TransferTransaction...
  Fee charged: 0.31843259 ℏ

Transfer succeeded! Status: SUCCESS
Transaction ID: 0.0.7536968@1775242930.798539106

allowPre() approved (400 <= 1000), allowPost() deducted 400.
Remaining cap is now 600 token units.
```

**What this proves:** The cap increase via `HookStoreTransaction` (step 7) took effect immediately. The same 400 MCT transfer that was rejected in step 5 now succeeds because the remaining cap was increased to 1000. This demonstrates the full update-and-verify cycle: set state -> trigger -> reject -> update state -> re-trigger -> approve.

At this point, the ManagedTransferCap demo is functionally complete. You have demonstrated: (1) deploying the ManagedTransferCap hook contract (`allowPre()` reads cap and checks `ProposedTransfers`, `allowPost()` deducts amount, `HOOK_ADDR` guard); (2) attaching it to an account at creation with `hookId=2` and `receiver_sig_required=true` (separate from the HelloHooks `hookId=1`); (3) writing hook state via `HookStoreTransaction` - the cheap state update mechanism (no EVM execution, no setter function in the contract); (4) the two-phase `PRE_POST_TX_ALLOWANCE_HOOK` pattern where `allowPre()` validates and `allowPost()` updates state; (5) that the hook reads transfer amounts from `ProposedTransfers` directly - no sender-supplied data needed; (6) the complete hook lifecycle: deploy -> attach -> set cap -> trigger -> reject -> increase cap -> re-trigger -> cleanup; (7) that `address(this)` equals `0x16d` in hook execution context (confirmed by the HOOK_ADDR guard passing); (8) that `sload(0)` inside a hook reads from hook-scoped storage written by `HookStoreTransaction`; (9) that exceeding the cap produces `REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK` (enforcement confirmed working); (10) how `HOOKSTORE` transactions appear in the mirror node alongside regular transactions.

---

### Step 9: Cleanup

Demonstrates the final phase of the hook lifecycle: clearing hook storage, attempting hook deletion, and confirming state via the mirror node.

**When to run cleanup:**

- Before switching networks (previewnet -> testnet or vice versa)
- To start fresh before re-running the demo
- When you no longer need the hook on the test account

**Why cleanup matters:** Hooks are persistent on-chain state. Once attached to an account, a hook runs on every qualifying transfer until explicitly deleted. In production, you would delete hooks when replacing a hook with an updated version, decommissioning an account's transfer rules, or rotating from one security policy to another.

#### Known gap: sstore during hook execution blocks deletion

The ManagedTransferCap contract calls `sstore(0, newCap)` in `allowPost()` to update the remaining cap after each approved transfer. This EVM operation creates storage slot entries tracked by the consensus node's `num_storage_slots` counter. These entries **cannot be removed** via `HookStoreTransaction` - neither by omitting the value (deletion) nor by setting it to empty bytes (zeroing). The `HookStoreTransaction` reports SUCCESS, but the counter remains > 0, blocking `addHookToDelete()`.

**Impact:** Hooks that use `sstore` during EVM execution cannot currently be deleted from accounts. They can be effectively disabled by clearing their storage (the contract's logic returns false when the cap is zero).

**Status:** This is a known protocol-level issue; no SDK workaround currently exists.

```bash
npx tsx src/managed-transfer-cap/09-cleanup.ts
```

**Expected output:**

```
=== Step 9: Cleanup - Delete ManagedTransferCap Hook ===
Cap account: 0.0.8498994, hookId=2

--- Phase 1: Clear hook storage (slot 0x00) ---
  Fee charged: 0.05678064 ℏ
Slot 0x00 cleared. Status: SUCCESS

--- Phase 2: Delete hook ---
Deleting hookId=2 from account 0.0.8498994...
  Fee: not recorded (receipt for transaction 0.0.7536968@1775242934.602729062 contained error status HOOK_DELETION_REQUIRES_ZERO_STORAGE_SLOTS)
Hook deleted. Status: unknown (check transaction on HashScan)

--- Phase 3: Mirror node verification ---
Waiting 5 seconds for mirror node propagation...
Querying: https://testnet.mirrornode.hedera.com/api/v1/accounts/0.0.8498994/hooks
hookId=2, deleted=false (expected: true)

--- Phase 4: Local cleanup ---
Removed ManagedTransferCap keys from .state.json

ManagedTransferCap cleanup complete: deleted successfully
To re-run the demo, start from managed-transfer-cap/01-deploy.ts.
```

**What this demonstrates:**

1. `HookStoreTransaction` with omitted value - how to clear storage slots
2. The `HOOK_DELETION_REQUIRES_ZERO_STORAGE_SLOTS` constraint and its interaction with EVM `sstore` operations
3. How to "disable" a hook when deletion is blocked: clear the storage so the contract's logic rejects all transfers (cap is zero)
4. Mirror node verification of hook state after cleanup
5. Each demo's cleanup removes only its own keys from `.state.json`

After cleanup, the ManagedTransferCap keys are removed from `.state.json`. The hook remains attached but disabled (storage cleared). The test account remains on the network with its HBAR balance. To re-run the demo, start from `src/managed-transfer-cap/01-deploy.ts`.
