// SPDX-License-Identifier: Apache-2.0
//
// HelloHooks - HIP-1195 Account Allowance Hook (Basic Example)
//
// Approves transfers that credit exactly 1 HBAR (100,000,000 tinybars) to the
// hook owner. Any other amount is rejected. Demonstrates the fundamental hook
// pattern: deploy a contract, attach it to an account, and have it inspect
// ProposedTransfers to make an approve/reject decision.
//
// Uses PRE_TX_ALLOWANCE_HOOK (single-phase: allow() only).
//
// ============================================================================
// SECURITY: Production Hardening Notes
// ============================================================================
//
// 1. HOOK_ADDR GUARD: The allow() function checks address(this) == HOOK_ADDR
//    to ensure it only executes inside a Hedera hook EVM frame at 0x16d.
//
// 2. AMOUNT CHECK: This demo checks for exactly 1 HBAR. A production hook
//    would likely check ranges, sender allowlists, or token-specific rules
//    using the full ProposedTransfers context.
//
// 3. HOOK TYPE DISPATCH: The sender's FungibleHookCall.type controls dispatch:
//      PRE_TX_ALLOWANCE_HOOK      -> allow()   (fires once, before commit)
//      PRE_POST_TX_ALLOWANCE_HOOK -> allowPre() before, allowPost() after
//    This demo uses PRE_TX_ALLOWANCE_HOOK. See ManagedTransferCap for the
//    two-phase pattern.
//
// ============================================================================
pragma solidity 0.8.34;

// ----------------------------------------------------------------------------
// HIP-1195 interfaces - inlined
// Source: https://github.com/hiero-ledger/hiero-consensus-node/tree/v0.72.0/
//         hedera-node/test-clients/src/main/resources/contract/contracts/
// ----------------------------------------------------------------------------

/// @notice Base hook interface - provides the HookContext struct passed to all hook functions.
interface IHieroHook {
    struct HookContext {
        address owner;    // Entity (account or contract) that owns this hook
        uint256 txnFee;   // Transaction fee charged for the triggering transaction
        uint256 gasCost;  // Gas allocated for this hook execution
        string memo;      // Transaction memo
        bytes data;       // ABI-encoded calldata from EvmHookCall.data
    }
}

/// @notice Interface for the ACCOUNT_ALLOWANCE_HOOK extension point (HIP-1195).
interface IHieroAccountAllowanceHook {
    struct AccountAmount {
        address account;
        int64 amount;
    }

    struct NftTransfer {
        address sender;
        address receiver;
        int64 serialNo;
    }

    struct TokenTransferList {
        address token;
        AccountAmount[] adjustments;
        NftTransfer[] nftTransfers;
    }

    struct Transfers {
        AccountAmount[] hbarAdjustments;
        TokenTransferList[] tokens;
    }

    struct ProposedTransfers {
        Transfers direct;
        Transfers customFee;
    }

    function allow(
        IHieroHook.HookContext calldata context,
        ProposedTransfers memory proposedTransfers
    ) external payable returns (bool);
}

// ----------------------------------------------------------------------------
// HelloHooks
// ----------------------------------------------------------------------------

/// @title  HelloHooks
/// @notice Approves only transfers that credit exactly 1 HBAR to the hook owner.
///         Demonstrates how hooks inspect ProposedTransfers to make decisions.
contract HelloHooks is IHieroAccountAllowanceHook {

    address constant HOOK_ADDR = address(uint160(0x16d));

    /// @dev 1 HBAR = 100,000,000 tinybars
    uint256 constant ONE_HBAR = 100_000_000;

    /// @notice Invoked for PRE_TX_ALLOWANCE_HOOK. Approves if exactly 1 HBAR
    ///         is being credited to the hook owner; rejects otherwise.
    function allow(
        IHieroHook.HookContext calldata context,
        ProposedTransfers memory proposedTransfers
    ) external payable override returns (bool) {
        require(address(this) == HOOK_ADDR, "only callable as hook");

        // Sum all HBAR credits to the hook owner
        uint256 totalCredit = 0;
        AccountAmount[] memory hbarAdj = proposedTransfers.direct.hbarAdjustments;
        for (uint256 i = 0; i < hbarAdj.length; i++) {
            if (hbarAdj[i].account == context.owner && hbarAdj[i].amount > 0) {
                totalCredit += uint256(uint64(hbarAdj[i].amount));
            }
        }

        // Approve only if exactly 1 HBAR
        return totalCredit == ONE_HBAR;
    }
}
