import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type {
  AuditEvent,
  AuditRecord,
  SignOptions,
  SignResult,
  SourceInput,
  SourceRecord,
} from './types.js';
import { sha256Hex, sha256Text } from './hash.js';
import { stampFields } from './stamp.js';
import { appendCertificate } from './certificate.js';
import { PRODUCER } from './version.js';
import { formatBytes, recordFileNameFor } from './format.js';
import { signatureStyle } from './styles.js';

export { PRODUCER };
export { formatBytes, recordFileNameFor } from './format.js';

/**
 * Short, human-quotable id derived from the document, signer and instant.
 * Deterministic, so re-signing identical inputs at the same time reproduces it.
 */
async function deriveRecordId(originalHash: string, signedAt: string, signer: string): Promise<string> {
  const digest = await sha256Text(`${originalHash}|${signedAt}|${signer}`);
  return `SM-${digest.slice(0, 12).toUpperCase()}`;
}

async function fingerprintSource(source: SourceInput): Promise<SourceRecord> {
  if (source.files.length === 0) {
    throw new Error('A source must list at least one file.');
  }
  const files = await Promise.all(
    source.files.map(async (file) => ({
      name: file.name,
      mediaType: file.mediaType,
      size: file.bytes.byteLength,
      sha256: await sha256Hex(file.bytes),
      ...(file.reencoded ? { reencoded: true as const } : {}),
    })),
  );
  return {
    relation: source.relation,
    method: source.method,
    files,
    ...(source.pageSize ? { pageSize: source.pageSize } : {}),
  };
}

/**
 * Signs a PDF: stamps the requested fields, appends the certificate page, and
 * produces the audit record that makes the result tamper-evident.
 *
 * Pure in/out — no filesystem, no network — so the same call works in Node and
 * in the browser.
 */
export async function signDocument(options: SignOptions): Promise<SignResult> {
  const {
    document,
    documentName,
    signer,
    fields,
    scriptFont,
    signatureStyle: styleId,
    textFont,
    source: sourceInput,
    now = new Date(),
    appendCertificate: withCertificate = true,
  } = options;

  if (fields.length === 0) {
    throw new Error('At least one field is required to sign a document.');
  }
  if (!signer.name.trim()) {
    throw new Error('Signer name is required.');
  }

  const signedAt = now.toISOString();
  const originalHash = await sha256Hex(document);
  const recordId = await deriveRecordId(originalHash, signedAt, signer.name);
  const source = sourceInput ? await fingerprintSource(sourceInput) : undefined;
  if (styleId !== undefined) signatureStyle(styleId); // fail early on an unknown id

  const events: AuditEvent[] = [];

  if (source) {
    for (const file of source.files) {
      events.push({
        at: signedAt,
        type: source.relation === 'converted' ? 'source.converted' : 'source.declared',
        detail:
          source.relation === 'converted'
            ? `${file.name} (${formatBytes(file.size)}) converted to PDF, SHA-256 ${file.sha256.slice(0, 16)}…`
            : `${file.name} (${formatBytes(file.size)}) declared by the signer as the original, SHA-256 ${file.sha256.slice(0, 16)}…`,
      });
    }
  }

  events.push({
    at: signedAt,
    type: 'document.received',
    detail: `${documentName} received, SHA-256 ${originalHash.slice(0, 16)}…`,
  });

  const pdf = await PDFDocument.load(document);
  pdf.registerFontkit(fontkit);

  const fonts = {
    script: await pdf.embedFont(scriptFont, { subset: true }),
    plain: await pdf.embedFont(textFont, { subset: true }),
  };

  const stamped = stampFields(pdf, fields, signer, fonts, now);
  for (const field of stamped) {
    events.push({
      at: signedAt,
      type: 'field.stamped',
      detail: `${field.kind} on page ${field.page + 1}: "${field.value}"`,
    });
  }

  if (withCertificate) {
    await appendCertificate(pdf, fonts.plain, {
      recordId,
      documentName,
      signer,
      signedAt,
      originalHash,
      fields: stamped,
      events: [...events],
      recordFileName: recordFileNameFor(documentName),
      ...(source ? { source } : {}),
      ...(styleId ? { signatureStyle: signatureStyle(styleId).label } : {}),
    });
    events.push({
      at: signedAt,
      type: 'certificate.appended',
      detail: 'Signature certificate added after the document pages.',
    });
  }

  // Pin the producer and modification date so identical inputs yield identical
  // bytes — which is what makes the signed hash reproducible.
  pdf.setProducer(PRODUCER);
  pdf.setModificationDate(now);

  const signedBytes = await pdf.save({ useObjectStreams: false });
  const signedHash = await sha256Hex(signedBytes);

  events.push({
    at: signedAt,
    type: 'document.sealed',
    detail: `Signed document sealed, SHA-256 ${signedHash.slice(0, 16)}…`,
  });

  const audit: AuditRecord = {
    version: 1,
    recordId,
    documentName,
    signer,
    signedAt,
    originalHash,
    signedHash,
    ...(source ? { source } : {}),
    ...(styleId ? { signatureStyle: styleId } : {}),
    fields: stamped,
    events,
    producer: PRODUCER,
  };

  return { pdf: signedBytes, audit };
}
