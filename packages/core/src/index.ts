export type {
  AuditEvent,
  AuditRecord,
  FieldKind,
  FieldSpec,
  Placement,
  SignOptions,
  SignResult,
  Signer,
  SourceFile,
  SourceFileInput,
  SourceInput,
  SourceMethod,
  SourceRecord,
  SourceRelation,
  VerifyResult,
  VerifyStatus,
} from './types.js';

export { sha256Hex, sha256Text, formatHash } from './hash.js';
export { fitText, initialsOf, isoDate } from './text.js';
export { unsupportedCharacters, assertRenderable } from './glyphs.js';
export { stampFields } from './stamp.js';
export type { StampedField, StampFonts } from './stamp.js';
export { appendCertificate } from './certificate.js';
export type { CertificateData } from './certificate.js';
export { signDocument, recordFileNameFor, formatBytes } from './sign.js';
export { PRODUCER } from './version.js';
export { verifyDocument, verifyOriginal, matchSourceFile, reproduceConversion, parseAuditRecord } from './verify.js';
export type { Reproduction } from './verify.js';
export {
  imagesToPdf,
  textToPdf,
  sniffImageType,
  naturalCompare,
  normaliseText,
  wrapLine,
} from './convert.js';
export type { PageSize, ImageToPdfOptions, TextToPdfOptions, ConvertibleImageType } from './convert.js';
export {
  jpegOrientation,
  orientationMatrix,
  displaySize,
  swapsAxes,
} from './orientation.js';
export type { Orientation, Matrix } from './orientation.js';
export { detectKind, planIntake, extensionOf, mediaTypeFor } from './intake.js';
export type { InputKind, IntakeFile, IntakePlan } from './intake.js';
