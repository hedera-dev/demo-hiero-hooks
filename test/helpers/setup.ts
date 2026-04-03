/**
 * Shared test setup for Hiero Hooks integration tests.
 * Provides a configured client and network config for all test files.
 */

import type { Client } from "@hiero-ledger/sdk";
import { getNetworkConfig } from "../../src/utils/config.js";
import { createClient } from "../../src/utils/client.js";

export interface TestContext {
  client: Client;
  operatorId: string;
  mirrorNodeUrl: string;
}

export function setupTestContext(): TestContext {
  const config = getNetworkConfig();
  return {
    client: createClient(),
    operatorId: config.operatorId,
    mirrorNodeUrl: config.mirrorNodeUrl,
  };
}

/** Wait for mirror node propagation (~5 seconds). */
export const waitForMirror = (): Promise<void> => new Promise((r) => setTimeout(r, 5000));
