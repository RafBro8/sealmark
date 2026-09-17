/**
 * The part of the core a browser can load on a first visit.
 *
 * Everything reachable from this file must avoid pdf-lib, fontkit, PKI.js and
 * asn1js; those load on demand through the other entry points. light.test.ts
 * walks this file's imports and fails if a heavy library creeps back in.
 */

export type * from './types.js';
export { sha256Hex, sha256Text, formatHash } from './hash.js';
export { initialsOf, isoDate } from './text.js';
export { formatBytes, recordFileNameFor, describeDuration } from './format.js';
export { sniffImageType, naturalCompare } from './sniff.js';
export type { ConvertibleImageType } from './sniff.js';
export { detectKind, planIntake, extensionOf, mediaTypeFor } from './intake.js';
export type { InputKind, IntakeFile, IntakePlan } from './intake.js';
export {
  SIGNATURE_STYLES,
  DEFAULT_SIGNATURE_STYLE,
  signatureStyle,
  isSignatureStyleId,
} from './styles.js';
export type { SignatureStyle, SignatureStyleId } from './styles.js';
export { TIMESTAMP_ENDPOINT, MAX_CLOCK_DRIFT_MS } from './timestamp-config.js';
