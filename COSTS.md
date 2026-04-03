# Transaction Cost Log

Actual fees charged per operation, recorded automatically as demo scripts run.
Reset by running `npx tsx src/00-setup-verify.ts`.

> `setMaxTransactionFee` is a ceiling - only the amount shown here is deducted.
> Exchange rate: 1 HBAR = $0.0881 USD (from mirror node at generation time).

## HelloHooks

| Script | Operation | Fee (HBAR) | Fee (USD) | Transaction ID |
|--------|-----------|------------|-----------|----------------|
| `hello-hooks/01-deploy` | ContractCreateFlow (HelloHooks) | 5.08527302 ℏ | $0.4478 | `0.0.7536968@1775242791.357031664` |
| `hello-hooks/02-create-account` | AccountCreate + hook (HelloHooks) | 11.95436241 ℏ | $1.0527 | `0.0.7536968@1775242794.087493973` |
| `hello-hooks/03-trigger` | TransferTransaction (1 HBAR + hook invocation) | 0.15467825 ℏ | $0.0136 | `0.0.7536968@1775242797.494597392` |
| `hello-hooks/05-cleanup` | AccountUpdate (delete HelloHooks hook) | 11.36000565 ℏ | $1.0004 | `0.0.7536968@1775242812.415393662` |

**Subtotal: 28.55431933 HBAR ($2.5145 USD)**

## ManagedTransferCap

| Script | Operation | Fee (HBAR) | Fee (USD) | Transaction ID |
|--------|-----------|------------|-----------|----------------|
| `managed-transfer-cap/01-deploy` | ContractCreateFlow (ManagedTransferCap) | 5.19348551 ℏ | $0.4573 | `0.0.7536968@1775242900.899748966` |
| `managed-transfer-cap/02-create-account` | AccountCreate + hook (ManagedTransferCap) | 11.95436241 ℏ | $1.0527 | `0.0.7536968@1775242903.538895875` |
| `managed-transfer-cap/02-create-token` | TokenCreateTransaction (MCT) | 9.81179263 ℏ | $0.8640 | `0.0.7536968@1775242908.260403380` |
| `managed-transfer-cap/02-associate-token` | TokenAssociateTransaction (MCT -> cap account) | 0.89999757 ℏ | $0.0793 | `0.0.7536968@1775242910.540452662` |
| `managed-transfer-cap/03-set-cap` | HookStoreTransaction (set cap to 500) | 0.05678064 ℏ | $0.0050 | `0.0.7536968@1775242910.594492207` |
| `managed-transfer-cap/04-transfer-within-cap` | TransferTransaction (HTS + hook invocation, within cap) | 0.31843259 ℏ | $0.0280 | `0.0.7536968@1775242913.847004065` |
| `managed-transfer-cap/07-increase-cap` | HookStoreTransaction (increase cap to 1000) | 0.05678064 ℏ | $0.0050 | `0.0.7536968@1775242923.867976376` |
| `managed-transfer-cap/08-transfer-after-increase` | TransferTransaction (HTS + hook invocation, after cap increase) | 0.31843259 ℏ | $0.0280 | `0.0.7536968@1775242930.798539106` |
| `managed-transfer-cap/09-cleanup` | HookStoreTransaction (clear slot 0x00) | 0.05678064 ℏ | $0.0050 | `0.0.7536968@1775242932.776749189` |

**Subtotal: 28.66684522 HBAR ($2.5244 USD)**

---

**Grand Total: 57.22116455 HBAR ($5.0388 USD)**

_Last updated: 2026-04-03T19:02:19.537Z_
