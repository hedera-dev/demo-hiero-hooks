# Background: Hiero Hooks and HIP-1195

Topic primer for developers new to Hiero hooks. Read this before touching any code. It covers what hooks are, why they exist, and how they fit into the broader Hedera ecosystem.

---

## Table of Contents

- [What Are Hiero Hooks?](#what-are-hiero-hooks)
- [receiver_sig_required on Hedera](#receiver_sig_required-on-hedera)
- [How Hooks Compare to Alternatives](#how-hooks-compare-to-alternatives)
- [Hook Execution Model](#hook-execution-model)
- [Hook Storage](#hook-storage)
- [Deployment Paths](#deployment-paths)
- [Known Limitations](#known-limitations)
- [Further Reading](#further-reading)

---

## What Are Hiero Hooks?

Hiero hooks (HIP-1195) are programmable extension points that let a Hedera account owner attach custom Solidity logic directly to their account. When a transfer targets that account, the network executes the hook code and uses the result to approve or reject the transfer - no smart contract routing required. The key insight is account abstraction for Hiero: instead of forcing every transfer through a separate contract address, each account enforces its own rules as first-class network behavior. In this demo, `HelloHooks` inspects `ProposedTransfers` and approves only exactly 1 HBAR transfers (100,000,000 tinybars) - any other amount is rejected. `ManagedTransferCap` enforces a configurable cap on inbound token transfers - the hook inspects the proposed transfer amount and rejects anything that would exceed the remaining cap.

---

## receiver_sig_required on Hedera

### What it is

Hedera accounts have a property called `receiver_sig_required` that does not exist on EVM-compatible chains. When set to `true`, the account owner must co-sign every transaction that credits their account. Without the owner's signature, the transaction fails - the network rejects the inbound transfer before it reaches consensus.

### Why it exists

This flag serves two purposes:

- **Spam prevention.** On most blockchains, anyone can send tokens to any address. On Hedera, an account can opt out of unsolicited deposits entirely.
- **Regulatory compliance.** Institutional or custodial accounts can require explicit approval before accepting any funds, ensuring every inbound transfer is authorized.

### The UX cost

The trade-off is significant. Every sender must coordinate with the receiver to get a co-signature before submitting the transfer. For automated systems, escrow patterns, or high-throughput token distributions, this coordination overhead becomes a bottleneck.

### How ACCOUNT_ALLOWANCE_HOOK replaces the signature

The `ACCOUNT_ALLOWANCE_HOOK` extension point is the mechanism that replaces the receiver's co-signature with on-chain logic. When a receiving account has `receiver_sig_required=true` and a hook attached, the sender can reference that hook in their `FungibleHookCall` instead of obtaining the receiver's signature. The Hedera node executes the hook's Solidity code; if the hook returns `true`, the transfer is authorized.

Think of it as **programmable inbound authorization**: `receiver_sig_required=true` means "every inbound transfer needs my sign-off"; the hook is the always-on policy that provides that sign-off automatically, based on whatever logic the account owner deployed.

### When receiver_sig_required is needed

`receiver_sig_required` is not needed for hooks to fire. Hooks attached to an account are invoked whenever the sender includes a `FungibleHookCall` in the transfer, regardless of the `receiver_sig_required` flag.

However, `receiver_sig_required=true` is needed when you want to **force** all transfers through the hook. Without it, a sender could simply omit the `FungibleHookCall` and transfer directly - bypassing the hook entirely. Setting `receiver_sig_required=true` ensures that any transfer without proper authorization (either the receiver's signature or a hook returning `true`) is rejected.

- **HelloHooks** does not use `receiver_sig_required` because it demonstrates hook invocation and amount enforcement without a mandatory security gate. Senders can still transfer directly without invoking the hook.
- **ManagedTransferCap** uses `receiver_sig_required=true` because the transfer cap must be mandatory. Without the flag, a sender could bypass the cap check by omitting the hook reference and transferring tokens directly.

The distinction: HelloHooks demonstrates the hook mechanism with ProposedTransfers inspection; ManagedTransferCap demonstrates using hooks as an enforceable policy.

---

## How Hooks Compare to Alternatives

| Mechanism                                         | Runs at                              | Owner controls                                                                            | Cost                                            | Use case                                                                   |
| ------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| **Smart contracts** (ContractCreate/ContractCall) | Dedicated contract address           | Full EVM programmability; all parties must route through the contract                     | Gas-based; higher per-call cost                 | Arbitrary on-chain logic; DeFi, DAOs, escrow                               |
| **Custom fees** (HIP-18)                          | Token level, set by token creator    | Fee schedules on token transfers; cannot inspect full transfer context                    | Fixed/fractional fee per transfer               | Royalties, protocol fees, revenue sharing                                  |
| **Allowances** (HIP-336)                          | Account level, set by token owner    | Grants third-party spending authority up to a limit                                       | No extra cost beyond the transfer itself        | Delegated spending; DEX approvals                                          |
| **EIP-7702 / HIP-1340+1341**                      | EOA level, session-scoped delegation | EOA temporarily acts as a smart contract; great for wallet UX (batching, gas sponsorship) | Gas-based                                       | Wallet UX improvements; session-scoped delegation                          |
| **Hooks** (HIP-1195)                              | Account level, always-on             | Solidity logic executes at transfer time with owner privileges at `0x16d`                 | $0.005 per invocation; $0.005 per storage write | Receiver authorization, passcode gates, transfer limits, compliance checks |

Hooks occupy a space that none of the alternatives fill: **account-level, always-on, owner-controlled transfer logic** that runs without a separate contract routing layer and at a fraction of the cost.

---

## Hook Execution Model

### Execution address: 0x16d

When the Hedera node invokes a hook, the EVM frame sets `address(this)` to `0x16d` - a reserved system address. This is how a hook knows it is running inside the node's hook executor rather than being called directly. Both contracts in this demo enforce this with:

```solidity
require(address(this) == HOOK_ADDR, "only callable as hook");
```

A direct call to the deployed contract address would have `address(this)` equal to the contract's own address, which is never `0x16d`. The `require` reverts the call, preventing misuse.

### msg.sender is the payer, not the hook owner

Inside hook execution, `msg.sender` is the account that submitted the `TransferTransaction` - the payer - not the account that owns the hook. The hook owner's address is available in `context.owner`. This distinction matters when writing hooks that need to identify who is sending funds versus who owns the receiving account.

### Hook types: PRE vs PRE+POST

The sender controls which hook function the node calls by setting the `FungibleHookType` in their `FungibleHookCall`:

| Hook type                    | Functions called                                       | When to use                                                                                                           |
| ---------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `PRE_TX_ALLOWANCE_HOOK`      | `allow()` - fires once, before the transfer commits    | Simple approve/reject decisions. Used by HelloHooks.                                                                  |
| `PRE_POST_TX_ALLOWANCE_HOOK` | `allowPre()` before commit; `allowPost()` after commit | Two-phase logic where you need to check state before and update state after the transfer. Used by ManagedTransferCap. |

`HelloHooks` implements all three functions (`allow`, `allowPre`, `allowPost`) for completeness. It uses `PRE_TX_ALLOWANCE_HOOK` in the demo because the exact-amount check needs only a single phase - inspect `ProposedTransfers` and approve or reject.

`ManagedTransferCap` implements `allowPre()` and `allowPost()` and uses `PRE_POST_TX_ALLOWANCE_HOOK`. The two-phase pattern works as follows: `allowPre()` reads the remaining cap from storage and checks the proposed transfer amount from `ProposedTransfers` - if the amount exceeds the cap, it returns `false` and the transfer is rejected before commit. `allowPost()` runs only if `allowPre()` approved; it deducts the transfer amount from the remaining cap and writes the updated value back to storage. This separation ensures the cap is only decremented when the transfer actually commits.

### Gas limit and who pays

The sender specifies a `gas_limit` in the `FungibleHookCall`. The Hedera node charges gas for the hook's EVM execution against this limit. If the hook exceeds the limit, the transaction fails with `CONSENSUS_GAS_EXHAUSTED`. The payer - the account submitting the transfer - pays for hook gas, not the hook owner. The intrinsic gas cost for hook invocation is currently set to 1,000.

---

## Hook Storage

### HookStoreTransaction

Hook storage is a dedicated key-value namespace scoped to `(entity, hook_id)`. The hook owner writes to this namespace using `HookStoreTransaction` - a Hedera-native transaction type (transaction type ID 75) that writes 32-byte keys and 32-byte values directly, without invoking the EVM.

In the `ManagedTransferCap` demo, the owner writes a transfer cap value to slot `0x00`:

```
HookStoreTransaction -> slot 0x00 = 500  (initial cap of 500 token units)
```

Cost: **$0.005 per HookStoreTransaction**, regardless of how many slots are written. Compare this to a `ContractCall` that would incur full EVM gas costs for the same storage write.

### sload/sstore inside hook execution

When the hook's Solidity code runs `sload` or `sstore`, those operations access the same `(entity, hook_id)` namespace. In `ManagedTransferCap.sol`, the hook reads the remaining cap with `sload(0)` in `allowPre()` and writes the decremented cap back with `sstore(0, newCap)` in `allowPost()`:

```solidity
// allowPre: check if transfer is within cap
uint256 remainingCap;
assembly { remainingCap := sload(0) }
// ... read amount from ProposedTransfers, reject if amount > remainingCap ...

// allowPost: deduct amount from cap (only runs if allowPre approved)
assembly { sstore(0, sub(remainingCap, amount)) }
```

This means the owner uses `HookStoreTransaction` to set up state cheaply (setting or increasing the cap), and the hook's EVM logic reads and modifies that same state during execution (decrementing the remaining cap after each approved transfer).

---

## Deployment Paths

### Primary: ContractCreateFlow via SDK (used in this demo)

The demo deploys hook contracts using `ContractCreateFlow` from the Hiero JavaScript SDK. `ContractCreateFlow` handles both the file upload and contract creation in a single call, rather than requiring separate `FileCreateTransaction` and `ContractCreateTransaction` steps. This is the recommended path because hook management operations - creating hooks, attaching them to accounts, writing to hook storage, deleting hooks - all require SDK transaction types with no JSON-RPC equivalent.

```
Compile Solidity -> bytecode (hex string) -> ContractCreateFlow -> ContractId
```

The resulting `ContractId` is then referenced when attaching the hook to an account via `AccountUpdateTransaction`.

### Alternative: Hardhat or Foundry with JSON-RPC relay

The hook contract is standard EVM bytecode. You can compile and deploy it using Hardhat or Foundry pointed at Hedera's JSON-RPC relay (`https://testnet.hashio.io/api`). The bytecode is identical regardless of deployment method.

However, after deploying via EVM tooling, you still need the SDK for everything else: attaching the hook (`AccountUpdateTransaction`), writing storage (`HookStoreTransaction`), and deleting hooks. The EVM tooling handles only the contract deployment step.

### Same bytecode, multiple hooks

A single deployed contract can serve as the implementation for multiple hooks on different accounts. Each hook gets its own `(entity, hook_id)` storage namespace, so the same `ManagedTransferCap` contract can enforce different caps on different accounts independently.

---

## Known Limitations

These constraints apply as of April 2026. Hooks are a beta feature on Hedera.

1. **One extension point.** HIP-1195 defines a single extension point: `ACCOUNT_ALLOWANCE_HOOK`. There are no hook extension points for topic submissions, token operations, or other transaction types.

2. **Hooks are not automatic.** The sender must explicitly reference the hook by including a `FungibleHookCall` (or `NftHookCall`) in their `TransferTransaction`. If the sender omits the hook reference, the transfer behaves as if no hook exists - and fails if `receiver_sig_required=true`.

3. **sstore blocks hook deletion.** If a hook writes to storage during execution (as `ManagedTransferCap` does when it updates the remaining cap with `sstore`), those slots must be explicitly zeroed via `HookStoreTransaction` before the hook can be deleted. Attempting to delete a hook with non-zero storage fails with `HOOK_DELETION_REQUIRES_ZERO_STORAGE_SLOTS`. Each demo's cleanup script (`src/hello-hooks/06-cleanup.ts` and `src/managed-transfer-cap/09-cleanup.ts`) handles this.

4. **Max 10 hook invocations per CryptoTransfer.** A single transfer transaction can invoke at most 10 hooks, producing up to 50 child records.

5. **No batch or scheduled transaction support.** Hooks cannot currently be triggered from within batch transactions or scheduled transactions.

---

## Further Reading

| Resource                                          | Link                                                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| HIP-1195 - Hiero Hooks specification              | [hiero-improvement-proposals/HIP/hip-1195.md](https://github.com/hiero-ledger/hiero-improvement-proposals/blob/main/HIP/hip-1195.md) |
| Hiero JavaScript SDK                              | [hiero-ledger/hiero-sdk-js](https://github.com/hiero-ledger/hiero-sdk-js)                                                            |
| Hiero Mirror Node                                 | [hiero-ledger/hiero-mirror-node](https://github.com/hiero-ledger/hiero-mirror-node)                                                  |
| HIP-1340 / HIP-1341 - EIP-7702 on Hedera (future) | [hiero-improvement-proposals](https://github.com/hiero-ledger/hiero-improvement-proposals)                                           |
