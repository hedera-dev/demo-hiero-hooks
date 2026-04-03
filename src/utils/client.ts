import { Client, PrivateKey } from "@hiero-ledger/sdk";
import { getNetworkConfig } from "./config.js";

/**
 * Creates and returns a configured Hedera client for the active network.
 * Reads credentials from environment via getNetworkConfig().
 */
export function createClient(): Client {
  const { network, operatorId, operatorKey } = getNetworkConfig();

  let client: Client;
  if (network === "mainnet") {
    client = Client.forMainnet();
  } else if (network === "testnet") {
    client = Client.forTestnet();
  } else {
    client = Client.forPreviewnet();
  }

  // Always use ECDSA keys on Hedera - portal.hedera.com issues ECDSA by default
  client.setOperator(operatorId, PrivateKey.fromStringECDSA(operatorKey));

  return client;
}
