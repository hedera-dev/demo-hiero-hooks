/**
 * managed-transfer-cap.test.ts
 *
 * Integration tests for the ManagedTransferCap demo on testnet.
 * Deploys the ManagedTransferCap contract, creates an account with
 * receiver_sig_required and hook, tests cap enforcement (approve, reject,
 * increase, approve again), and queries the mirror node.
 *
 * Run: npx vitest run test/managed-transfer-cap.test.ts
 */

import fs from "fs";
import Long from "long";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  Client,
  ContractCreateFlow,
  AccountCreateTransaction,
  TransferTransaction,
  HookStoreTransaction,
  FungibleHookCall,
  FungibleHookType,
  EvmHookCall,
  EvmHookStorageSlot,
  TokenCreateTransaction,
  TokenAssociateTransaction,
  TokenType,
  TokenSupplyType,
  HookCreationDetails,
  HookExtensionPoint,
  EvmHook,
  HookId,
  HookEntityId,
  Hbar,
  PrivateKey,
  ContractId,
  AccountId,
  TokenId,
} from "@hiero-ledger/sdk";
import { setupTestContext, waitForMirror } from "./helpers/setup.js";
import { toMinimalBytes } from "../src/utils/crypto.js";

let client: Client;
let operatorId: string;
let mirrorNodeUrl: string;

let capContractId: ContractId;
let capAccountId: AccountId;
let capAccountKey: PrivateKey;
let capTokenId: TokenId;
const CAP_HOOK_ID = 2;

const BYTECODE_PATH = new URL("../build/contracts/ManagedTransferCap.bytecode.txt", import.meta.url).pathname;

/** Encode a uint256 cap value as minimal bytes for HookStoreTransaction. */
function encodeCapValue(value: number): Buffer {
  const buf = Buffer.alloc(32, 0);
  buf.writeBigUInt64BE(BigInt(value), 24);
  return toMinimalBytes(buf);
}

beforeAll(() => {
  const ctx = setupTestContext();
  client = ctx.client;
  operatorId = ctx.operatorId;
  mirrorNodeUrl = ctx.mirrorNodeUrl;
});

afterAll(() => {
  client.close();
});

describe("ManagedTransferCap", () => {
  it("deploys the ManagedTransferCap contract", async () => {
    const bytecode = fs.readFileSync(BYTECODE_PATH, "utf8").trim();
    expect(bytecode.length).toBeGreaterThan(0);

    const tx = await new ContractCreateFlow().setBytecode(bytecode).setGas(1_000_000).execute(client);
    const receipt = await tx.getReceipt(client);
    expect(receipt.contractId).not.toBeNull();
    capContractId = receipt.contractId!;
  });

  it("creates cap account with hook, receiver_sig_required, and token", async () => {
    capAccountKey = PrivateKey.generateECDSA();

    const hookDetails = new HookCreationDetails({
      extensionPoint: HookExtensionPoint.ACCOUNT_ALLOWANCE_HOOK,
      hookId: CAP_HOOK_ID,
      evmHook: new EvmHook({ contractId: capContractId }),
    });

    const createTx = await new AccountCreateTransaction()
      .setECDSAKeyWithAlias(capAccountKey.publicKey)
      .setInitialBalance(new Hbar(10))
      .setReceiverSignatureRequired(true)
      .setMaxTransactionFee(new Hbar(15))
      .addHook(hookDetails)
      .freezeWith(client);
    const createSigned = await createTx.sign(capAccountKey);
    const createResponse = await createSigned.execute(client);
    const createReceipt = await createResponse.getReceipt(client);
    expect(createReceipt.accountId).not.toBeNull();
    capAccountId = createReceipt.accountId!;

    const tokenTx = await new TokenCreateTransaction()
      .setTokenName("Managed Cap Token")
      .setTokenSymbol("MCT")
      .setTokenType(TokenType.FungibleCommon)
      .setDecimals(0)
      .setInitialSupply(10_000)
      .setSupplyType(TokenSupplyType.Finite)
      .setMaxSupply(10_000)
      .setTreasuryAccountId(operatorId)
      .execute(client);
    const tokenReceipt = await tokenTx.getReceipt(client);
    expect(tokenReceipt.tokenId).not.toBeNull();
    capTokenId = tokenReceipt.tokenId!;

    const assocTx = await new TokenAssociateTransaction()
      .setAccountId(capAccountId)
      .setTokenIds([capTokenId])
      .freezeWith(client);
    const assocSigned = await assocTx.sign(capAccountKey);
    await (await assocSigned.execute(client)).getReceipt(client);
  });

  it("sets cap to 500 via HookStoreTransaction", async () => {
    const tx = await new HookStoreTransaction()
      .setHookId(
        new HookId({
          entityId: new HookEntityId({ accountId: capAccountId }),
          hookId: Long.fromInt(CAP_HOOK_ID),
        }),
      )
      .addStorageUpdate(
        new EvmHookStorageSlot({
          key: new Uint8Array(0),
          value: encodeCapValue(500),
        }),
      )
      .setMaxTransactionFee(new Hbar(10))
      .freezeWith(client);

    const signed = await tx.sign(capAccountKey);
    const response = await signed.execute(client);
    const receipt = await response.getReceipt(client);
    expect(receipt.status.toString()).toBe("SUCCESS");
  });

  it("approves 200 token transfer (within 500 cap)", async () => {
    const hookCall = new FungibleHookCall({
      hookId: Long.fromInt(CAP_HOOK_ID),
      evmHookCall: new EvmHookCall({ gasLimit: Long.fromInt(100_000) }),
      type: FungibleHookType.PRE_POST_TX_ALLOWANCE_HOOK,
    });

    const tx = await new TransferTransaction()
      .addTokenTransfer(capTokenId, AccountId.fromString(operatorId), -200)
      .addTokenTransferWithHook(capTokenId, capAccountId, 200, hookCall)
      .setMaxTransactionFee(new Hbar(10))
      .execute(client);

    const receipt = await tx.getReceipt(client);
    expect(receipt.status.toString()).toBe("SUCCESS");
  });

  it("rejects 400 token transfer (exceeds remaining 300)", async () => {
    const hookCall = new FungibleHookCall({
      hookId: Long.fromInt(CAP_HOOK_ID),
      evmHookCall: new EvmHookCall({ gasLimit: Long.fromInt(100_000) }),
      type: FungibleHookType.PRE_POST_TX_ALLOWANCE_HOOK,
    });

    const tx = await new TransferTransaction()
      .addTokenTransfer(capTokenId, AccountId.fromString(operatorId), -400)
      .addTokenTransferWithHook(capTokenId, capAccountId, 400, hookCall)
      .setMaxTransactionFee(new Hbar(10))
      .execute(client);

    await expect(tx.getReceipt(client)).rejects.toThrow("REJECTED_BY_ACCOUNT_ALLOWANCE_HOOK");
  });

  it("increases cap to 1000 via HookStoreTransaction", async () => {
    const tx = await new HookStoreTransaction()
      .setHookId(
        new HookId({
          entityId: new HookEntityId({ accountId: capAccountId }),
          hookId: Long.fromInt(CAP_HOOK_ID),
        }),
      )
      .addStorageUpdate(
        new EvmHookStorageSlot({
          key: new Uint8Array(0),
          value: encodeCapValue(1000),
        }),
      )
      .setMaxTransactionFee(new Hbar(10))
      .freezeWith(client);

    const signed = await tx.sign(capAccountKey);
    const response = await signed.execute(client);
    const receipt = await response.getReceipt(client);
    expect(receipt.status.toString()).toBe("SUCCESS");
  });

  it("approves 400 token transfer after cap increase", async () => {
    const hookCall = new FungibleHookCall({
      hookId: Long.fromInt(CAP_HOOK_ID),
      evmHookCall: new EvmHookCall({ gasLimit: Long.fromInt(100_000) }),
      type: FungibleHookType.PRE_POST_TX_ALLOWANCE_HOOK,
    });

    const tx = await new TransferTransaction()
      .addTokenTransfer(capTokenId, AccountId.fromString(operatorId), -400)
      .addTokenTransferWithHook(capTokenId, capAccountId, 400, hookCall)
      .setMaxTransactionFee(new Hbar(10))
      .execute(client);

    const receipt = await tx.getReceipt(client);
    expect(receipt.status.toString()).toBe("SUCCESS");
  });

  it("hook appears in mirror node with correct state", async () => {
    await waitForMirror();

    const url = `${mirrorNodeUrl}/api/v1/accounts/${capAccountId}/hooks`;
    const res = await fetch(url);
    expect(res.ok).toBe(true);

    const data = await res.json();
    const hook = data.hooks?.find((h: { hook_id: number }) => h.hook_id === CAP_HOOK_ID);
    expect(hook).toBeDefined();
    expect(hook.extension_point).toBe("ACCOUNT_ALLOWANCE_HOOK");
    expect(hook.deleted).toBe(false);
    expect(hook.contract_id).toBe(capContractId.toString());
  });
});
