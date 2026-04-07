# How It Works

Technical walkthrough of the demo code - how the scripts fit together, what state they share, and which SDK classes power each operation.

---

## Table of Contents

- [Script Sequence](#script-sequence)
- [State Management](#state-management)
- [SDK Classes Used](#sdk-classes-used)
- [Network Architecture](#network-architecture)
- [Shared Utilities](#shared-utilities)
- [Cost Recording](#cost-recording)
- [Hook Lifecycle](#hook-lifecycle)

---

## Script Sequence

Each demo is a standalone sequence of numbered scripts in its own directory. A shared setup script verifies the environment before either demo.

```
┌──────────────────────────────────────────────────────────────────────┐
│  00-setup-verify.ts  (shared - run once before either demo)         │
└──────────────┬───────────────────────────────┬───────────────────────┘
               │                               │
               ▼                               ▼
┌──────────────────────────┐   ┌───────────────────────────────────────┐
│  hello-hooks/            │   │  managed-transfer-cap/                │
│                          │   │                                       │
│  01-deploy.ts            │   │  01-deploy.ts                         │
│    ▼                     │   │    ▼                                  │
│  02-create-account.ts    │   │  02-create-account.ts                 │
│    ▼                     │   │    ▼                                  │
│  03-trigger.ts           │   │  03-set-cap.ts                        │
│    ▼                     │   │    ▼                                  │
│  04-trigger-wrong-amt.ts │   │  04-transfer-within-cap.ts            │
│    ▼                     │   │    ▼                                  │
│  05-query.ts             │   │  05-transfer-exceeds-cap.ts           │
│    ▼                     │   │    ▼                                  │
│  06-cleanup.ts           │   │  06-query.ts                          │
│                          │   │    ▼                                  │
└──────────────────────────┘   │  07-increase-cap.ts                   │
                               │    ▼                                  │
                               │  08-transfer-after-increase.ts        │
                               │    ▼                                  │
                               │  09-cleanup.ts                        │
                               └───────────────────────────────────────┘
```

Each demo is independent - you can run one, the other, or both. They share `.state.json` at the project root but use separate key prefixes so they don't conflict.

**What each script produces and what the next consumes:**

| Script                    | Reads from .state.json                                            | Writes to .state.json                                          | On-chain effect                                   |
| ------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| `00-setup-verify`         | nothing                                                           | nothing                                                        | Queries operator balance via mirror node          |
| `hello-hooks/01`          | nothing                                                           | `contractId`                                                   | Deploys HelloHooks contract                       |
| `hello-hooks/02`          | `contractId`                                                      | `testAccountId`, `testAccountPrivKey`, `hookId`                | Creates account with hook attached                |
| `hello-hooks/03`          | `contractId`, `testAccountId`, `hookId`                           | nothing                                                        | 1 HBAR transfer triggers hook (approved)          |
| `hello-hooks/04`          | `contractId`, `testAccountId`, `hookId`                           | nothing                                                        | 2 HBAR transfer triggers hook (rejected)          |
| `hello-hooks/05`          | `testAccountId`, `hookId`                                         | nothing                                                        | Mirror node query only                            |
| `hello-hooks/06`          | `testAccountId`, `testAccountPrivKey`, `hookId`                   | removes keys                                                   | Deletes hook, verifies via mirror node            |
| `managed-transfer-cap/01` | nothing                                                           | `capContractId`                                                | Deploys ManagedTransferCap contract               |
| `managed-transfer-cap/02` | `capContractId`                                                   | `capAccountId`, `capAccountPrivKey`, `capTokenId`, `capHookId` | Creates account, MCT token, attaches hook         |
| `managed-transfer-cap/03` | `capContractId`, `capAccountId`, `capAccountPrivKey`, `capHookId` | nothing                                                        | Writes cap value (500) to slot 0x00               |
| `managed-transfer-cap/04` | `capAccountId`, `capTokenId`, `capHookId`                         | nothing                                                        | Token transfer within cap (200 MCT, succeeds)     |
| `managed-transfer-cap/05` | `capAccountId`, `capTokenId`, `capHookId`                         | nothing                                                        | Token transfer exceeding cap (400 MCT, rejected)  |
| `managed-transfer-cap/06` | `capContractId`, `capAccountId`                                   | nothing                                                        | Mirror node query only                            |
| `managed-transfer-cap/07` | `capContractId`, `capAccountId`, `capAccountPrivKey`, `capHookId` | nothing                                                        | Increases cap to 1000 via HookStoreTransaction    |
| `managed-transfer-cap/08` | `capAccountId`, `capTokenId`, `capHookId`                         | nothing                                                        | Token transfer after increase (400 MCT, succeeds) |
| `managed-transfer-cap/09` | `capAccountId`, `capAccountPrivKey`, `capHookId`                  | removes keys                                                   | Clears storage, deletes hook, verifies            |

---

## State Management

All inter-script state lives in `.state.json` at the project root. Scripts use `loadState()` and `saveState()` from `src/utils/state.ts` to read and merge state incrementally.

### How it works

- `loadState(requiredKeys, hint)` - reads `.state.json`, validates that required keys exist, throws with a helpful message if any are missing.
- `saveState(updates)` - reads the current file, merges the update object via `Object.assign`, writes back. This is additive - HelloHooks keys and ManagedTransferCap keys coexist in the same file.

### Schema after HelloHooks scripts (01-05)

```json
{
  "contractId": "0.0.XXXX",
  "testAccountId": "0.0.XXXX",
  "testAccountPrivKey": "<raw ECDSA hex>",
  "hookId": 1
}
```

### Schema after ManagedTransferCap scripts (01-08)

```json
{
  "contractId": "0.0.XXXX",
  "testAccountId": "0.0.XXXX",
  "testAccountPrivKey": "<raw ECDSA hex>",
  "hookId": 1,
  "capContractId": "0.0.XXXX",
  "capAccountId": "0.0.XXXX",
  "capAccountPrivKey": "<raw ECDSA hex>",
  "capTokenId": "0.0.XXXX",
  "capHookId": 2
}
```

### Why private keys are stored

The test accounts are throwaway accounts created fresh each run. Their private keys do not exist in `.env` because they are generated at runtime by `hello-hooks/02-create-account.ts` and `managed-transfer-cap/02-create-account.ts`. Storing them in `.state.json` is a demo convenience so that later scripts (cleanup, HookStoreTransaction) can sign on behalf of the test account. In production, use a KMS or secure environment variable - never persist keys to disk.

### Network-switching gotcha

All IDs in `.state.json` are network-specific. A contract ID from previewnet does not exist on testnet. If you change `HEDERA_NETWORK` in `.env`, you must reset `.state.json` before running any scripts:

```bash
echo '{}' > .state.json
```

Failing to do this produces `INVALID_ACCOUNT_ID` or `INVALID_CONTRACT_ID` errors.

---

## SDK Classes Used

Every SDK class imported across the demo scripts, with the script that uses it and its role.

| Class                       | Script(s)                                                | Purpose                                                                                         |
| --------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `ContractCreateFlow`        | `hh/01`, `cap/01`                                        | Deploys hook contract bytecode to the network (handles file upload + contract creation)         |
| `AccountCreateTransaction`  | `hh/02`, `cap/02`                                        | Creates test accounts with `receiverSigRequired` and hooks                                      |
| `TransferTransaction`       | `hh/03`, `hh/04`, `cap/04`, `cap/05`, `cap/08`           | Sends HBAR or HTS token transfers that trigger hooks                                            |
| `HookStoreTransaction`      | `cap/03`, `cap/07`, `cap/09`                             | Writes or clears hook-scoped EVM storage slots                                                  |
| `AccountUpdateTransaction`  | `hh/06`, `cap/09`                                        | Deletes hooks from accounts via `addHookToDelete()`                                             |
| `TokenCreateTransaction`    | `cap/02`                                                 | Creates a test HTS fungible token (MCT) for the ManagedTransferCap demo                         |
| `TokenAssociateTransaction` | `cap/02`                                                 | Associates the MCT token with the cap test account                                              |
| `HookCreationDetails`       | `hh/02`, `cap/02`                                        | Configures a hook at account creation: extension point, hookId, contract                        |
| `HookExtensionPoint`        | `hh/02`, `cap/02`                                        | Enum; only value used is `ACCOUNT_ALLOWANCE_HOOK`                                               |
| `EvmHook`                   | `hh/02`, `cap/02`                                        | Wraps a `ContractId` to identify the hook's implementing contract                               |
| `FungibleHookCall`          | `hh/03`, `hh/04`, `cap/04`, `cap/05`, `cap/08`           | Attaches a hook invocation to a fungible transfer leg                                           |
| `FungibleHookType`          | `hh/03`, `hh/04`, `cap/04`, `cap/05`, `cap/08`           | Enum; `PRE_TX_ALLOWANCE_HOOK` (HelloHooks) or `PRE_POST_TX_ALLOWANCE_HOOK` (ManagedTransferCap) |
| `NftHookCall`               | (not yet used - see NFT Hook Types section)               | Attaches a hook invocation to an NFT transfer leg; takes `hookId`, `NftHookType`, and `EvmHookCall` |
| `NftHookType`               | (not yet used - see NFT Hook Types section)               | Enum; encodes timing AND which account's hook fires: `PRE_HOOK_SENDER`, `PRE_POST_HOOK_SENDER`, `PRE_HOOK_RECEIVER`, `PRE_POST_HOOK_RECEIVER` |
| `EvmHookCall`               | `hh/03`, `hh/04`, `cap/04`, `cap/05`, `cap/08`           | Specifies `gasLimit` for the hook's EVM execution                                               |
| `EvmHookStorageSlot`        | `cap/03`, `cap/07`, `cap/09`                             | Key-value pair for a hook storage write or delete                                               |
| `HookId`                    | `cap/03`, `cap/07`, `cap/09`                             | Composite identifier: `(entityId, hookId)` scoping storage to an account's hook                 |
| `HookEntityId`              | `cap/03`, `cap/07`, `cap/09`                             | Wraps an `AccountId` as the hook's owning entity                                                |
| `PrivateKey`                | `hh/02`, `hh/06`, `cap/02`, `cap/03`, `cap/07`, `cap/09` | Generates ECDSA keys; parses stored keys for signing                                            |
| `Hbar`                      | `hh/02-06`, `cap/02-09`                                  | HBAR amount wrapper for balances and fees                                                       |
| `AccountId`                 | `hh/03`, `hh/04`, `hh/06`, `cap/03-09`                   | Parses account IDs from `.state.json` strings                                                   |
| `ContractId`                | `hh/02`, `cap/02`                                        | Parses contract IDs for hook attachment                                                         |
| `TokenId`                   | `cap/04`, `cap/05`, `cap/08`                             | Parses token IDs for HTS transfers                                                              |
| `Client`                    | all via `client.ts`                                      | Configured Hedera client (previewnet/testnet/mainnet)                                           |
| `Long` (from `long` npm)    | `hh/03`, `hh/04`, `hh/06`, `cap/03-09`                   | 64-bit integer for `hookId` and `gasLimit` fields                                               |

> `hh` = `hello-hooks/`, `cap` = `managed-transfer-cap/`

---

## Network Architecture

When a script submits a transaction, it follows this path:

```
SDK Client  -->  Consensus Node  -->  Mirror Node
(submit tx)      (execute + reach      (index for
                  consensus)            REST queries)
```

1. **SDK Client to Consensus Node** - `transaction.execute(client)` sends the transaction to a consensus node. The node validates signatures, runs hook EVM code if applicable, and returns a `TransactionResponse` with the transaction ID.

2. **Consensus to finality** - Hedera reaches consensus in seconds. `getReceipt(client)` or `getRecord(client)` polls until the receipt is available, confirming success or failure.

3. **Consensus Node to Mirror Node** - The mirror node ingests finalized state from the consensus network. This propagation has a lag of approximately 3-5 seconds.

### Why the query scripts wait before querying

Both mirror node query scripts include a 5-second delay:

```typescript
await new Promise((resolve) => setTimeout(resolve, 5000));
```

This accounts for the mirror node propagation delay. Without the wait, the query may return stale data - an empty hooks list or missing HOOKSTORE transactions. The delay is conservative; in practice, propagation often completes in 2-3 seconds.

### Mirror node endpoints used

| Endpoint                                                             | Script                               | Purpose                                    |
| -------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------ |
| `GET /api/v1/accounts/{id}/hooks`                                    | `hh/05`, `hh/06`, `cap/06`, `cap/09` | List hooks attached to an account          |
| `GET /api/v1/transactions?account.id={id}&transactiontype=HOOKSTORE` | `cap/06`                             | Find HOOKSTORE transactions for an account |

---

## Shared Utilities

Six utility modules in `src/utils/` provide shared functionality across all scripts.

### config.ts

Reads `.env` via `dotenv` and returns `{ network, operatorId, operatorKey, mirrorNodeUrl }`. Validates that credentials are set and the network is one of `previewnet`, `testnet`, or `mainnet`. Maps each network to its mirror node base URL. Every script that touches the network calls `getNetworkConfig()`.

### client.ts

Factory function `createClient()` that returns a configured `Client` instance for the active network. Calls `getNetworkConfig()` internally, selects the right `Client.forXxx()` method, and sets the operator. Scripts call `createClient()` at the top and `client.close()` at the bottom.

### state.ts

`loadState(requiredKeys, hint)` and `saveState(updates)` - the inter-script communication mechanism. Reads and writes `.state.json` with merge semantics. `loadState` validates that required keys are present and throws a descriptive error pointing the user to the prerequisite script. See [State Management](#state-management) for the full schema.

### cost.ts

Records actual transaction fees to `.costs.json` and regenerates `COSTS.md` after every transaction. See [Cost Recording](#cost-recording) for details.

### crypto.ts

Two functions:

- `computeKeccak256(data)` - hashes a `Buffer` using keccak256 from `@noble/hashes` (a transitive dependency of the Hiero SDK). Used by the HelloHooks demo for verification metadata. Not used by ManagedTransferCap (no hashing needed - cap values are stored directly).
- `toMinimalBytes(buf)` - strips leading zero bytes from a `Buffer`. HIP-1195 requires storage keys and values to use minimal big-endian representation. Slot 0x00 (32 zero bytes) becomes empty bytes `[]`. Failing to strip leading zeros triggers `EVM_HOOK_STORAGE_UPDATE_BYTES_MUST_USE_MINIMAL_REPRESENTATION`.

### abi.ts

`abiEncodeString(str)` - ABI-encodes a single string as Solidity `(string)`. Produces the format that `abi.decode(data, (string))` expects in a hook contract: `offset(32 bytes) + length(32 bytes) + utf8_data(padded to 32-byte boundary)`. This utility is available for hooks that need sender-provided data via `EvmHookCall.data`. The ManagedTransferCap demo does not use it - the hook reads transfer amounts directly from `ProposedTransfers` instead of requiring sender-supplied data.

---

## Cost Recording

The `recordCost()` function in `src/utils/cost.ts` captures the actual fee charged for each transaction, not the `setMaxTransactionFee` ceiling.

### How it works

1. **Primary path: `getRecord()`** - calls `txResponse.getRecord(client)` to fetch the full `TransactionRecord`. The record's `transactionFee` field is the actual HBAR deducted from the operator, which is typically much lower than `setMaxTransactionFee`.

2. **Fallback: `getReceipt()`** - if `getRecord()` fails (for example, on a rejected transaction where the SDK throws before returning the record), it falls back to `getReceipt()` and skips cost recording. The fee is still charged on-chain but is not captured in the log.

3. **Accumulation** - each recorded entry (script name, operation label, fee, transaction ID, network, timestamp) is appended to `.costs.json`.

4. **Markdown generation** - after every append, `regenerateCostsMd()` rewrites `COSTS.md` from the full `.costs.json` array. This produces a human-readable table of all fees charged during the demo run.

### Output files

| File          | Format         | Purpose                                    |
| ------------- | -------------- | ------------------------------------------ |
| `.costs.json` | JSON array     | Machine-readable fee log; delete to reset  |
| `COSTS.md`    | Markdown table | Human-readable fee summary; auto-generated |

### Why getRecord instead of getReceipt

`getReceipt()` confirms success or failure but does not include the fee amount. `getRecord()` returns the full transaction record including `transactionFee` - the actual HBAR deducted. The `setMaxTransactionFee` on a transaction is only a ceiling; the real cost is often 10-100x lower.

---

## Hook Lifecycle

The demo covers the complete lifecycle of a Hiero hook from deployment through cleanup. Each phase maps to specific script numbers.

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Hook Lifecycle                              │
├────────────────────┬─────────────────────┬───────────────────────────┤
│  Phase             │  HelloHooks         │  ManagedTransferCap       │
├────────────────────┼─────────────────────┼───────────────────────────┤
│  1. Deploy         │  01-deploy          │  01-deploy                │
│  2. Attach         │  02-create-account  │  02-create-account        │
│  3. Configure      │  (stateless)        │  03-set-cap               │
│  4. Trigger        │  03-trigger,        │  04-within, 05-exceeds    │
│                    │  04-trigger-wrong   │                           │
│  5. Query/Update   │  05-query           │  06-query, 07-increase    │
│  6. Re-trigger     │  (n/a)              │  08-transfer-after-incr.  │
│  7. Cleanup        │  06-cleanup         │  09-cleanup               │
└────────────────────┴─────────────────────┴───────────────────────────┘

  Deploy ──► Attach ──► Configure ──► Trigger ──► Query ──► Update ──► Re-trigger ──► Cleanup
```

### Phase details

| Phase                    | What happens                                                                                                                                                                                   | HelloHooks                              | ManagedTransferCap                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------- |
| **Deploy contract**      | `ContractCreateFlow` deploys the hook's Solidity bytecode (handles file upload + contract creation in one call). The contract is just EVM bytecode; it becomes a "hook" only when attached to an account. | `01-deploy`                             | `01-deploy`                                         |
| **Attach to account**    | `AccountCreateTransaction` (or `AccountUpdateTransaction`) binds a hook to an account using `HookCreationDetails`. The hookId is client-chosen and must match what transfer senders reference. | `02-create-account`                     | `02-create-account`                                 |
| **Configure state**      | `HookStoreTransaction` writes to hook-scoped storage. HelloHooks is stateless; ManagedTransferCap needs a cap value in slot 0x00.                                                              | (none)                                  | `03-set-cap`                                        |
| **Trigger via transfer** | `TransferTransaction` with `FungibleHookCall` invokes the hook. HelloHooks uses `PRE_TX_ALLOWANCE_HOOK` (single-phase); ManagedTransferCap uses `PRE_POST_TX_ALLOWANCE_HOOK` (two-phase).      | `03-trigger`, `04-trigger-wrong-amount` | `04-transfer-within-cap`, `05-transfer-exceeds-cap` |
| **Query and update**     | Mirror node REST API confirms hook registration and transaction history. `HookStoreTransaction` increases the cap cheaply.                                                                     | `05-query`                              | `06-query`, `07-increase-cap`                       |
| **Re-trigger**           | Transfer after state update to confirm the updated cap is in effect.                                                                                                                           | (n/a)                                   | `08-transfer-after-increase`                        |
| **Cleanup**              | Clear storage via `HookStoreTransaction`, delete hooks via `AccountUpdateTransaction.addHookToDelete()`, verify via mirror node, remove state keys.                                            | `06-cleanup`                            | `09-cleanup`                                        |

### The key distinction between the two hooks

HelloHooks is **single-phase** - `allow()` inspects `ProposedTransfers` and approves only exactly 1 HBAR (100,000,000 tinybars). It uses `PRE_TX_ALLOWANCE_HOOK` and demonstrates the hook pattern with amount enforcement: deploy, attach, trigger with correct amount (approved), trigger with wrong amount (rejected). Both HelloHooks and ManagedTransferCap inspect `ProposedTransfers`, but HelloHooks does a simple exact-amount check while ManagedTransferCap tracks a running cap with two-phase state updates.

ManagedTransferCap is **stateful and two-phase** - it uses `PRE_POST_TX_ALLOWANCE_HOOK` with `allowPre()` and `allowPost()`. `allowPre()` reads the remaining cap from slot 0x00 and checks the proposed transfer amount from `ProposedTransfers`. `allowPost()` deducts the amount from the cap and writes the updated value back. This demonstrates the full hook storage lifecycle: write state via `HookStoreTransaction`, read and update state during two-phase EVM execution, and increase the cap cheaply via `HookStoreTransaction` without any EVM execution.

---

## NFT Hook Types (not yet demoed - reference)

This repo only demonstrates fungible token and HBAR transfers. NFT transfers use a different hook call class and a different set of hook type enum values. The distinction matters when reading HIP-1195 or writing a hook contract that handles both transfer types.

### FungibleHookCall vs NftHookCall

Both classes attach a hook invocation to a `TransferTransaction`, but they are used for different asset types:

| Class            | Used for                              | Hook type enum        |
| ---------------- | ------------------------------------- | --------------------- |
| `FungibleHookCall` | HBAR and HTS fungible token transfers | `FungibleHookType`    |
| `NftHookCall`      | HTS NFT transfers                     | `NftHookType`         |

### FungibleHookType values

| Value                       | Phases    | Description                                                                                                          |
| --------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| `PRE_TX_ALLOWANCE_HOOK`     | Pre only  | Hook runs before the transfer executes. Use for pure allow/deny logic with no post-execution state update needed.   |
| `PRE_POST_TX_ALLOWANCE_HOOK` | Pre + post | Hook runs before (`allowPre`) and after (`allowPost`) the transfer. Use when the hook must update state based on the actual settled amounts (e.g., decrementing a cap). |

HelloHooks uses `PRE_TX_ALLOWANCE_HOOK`. ManagedTransferCap uses `PRE_POST_TX_ALLOWANCE_HOOK`.

### NftHookType values

NFT transfers expose four hook types. The split is across two axes: **timing** (pre vs pre+post) and **whose hook fires** (sender vs receiver):

| Value                    | Timing    | Fires on whose account | Description                                                                                          |
| ------------------------ | --------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `PRE_HOOK_SENDER`        | Pre only  | NFT sender's account   | Hook fires before the NFT leaves the sender. Use for sender-side allow/deny with no post needed.    |
| `PRE_POST_HOOK_SENDER`   | Pre + post | NFT sender's account  | Hook fires before and after on the sender's account. Use when the sender needs post-transfer cleanup or state update. |
| `PRE_HOOK_RECEIVER`      | Pre only  | NFT receiver's account | Hook fires before the NFT arrives at the receiver. Use for receiver-side allow/deny (e.g., block certain NFT classes). |
| `PRE_POST_HOOK_RECEIVER` | Pre + post | NFT receiver's account | Hook fires before and after on the receiver's account. Use for receiver-side logic that needs to inspect or record the settled transfer. |

**Key difference from fungible hooks:** Fungible hook type only encodes timing (pre vs pre+post) because there is a single account whose hook fires (the account being protected). NFT hook type encodes both timing AND which account's hook fires (sender or receiver), because both the sender and receiver can independently have hooks attached.

### Usage pattern for NftHookCall

```typescript
import { NftHookCall, NftHookType, EvmHookCall } from "@hiero-ledger/sdk";
import Long from "long";

// Sender-side pre-only hook on an NFT transfer
const transfer = new TransferTransaction()
  .addNftTransfer(tokenId, serialNumber, senderAccountId, receiverAccountId)
  .addNftHookCall(
    new NftHookCall()
      .setHookId(Long.fromInt(hookId))
      .setHookType(NftHookType.PRE_HOOK_SENDER)
      .setEvmHookCall(new EvmHookCall().setGasLimit(Long.fromInt(60000)))
  )
  .setMaxTransactionFee(new Hbar(5));
```

For a receiver-side hook, replace `NftHookType.PRE_HOOK_SENDER` with `NftHookType.PRE_HOOK_RECEIVER` and ensure the `hookId` matches what was set in `HookCreationDetails` on the receiver's account.

> The demo repo does not yet include an NFT hook example. The patterns above are for reference when extending the repo or writing your own NFT-gated logic.
