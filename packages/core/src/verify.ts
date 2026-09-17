import type { AuditRecord, SourceFile, SourceRecord, TimestampRecord, VerifyResult } from './types.js';
import { sha256Hex } from './hash.js';
import { imagesToPdf, textToPdf } from './convert.js';
import { isSignatureStyleId } from './styles.js';

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
  if (r.source !== undefined) validateSource(r.source);
  if (r.timestamp !== undefined) {
    const t = r.timestamp as Partial<TimestampRecord>;
    if (typeof t !== 'object' || t === null || typeof t.token !== 'string' || typeof t.time !== 'string' || Number.isNaN(Date.parse(t.time))) {
      throw new Error('Audit record has a malformed timestamp.');
    }
  }
  if (r.signatureStyle !== undefined && !isSignatureStyleId(r.signatureStyle)) {
    throw new Error(`Audit record names an unknown signature style: ${String(r.signatureStyle)}.`);
  }

  return r as AuditRecord;
}

function validateSource(source: unknown): void {
  if (typeof source !== 'object' || source === null) {
    throw new Error('Audit record "source" must be an object.');
  }
  const s = source as Partial<SourceRecord>;
  if (s.relation !== 'converted' && s.relation !== 'declared') {
    throw new Error(`Audit record source has an unknown relation: ${String(s.relation)}.`);
  }
  if (!Array.isArray(s.files) || s.files.length === 0) {
    throw new Error('Audit record source lists no files.');
  }
  for (const file of s.files) {
    if (typeof file?.sha256 !== 'string' || !HEX_64.test(file.sha256)) {
      throw new Error('Audit record source file has an invalid SHA-256.');
    }
    if (typeof file.name !== 'string' || !file.name) {
      throw new Error('Audit record source file is missing a name.');
    }
  }
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

export interface Reproduction {
  /** True when converting the source files again yields the exact PDF that was signed. */
  reproduced: boolean;
  expectedHash: string;
  actualHash: string;
}

/**
 * Repeats the conversion a record claims happened and checks the result.
 *
 * Matching the source files proves they are the files the record names. This
 * goes further: it proves the PDF that was signed really is what those files
 * convert to, because conversion is deterministic. The caller supplies the
 * files in any order; they are matched to the record by content.
 */
export async function reproduceConversion(
  record: AuditRecord,
  provided: Uint8Array[],
  textFont?: Uint8Array,
): Promise<Reproduction> {
  const source = record.source;
  if (!source || source.relation !== 'converted') {
    throw new Error('This record does not describe a conversion Sealmark performed.');
  }

  const reencoded = source.files.filter((file) => file.reencoded);
  if (reencoded.length > 0) {
    throw new Error(
      `The conversion cannot be repeated exactly: ${reencoded.map((file) => file.name).join(', ')} had to be re-encoded by the browser first. The files still match their fingerprints.`,
    );
  }

  const byHash = new Map<string, Uint8Array>();
  for (const bytes of provided) byHash.set(await sha256Hex(bytes), bytes);

  const ordered = source.files.map((file) => byHash.get(file.sha256));
  const missing = source.files.filter((_, index) => !ordered[index]);
  if (missing.length > 0) {
    throw new Error(
      `To repeat the conversion, provide every source file. Missing: ${missing.map((file) => file.name).join(', ')}.`,
    );
  }

  const files = ordered as Uint8Array[];
  const options = source.pageSize ? { pageSize: source.pageSize } : {};
  let pdf: Uint8Array;

  if (source.method === 'image-to-pdf') {
    pdf = await imagesToPdf(files, options);
  } else if (source.method === 'text-to-pdf') {
    if (!textFont) throw new Error('Repeating a text conversion needs the text font.');
    pdf = await textToPdf(new TextDecoder().decode(files[0]), textFont, options);
  } else {
    throw new Error(`Cannot repeat a conversion of type ${source.method}.`);
  }

  const actualHash = await sha256Hex(pdf);
  return { reproduced: actualHash === record.originalHash, expectedHash: record.originalHash, actualHash };
}

/**
 * Finds the source entry a file matches, by content rather than by name —
 * a renamed photo still matches, an edited one with the old name does not.
 */
export async function matchSourceFile(
  bytes: Uint8Array,
  record: AuditRecord,
): Promise<SourceFile | null> {
  if (!record.source) return null;
  const hash = await sha256Hex(bytes);
  return record.source.files.find((file) => file.sha256 === hash) ?? null;
}
