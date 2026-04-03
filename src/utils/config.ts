import "dotenv/config";

const SUPPORTED_NETWORKS = ["previewnet", "testnet", "mainnet"] as const;
type Network = (typeof SUPPORTED_NETWORKS)[number];

const MIRROR_NODE_URLS: Record<Network, string> = {
  previewnet: "https://previewnet.mirrornode.hedera.com",
  testnet: "https://testnet.mirrornode.hedera.com",
  mainnet: "https://mainnet-public.mirrornode.hedera.com",
};

export interface NetworkConfig {
  network: Network;
  operatorId: string;
  operatorKey: string;
  mirrorNodeUrl: string;
}

export function getNetworkConfig(): NetworkConfig {
  const network = (process.env.HEDERA_NETWORK || "previewnet") as string;

  if (!SUPPORTED_NETWORKS.includes(network as Network)) {
    throw new Error(`Unsupported network: "${network}". Must be one of: ${SUPPORTED_NETWORKS.join(", ")}`);
  }

  const operatorId = process.env.OPERATOR_ACCOUNT_ID;
  const operatorKey = process.env.OPERATOR_PRIVATE_KEY;

  if (!operatorId || operatorId === "0.0.XXXX") {
    throw new Error("OPERATOR_ACCOUNT_ID must be set in .env (copy .env.example to .env)");
  }
  if (!operatorKey || operatorKey === "your-ecdsa-private-key-here") {
    throw new Error("OPERATOR_PRIVATE_KEY must be set in .env (copy .env.example to .env)");
  }

  return {
    network: network as Network,
    operatorId,
    operatorKey,
    mirrorNodeUrl: MIRROR_NODE_URLS[network as Network],
  };
}
