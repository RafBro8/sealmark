import { sha256Hex } from '@sealmark/core/light';
import { checkRecordTimestamp } from '@sealmark/core/timestamp';
import { matchSourceFile, parseAuditRecord, reproduceConversion } from '@sealmark/core/verify';
import type { AuditRecord } from '@sealmark/core';
import type {
  DroppedFile,
  Rebuild,
  VerificationReport,
  VerificationStatus,
} from './verify-files.js';

export * from './verify-files.js';

/**
 * Checks a signed PDF against its record, in the browser, with whatever
 * supporting files the person has: the unsigned original, the photos or text it
 * was converted from, or the Word file it was exported from.
 *
 * Kept free of DOM and pdf.js so it runs under test; the caller extracts the
 * record id printed on the certificate page and passes it in.
 */

export interface VerifyInput {
  record: DroppedFile;
  pdfs: DroppedFile[];
  others: DroppedFile[];
  /**
   * Record ids printed on each PDF's certificate pages, by file name. A PDF signed
   * more than once carries one certificate per signing, so there can be several.
   */
  certificateIds: Record<string, string[] | undefined>;
  /** Needed only to rebuild a text conversion. */
  textFont?: () => Promise<Uint8Array>;
}

function readRecord(file: DroppedFile): AuditRecord {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(file.bytes));
  } catch {
    throw new Error(`${file.name} is not a valid record file. It should be the .sealmark.json saved when the document was signed.`);
  }
  return parseAuditRecord(json);
}

export async function verify(input: VerifyInput): Promise<VerificationReport> {
  let record: AuditRecord;
  try {
    record = readRecord(input.record);
  } catch (cause) {
    return { status: 'invalid-record', message: (cause as Error).message, supporting: [], missingSources: [] };
  }

  if (input.pdfs.length === 0) {
    throw new Error('Add the signed PDF.');
  }

  const hashes = new Map<DroppedFile, string>();
  for (const file of [...input.pdfs, ...input.others]) hashes.set(file, await sha256Hex(file.bytes));

  // With several PDFs dropped, the signed one is the one the record describes;
  // failing that, the one whose certificate names this record; failing that, the first.
  const signed =
    input.pdfs.find((pdf) => hashes.get(pdf) === record.signedHash) ??
    input.pdfs.find((pdf) => input.certificateIds[pdf.name]?.includes(record.recordId)) ??
    input.pdfs[0]!;

  const actualHash = hashes.get(signed)!;
  // Prefer this record's own id if the PDF carries it; otherwise report the most
  // recent certificate's id, which is the one a reader would see last.
  const ids = input.certificateIds[signed.name] ?? [];
  const certificateRecordId = ids.includes(record.recordId) ? record.recordId : ids.at(-1);

  let status: VerificationStatus;
  let message: string;
  if (actualHash === record.signedHash) {
    status = 'verified';
    message = `${signed.name} is exactly the document ${record.signer.name} signed. Nothing has changed since.`;
  } else if (certificateRecordId && certificateRecordId !== record.recordId) {
    status = 'wrong-record';
    message = `These files do not belong together. The PDF's certificate is for record ${certificateRecordId}, but this record file is ${record.recordId}.`;
  } else if (certificateRecordId === record.recordId) {
    status = 'modified';
    message = `${signed.name} has been changed since it was signed. Its certificate names this record, but its contents no longer match.`;
  } else {
    status = 'mismatch';
    message = `${signed.name} does not match this record. It has been changed, or the record belongs to a different document.`;
  }

  // Everything else dropped: the unsigned original, or files it was made from.
  const supportingFiles = [...input.pdfs.filter((pdf) => pdf !== signed), ...input.others];
  const supporting: VerificationReport['supporting'] = [];
  const matchedSources = new Map<string, DroppedFile>();

  for (const file of supportingFiles) {
    if (hashes.get(file) === record.originalHash) {
      supporting.push({ name: file.name, result: { kind: 'unsigned-original' } });
      continue;
    }
    const entry = await matchSourceFile(file.bytes, record);
    if (entry) {
      matchedSources.set(entry.sha256, file);
      supporting.push({ name: file.name, result: { kind: 'source', entry } });
    } else {
      supporting.push({ name: file.name, result: { kind: 'no-match' } });
    }
  }

  const missingSources =
    supporting.some((item) => item.result.kind === 'source') && record.source
      ? record.source.files.filter((file) => !matchedSources.has(file.sha256))
      : [];

  let rebuild: Rebuild | undefined;
  if (record.source?.relation === 'converted' && matchedSources.size > 0) {
    if (missingSources.length > 0) {
      const count = record.source.files.length;
      rebuild = { kind: 'skipped', reason: `Add all ${count} source files to rebuild the PDF from them.` };
    } else {
      try {
        const textFont = record.source.method === 'text-to-pdf' && input.textFont ? await input.textFont() : undefined;
        const outcome = await reproduceConversion(record, [...matchedSources.values()].map((f) => f.bytes), textFont);
        rebuild = { kind: outcome.reproduced ? 'reproduced' : 'differs' };
      } catch (cause) {
        rebuild = { kind: 'skipped', reason: (cause as Error).message };
      }
    }
  }

  const timestamp = await checkRecordTimestamp(record);

  return {
    status,
    message,
    record,
    timestamp,
    signedPdfName: signed.name,
    expectedHash: record.signedHash,
    actualHash,
    ...(certificateRecordId ? { certificateRecordId } : {}),
    supporting,
    missingSources,
    ...(rebuild ? { rebuild } : {}),
  };
}
