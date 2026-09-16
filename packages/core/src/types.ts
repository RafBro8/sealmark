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

export interface SignOptions {
  /** Raw bytes of the source PDF. */
  document: Uint8Array;
  /** Original filename, recorded in the audit trail. */
  documentName: string;
  signer: Signer;
  fields: FieldSpec[];
  /** TrueType/OpenType bytes used to render signature and initials fields. */
  scriptFont: Uint8Array;
  /** Signing instant. Injectable so tests are deterministic. */
  now?: Date;
  /** Append the human-readable signature certificate page. Defaults to true. */
  appendCertificate?: boolean;
}

export interface AuditEvent {
  /** ISO-8601 UTC. */
  at: string;
  type: 'document.received' | 'field.stamped' | 'certificate.appended' | 'document.sealed';
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
