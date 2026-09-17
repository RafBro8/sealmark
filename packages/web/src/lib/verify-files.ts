import type { AuditRecord, RecordTimestampCheck, SourceFile } from '@sealmark/core';

/**
 * Sorting out what someone dropped on the Verify screen, and the shape of the
 * report. Cheap enough to load with the page; the checking itself lives in
 * verification.ts and loads only when there is something to check.
 */

export interface DroppedFile {
  name: string;
  bytes: Uint8Array;
}

export function looksLikePdf(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-';
}

export function looksLikeRecord(name: string, bytes: Uint8Array): boolean {
  if (/\.sealmark\.json$/i.test(name) || /\.json$/i.test(name)) return true;
  const head = new TextDecoder().decode(bytes.subarray(0, 64)).trimStart();
  return head.startsWith('{');
}

const RECORD_ID = /\bSM-[0-9A-F]{12}\b/g;

/** Record ids printed on a certificate page, from its extracted text. */
export function certificateRecordIds(text: string): string[] {
  return [...new Set(text.match(RECORD_ID) ?? [])];
}

export type SupportingResult =
  | { kind: 'unsigned-original' }
  | { kind: 'source'; entry: SourceFile }
  | { kind: 'no-match' };

export type Rebuild =
  | { kind: 'reproduced' }
  | { kind: 'differs' }
  | { kind: 'skipped'; reason: string };

export type VerificationStatus =
  /** The PDF is byte-identical to the one the record describes. */
  | 'verified'
  /** Same record id on the certificate, different bytes: the file was changed. */
  | 'modified'
  /** The certificate names a different record: these two files do not belong together. */
  | 'wrong-record'
  /** Bytes differ and there is no certificate to say why. */
  | 'mismatch'
  | 'invalid-record';

export interface VerificationReport {
  status: VerificationStatus;
  message: string;
  record?: AuditRecord;
  signedPdfName?: string;
  expectedHash?: string;
  actualHash?: string;
  certificateRecordId?: string;
  supporting: Array<{ name: string; result: SupportingResult }>;
  /** Source files named in the record that were not supplied. */
  missingSources: SourceFile[];
  rebuild?: Rebuild;
  /** The record's own timestamp, checked independently of the PDF. */
  timestamp?: RecordTimestampCheck;
}

export interface Assignment {
  record?: DroppedFile;
  pdfs: DroppedFile[];
  others: DroppedFile[];
  problem?: string;
}

/** Sorts what was dropped into a record, PDFs, and everything else. */
export function assignFiles(files: DroppedFile[]): Assignment {
  const records = files.filter((file) => !looksLikePdf(file.bytes) && looksLikeRecord(file.name, file.bytes));
  const pdfs = files.filter((file) => looksLikePdf(file.bytes));
  const others = files.filter((file) => !records.includes(file) && !pdfs.includes(file));

  if (records.length > 1) {
    return { pdfs, others, problem: 'More than one record file was added. Keep only the one that belongs to this PDF.' };
  }
  return { ...(records[0] ? { record: records[0] } : {}), pdfs, others };
}
