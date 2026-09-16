export type {
  AuditEvent,
  AuditRecord,
  FieldKind,
  FieldSpec,
  Placement,
  SignOptions,
  SignResult,
  Signer,
  VerifyResult,
  VerifyStatus,
} from './types.js';

export { sha256Hex, sha256Text, formatHash } from './hash.js';
export { fitText, initialsOf, isoDate } from './text.js';
export { stampFields } from './stamp.js';
export type { StampedField, StampFonts } from './stamp.js';
export { appendCertificate } from './certificate.js';
export type { CertificateData } from './certificate.js';
export { signDocument, recordFileNameFor, PRODUCER } from './sign.js';
export { verifyDocument, verifyOriginal, parseAuditRecord } from './verify.js';
