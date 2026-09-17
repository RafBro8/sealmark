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
  TimestampRecord,
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
export { signDocument } from './sign.js';
export { recordFileNameFor, formatBytes, describeDuration } from './format.js';
export { PRODUCER } from './version.js';
export { verifyDocument, verifyOriginal, matchSourceFile, reproduceConversion, parseAuditRecord } from './verify.js';
export type { Reproduction } from './verify.js';
export {
  imagesToPdf,
  textToPdf,
  normaliseText,
  wrapLine,
} from './convert.js';
export type { PageSize, ImageToPdfOptions, TextToPdfOptions } from './convert.js';
export { sniffImageType, naturalCompare } from './sniff.js';
export type { ConvertibleImageType } from './sniff.js';
export {
  jpegOrientation,
  orientationMatrix,
  displaySize,
  swapsAxes,
} from './orientation.js';
export type { Orientation, Matrix } from './orientation.js';
export { detectKind, planIntake, extensionOf, mediaTypeFor } from './intake.js';
export type { InputKind, IntakeFile, IntakePlan } from './intake.js';
export {
  SIGNATURE_STYLES,
  DEFAULT_SIGNATURE_STYLE,
  signatureStyle,
  isSignatureStyleId,
} from './styles.js';
export { missingGlyphs } from './coverage.js';
export type { SignatureStyle, SignatureStyleId } from './styles.js';
export {
  TIMESTAMP_ENDPOINT,
  MAX_CLOCK_DRIFT_MS,
  TIMESTAMP_ATTEMPTS,
  createTimestampRequest,
  readTimestampResponse,
  checkTimestampToken,
  obtainTimestamp,
  attachTimestamp,
  checkRecordTimestamp,
} from './timestamp.js';
export type { TimestampCheck, TimestampFailure, RecordTimestampCheck, TimestampRequest } from './timestamp.js';
export { TIMESTAMP_ROOTS } from './tsa-roots.js';
export type { TrustedRoot } from './tsa-roots.js';
