/**
 * hello-hooks.test.ts
 *
 * Integration tests for the HelloHooks demo on testnet.
 * Deploys the HelloHooks contract, attaches it to an account, tests that
 * exactly 1 HBAR is approved and other amounts are rejected, queries the
 * mirror node, and cleans up by deleting the hook.
 *
 * Run: npx vitest run test/hello-hooks.test.ts
 */

import fs from "fs";
import Long from "long";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  Client,
  ContractCreateFlow,
  AccountCreateTransaction,
  TransferTransaction,
  AccountUpdateTransaction,
  FungibleHookCall,
  FungibleHookType,
  EvmHookCall,
  HookCreationDetails,
  HookExtensionPoint,
  EvmHook,
  Hbar,
  PrivateKey,
  ContractId,
  AccountId,
} from "@hiero-ledger/sdk";
import { setupTestContext, waitForMirror } from "./helpers/setup.js";

let client: Client;
let operatorId: string;
let mirrorNodeUrl: string;

let contractId: ContractId;
let testAccountId: AccountId;
let testAccountKey: PrivateKey;
const HOOK_ID = 1;

const BYTECODE_PATH = new URL("../build/contracts/HelloHooks.bytecode.txt", import.meta.url).pathname;

beforeAll(() => {
  const ctx = setupTestContext();
  client = ctx.client;
  operatorId = ctx.operatorId;
  mirrorNodeUrl = ctx.mirrorNodeUrl;
});

afterAll(() => {
  client.close();
});

describe("HelloHooks", () => {
  it("deploys the HelloHooks contract", async () => {
    const bytecode = fs.readFileSync(BYTECODE_PATH, "utf8").trim();
    expect(bytecode.length).toBeGreaterThan(0);

    const tx = await new ContractCreateFlow().setBytecode(bytecode).setGas(1_000_000).execute(client);
    const receipt = await tx.getReceipt(client);
    expect(receipt.contractId).not.toBeNull();
    contractId = receipt.contractId!;
  });

  it("creates a test account with hook attached", async () => {
    testAccountKey = PrivateKey.generateECDSA();

    const hookDetails = new HookCreationDetails({
      extensionPoint: HookExtensionPoint.ACCOUNT_ALLOWANCE_HOOK,
      hookId: HOOK_ID,
      evmHook: new EvmHook({ contractId }),
    });

    const createTx = await new AccountCreateTransaction()
      .setECDSAKeyWithAlias(testAccountKey.publicKey)
      .setInitialBalance(new Hbar(10))
      .setMaxTransactionFee(new Hbar(15))
      .addHook(hookDetails)
      .freezeWith(client);

    const signed = await createTx.sign(testAccountKey);
    const response = await signed.execute(client);
    const receipt = await response.getReceipt(client);
    expect(receipt.accountId).not.toBeNull();
    testAccountId = receipt.accountId!;
  });

  it("approves exactly 1 HBAR transfer", async () => {
    const hookCall = new FungibleHookCall({
      hookId: Long.fromInt(HOOK_ID),
      evmHookCall: new EvmHookCall({ gasLimit: Long.fromInt(100_000) }),
      type: FungibleHookType.PRE_TX_ALLOWANCE_HOOK,
    });

    const tx = await new TransferTransaction()
      .addHbarTransfer(AccountId.fromString(operatorId), new Hbar(-1))
      .addHbarTransferWithHook(testAccountId, new Hbar(1), hookCall)
      .setMaxTransactionFee(new Hbar(10))
      .execute(client);

    const receipt = await tx.getReceipt(client);
    expect(receipt.status.toString()).toBe("SUCCESS");
  });

  it("rejects 2 HBAR transfer (not exactly 1)", async () => {
    const hookCall = new FungibleHookCall({
      hookId: Long.fromInt(HOOK_ID),
      evmHookCall: new EvmHookCall({ gasLimit: Long.fromInt(100_000) }),
      type: FungibleHookType.PRE_TX_ALLOWANCE_HOOK,
    });

    const tx = await new TransferTransaction()
      .addHbarTransfer(AccountId.fromString(operatorId), new Hbar(-2))
      .addHbarTransferWithHook(testAccountId, new Hbar(2), hookCall)
      .setMaxTransactionFee(new Hbar(10))
      .execute(client);

    await expect(tx.getReceipt(client)).rejects.toThrow("REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK");
  });

  it("hook appears in mirror node with deleted=false", async () => {
    await waitForMirror();

    const url = `${mirrorNodeUrl}/api/v1/accounts/${testAccountId}/hooks`;
    const res = await fetch(url);
    expect(res.ok).toBe(true);

    const data = await res.json();
    const hook = data.hooks?.find((h: { hook_id: number }) => h.hook_id === HOOK_ID);
    expect(hook).toBeDefined();
    expect(hook.extension_point).toBe("ACCOUNT_ALLOWANCE_HOOK");
    expect(hook.deleted).toBe(false);
    expect(hook.contract_id).toBe(contractId.toString());
  });

  it("deletes the HelloHooks hook", async () => {
    const tx = await new AccountUpdateTransaction()
      .setAccountId(testAccountId)
      .addHookToDelete(Long.fromInt(HOOK_ID))
      .setMaxTransactionFee(new Hbar(15))
      .freezeWith(client);

    const signed = await tx.sign(testAccountKey);
    const response = await signed.execute(client);
    const receipt = await response.getReceipt(client);
    expect(receipt.status.toString()).toBe("SUCCESS");
  });

  it("mirror node shows hook as deleted=true", async () => {
    await waitForMirror();

    const url = `${mirrorNodeUrl}/api/v1/accounts/${testAccountId}/hooks`;
    const res = await fetch(url);
    const data = await res.json();
    const hook = data.hooks?.find((h: { hook_id: number }) => h.hook_id === HOOK_ID);
    expect(hook).toBeDefined();
    expect(hook.deleted).toBe(true);
  });
});
