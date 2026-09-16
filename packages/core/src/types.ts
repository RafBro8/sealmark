import type { PageSize } from './convert.js';

/** Field kinds Sealmark can stamp onto a document. */
export type FieldKind = 'signature' | 'initials' | 'date' | 'text';

/**
 * Where a field lands, in PDF user-space points.
 * Origin is the bottom-left of the page, matching the PDF spec.
 */
export interface Placement {
  /** Zero-based page index. */
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FieldSpec {
  kind: FieldKind;
  placement: Placement;
  /**
   * Explicit content. Optional for `signature` and `initials` (derived from the
   * signer's name) and for `date` (derived from the signing time).
   */
  value?: string;
}

export interface Signer {
  name: string;
  email?: string;
}

/**
 * How the PDF being signed relates to the files it came from.
 *
 * - `converted`: Sealmark made the PDF from these files. The conversion is
 *   deterministic, so anyone can repeat it and check the hash.
 * - `declared`: the signer exported the PDF elsewhere (Word, Google Docs) and
 *   states this file is its original. Recorded, but not something Sealmark can
 *   prove, and the record says so.
 */
export type SourceRelation = 'converted' | 'declared';

export type SourceMethod = 'image-to-pdf' | 'text-to-pdf' | 'exported-by-signer';

export interface SourceFileInput {
  name: string;
  mediaType: string;
  /** The file as the signer supplied it. This is what gets fingerprinted. */
  bytes: Uint8Array;
  /**
   * Set when the file had to be decoded and re-encoded (for example a WebP
   * decoded by the browser) before conversion. Re-encoding is not guaranteed to
   * be byte-identical across browsers, so such a conversion cannot be repeated.
   */
  reencoded?: boolean;
}

export interface SourceInput {
  relation: SourceRelation;
  method: SourceMethod;
  /** In page order. For a conversion, the order the files were converted in. */
  files: SourceFileInput[];
  /** Page size the conversion used. Recorded so the conversion can be repeated. */
  pageSize?: PageSize;
}

export interface SourceFile {
  name: string;
  mediaType: string;
  /** Size in bytes. */
  size: number;
  sha256: string;
  reencoded?: true;
}

export interface SourceRecord {
  relation: SourceRelation;
  method: SourceMethod;
  files: SourceFile[];
  pageSize?: PageSize;
}

export interface SignOptions {
  /** Raw bytes of the PDF to sign. */
  document: Uint8Array;
  /** Filename, recorded in the audit trail. */
  documentName: string;
  signer: Signer;
  fields: FieldSpec[];
  /** TrueType/OpenType bytes used to render signature and initials fields. */
  scriptFont: Uint8Array;
  /**
   * TrueType/OpenType bytes for plain text: date and text fields and the
   * certificate page. Must cover the characters people actually use in names —
   * PDF's built-in fonts cannot encode "ł", so a Polish signer could not sign.
   */
  textFont: Uint8Array;
  /** The files this PDF was made from, when it did not start life as a PDF. */
  source?: SourceInput;
  /** Signing instant. Injectable so tests are deterministic. */
  now?: Date;
  /** Append the human-readable signature certificate page. Defaults to true. */
  appendCertificate?: boolean;
}

export interface AuditEvent {
  /** ISO-8601 UTC. */
  at: string;
  type:
    | 'source.converted'
    | 'source.declared'
    | 'document.received'
    | 'field.stamped'
    | 'certificate.appended'
    | 'document.sealed';
  detail: string;
}

/**
 * The tamper-evidence artifact. Written alongside the signed PDF as
 * `<name>.sealmark.json` and consumed by `verifyDocument`.
 */
export interface AuditRecord {
  /** Schema version, so future readers can migrate old records. */
  version: 1;
  /** Short human-quotable identifier, printed on the certificate page. */
  recordId: string;
  documentName: string;
  signer: Signer;
  signedAt: string;
  /** SHA-256 of the input document — proves *what* was signed. */
  originalHash: string;
  /** SHA-256 of the output PDF — proves it has not changed since. */
  signedHash: string;
  /** Present when the signed PDF was made from other files. */
  source?: SourceRecord;
  fields: Array<{ kind: FieldKind; page: number; value: string }>;
  events: AuditEvent[];
  producer: string;
}

export interface SignResult {
  pdf: Uint8Array;
  audit: AuditRecord;
}

export type VerifyStatus = 'verified' | 'tampered' | 'invalid-record';

export interface VerifyResult {
  status: VerifyStatus;
  /** True only when the recomputed hash matches the audit record. */
  intact: boolean;
  expectedHash: string;
  actualHash: string;
  record: AuditRecord;
  messages: string[];
}
