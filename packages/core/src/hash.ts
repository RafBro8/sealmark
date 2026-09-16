/**
 * Hashing helpers built on Web Crypto, which is available natively in browsers
 * and in Node 20+. Keeping this dependency-free is what lets the core run
 * unchanged on both sides.
 */

const HEX = '0123456789abcdef';

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += HEX[byte >> 4]! + HEX[byte & 0x0f]!;
  }
  return out;
}

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new Error(
      'Web Crypto is unavailable. Sealmark requires Node 20+ or a secure browser context (HTTPS or localhost).',
    );
  }
  return c.subtle;
}

/** SHA-256 of `data`, lowercase hex. */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  // Copy into a standalone ArrayBuffer: a Uint8Array view may cover only part
  // of a larger buffer, and digest() would otherwise hash the whole thing.
  const buf = new ArrayBuffer(data.byteLength);
  new Uint8Array(buf).set(data);
  return toHex(new Uint8Array(await subtle().digest('SHA-256', buf)));
}

/** SHA-256 of a UTF-8 string, lowercase hex. */
export async function sha256Text(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text));
}

/** Groups a hash for display: `a1b2c3d4 e5f6...`. Easier to read aloud or compare by eye. */
export function formatHash(hash: string, groupSize = 8): string {
  return (hash.match(new RegExp(`.{1,${groupSize}}`, 'g')) ?? []).join(' ');
}
