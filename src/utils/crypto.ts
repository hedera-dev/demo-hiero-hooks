/**
 * Computes keccak256 hash of the given data.
 * Uses @noble/hashes (transitive dependency from the Hiero SDK).
 */
export async function computeKeccak256(data: Buffer | Uint8Array): Promise<Buffer> {
  const { keccak_256 } = await import("@noble/hashes/sha3");
  return Buffer.from(keccak_256(data));
}

/**
 * Converts a Buffer to its minimal big-endian byte representation
 * by stripping leading zero bytes.
 *
 * EVM hook storage keys and values must use minimal representation
 * per HIP-1195. A fully-zero buffer (e.g., slot 0x00) becomes
 * empty bytes [].
 */
export function toMinimalBytes(buf: Buffer): Buffer {
  let start = 0;
  while (start < buf.length && buf[start] === 0) start++;
  return buf.slice(start);
}
