import type { AuditRecord, VerifyResult } from './types.js';
import { sha256Hex } from './hash.js';

const HEX_64 = /^[0-9a-f]{64}$/;

/**
 * Validates untrusted JSON as an audit record.
 *
 * A record file arrives from disk or from a counterparty, so it is checked
 * rather than trusted — a malformed record must fail loudly, not verify by
 * accident against an undefined hash.
 */
export function parseAuditRecord(input: unknown): AuditRecord {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Audit record must be a JSON object.');
  }
  const r = input as Partial<AuditRecord>;

  if (r.version !== 1) {
    throw new Error(`Unsupported audit record version: ${String(r.version)}. Expected 1.`);
  }
  for (const key of ['originalHash', 'signedHash'] as const) {
    const value = r[key];
    if (typeof value !== 'string' || !HEX_64.test(value)) {
      throw new Error(`Audit record field "${key}" is not a SHA-256 hex digest.`);
    }
  }
  if (typeof r.documentName !== 'string' || !r.documentName) {
    throw new Error('Audit record is missing "documentName".');
  }
  if (typeof r.signer !== 'object' || r.signer === null || typeof r.signer.name !== 'string') {
    throw new Error('Audit record is missing a valid "signer".');
  }
  if (!Array.isArray(r.events) || !Array.isArray(r.fields)) {
    throw new Error('Audit record is missing "events" or "fields".');
  }

  return r as AuditRecord;
}

/**
 * Checks a signed document against its audit record.
 *
 * This is the whole tamper-evidence guarantee: the record states the SHA-256 of
 * the document as sealed, so any later edit — one character, one pixel, one
 * byte of metadata — changes the digest and reports as tampered.
 */
export async function verifyDocument(pdf: Uint8Array, record: AuditRecord): Promise<VerifyResult> {
  const actualHash = await sha256Hex(pdf);
  const intact = actualHash === record.signedHash;
  const messages: string[] = [];

  if (intact) {
    messages.push(`Document matches record ${record.recordId}.`);
    messages.push(`Signed by ${record.signer.name} at ${record.signedAt}.`);
  } else {
    messages.push('The document does not match its audit record.');
    messages.push('It has been modified since it was signed, or the record belongs to another file.');
  }

  return {
    status: intact ? 'verified' : 'tampered',
    intact,
    expectedHash: record.signedHash,
    actualHash,
    record,
    messages,
  };
}

/**
 * Confirms a source file is the one that was originally signed.
 *
 * Useful when you still hold the unsigned original and want to prove the signed
 * copy derives from it rather than from a substituted document.
 */
export async function verifyOriginal(original: Uint8Array, record: AuditRecord): Promise<boolean> {
  return (await sha256Hex(original)) === record.originalHash;
}
