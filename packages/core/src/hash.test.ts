import { describe, it, expect } from 'vitest';
import { sha256Hex, sha256Text, formatHash } from './hash.js';

describe('sha256', () => {
  it('matches the published digest for "abc"', async () => {
    // FIPS 180-4 test vector - proves we are computing real SHA-256.
    await expect(sha256Text('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes the empty input', async () => {
    await expect(sha256Hex(new Uint8Array())).resolves.toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('changes completely when one byte changes', async () => {
    const a = await sha256Hex(new Uint8Array([1, 2, 3, 4]));
    const b = await sha256Hex(new Uint8Array([1, 2, 3, 5]));
    expect(a).not.toBe(b);
  });

  it('hashes only the view, not the whole backing buffer', async () => {
    // A Uint8Array can be a window onto a larger buffer. If digest() were given
    // the buffer rather than the view, these would wrongly differ.
    const backing = new Uint8Array([9, 9, 1, 2, 3, 9, 9]);
    const view = backing.subarray(2, 5);
    const standalone = new Uint8Array([1, 2, 3]);
    expect(await sha256Hex(view)).toBe(await sha256Hex(standalone));
  });

  it('groups hashes for display', () => {
    expect(formatHash('aabbccdd11223344', 8)).toBe('aabbccdd 11223344');
  });
});
