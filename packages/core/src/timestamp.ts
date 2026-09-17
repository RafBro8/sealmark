import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import type { AuditRecord, TimestampRecord } from './types.js';
import { TIMESTAMP_ROOTS } from './tsa-roots.js';

/**
 * RFC 3161 trusted timestamps.
 *
 * A timestamp authority signs a statement that a given SHA-256 existed at a
 * given moment. Sealmark asks for one over the *signed* PDF's hash, so the
 * record gains independent proof of when that exact file existed — something a
 * forger cannot produce for a past date, because the authority's clock and
 * signing key are not theirs.
 *
 * Only the hash is ever sent. This module builds the request and checks the
 * reply; it makes no network call of its own — the caller passes `fetch` in.
 */

export const TIMESTAMP_ENDPOINT = 'https://rfc3161.ai.moda';

const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_TST_INFO = '1.2.840.113549.1.9.16.1.4';
const OID_EXTENDED_KEY_USAGE = '2.5.29.37';
const OID_KP_TIME_STAMPING = '1.3.6.1.5.5.7.3.8';

/** Allowed gap between the record's claimed signing time and the authority's time. */
export const MAX_CLOCK_DRIFT_MS = 15 * 60 * 1000;

let engineReady = false;
function ensureEngine(): void {
  if (engineReady) return;
  const webcrypto = globalThis.crypto;
  if (!webcrypto?.subtle) throw new Error('Web Crypto is unavailable, so timestamps cannot be checked.');
  pkijs.setEngine('sealmark', new pkijs.CryptoEngine({ name: 'sealmark', crypto: webcrypto }));
  engineReady = true;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function parse(bytes: Uint8Array, what: string): asn1js.AsnType {
  const asn1 = asn1js.fromBER(toBuffer(bytes));
  if (asn1.offset === -1) throw new Error(`${what} is not valid DER.`);
  return asn1.result;
}

export interface TimestampRequest {
  der: Uint8Array;
  /** Hex nonce; the reply must echo it, which stops an old reply being replayed. */
  nonce: string;
}

export function createTimestampRequest(sha256Hex: string): TimestampRequest {
  if (!/^[0-9a-f]{64}$/.test(sha256Hex)) throw new Error('A timestamp request needs a SHA-256 hex digest.');
  ensureEngine();

  const nonceBytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(nonceBytes);
  nonceBytes[0] = (nonceBytes[0]! & 0x7f) | 0x01; // positive and non-zero-leading, so it survives INTEGER encoding

  const request = new pkijs.TimeStampReq({
    version: 1,
    messageImprint: new pkijs.MessageImprint({
      hashAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: OID_SHA256 }),
      hashedMessage: new asn1js.OctetString({ valueHex: toBuffer(hexToBytes(sha256Hex)) }),
    }),
    nonce: new asn1js.Integer({ valueHex: toBuffer(nonceBytes) }),
    certReq: true,
  });

  return { der: new Uint8Array(request.toSchema().toBER(false)), nonce: bytesToHex(nonceBytes) };
}

/** Extracts the token from an authority's reply, or explains why it was refused. */
export function readTimestampResponse(der: Uint8Array): Uint8Array {
  ensureEngine();
  let response: pkijs.TimeStampResp;
  try {
    response = new pkijs.TimeStampResp({ schema: parse(der, 'The timestamp reply') });
  } catch {
    throw new Error('The timestamp authority sent a reply that is not a timestamp response.');
  }

  const status = response.status.status;
  if (status !== 0 && status !== 1) {
    const text = response.status.statusStrings?.map((s) => s.valueBlock.value).join(' ') ?? '';
    throw new Error(`The timestamp authority refused the request (status ${status})${text ? `: ${text}` : '.'}`);
  }
  if (!response.timeStampToken) throw new Error('The timestamp authority granted the request but sent no token.');
  return new Uint8Array(response.timeStampToken.toSchema().toBER(false));
}

export type TimestampFailure =
  | 'malformed'
  | 'imprint-mismatch'
  | 'nonce-mismatch'
  | 'not-a-timestamping-certificate'
  | 'untrusted'
  | 'bad-signature';

export type TimestampCheck =
  | {
      valid: true;
      time: Date;
      authority: string;
      serialNumber: string;
      policy: string;
    }
  | { valid: false; reason: TimestampFailure; detail: string };

/**
 * The TSTInfo bytes inside the token's OCTET STRING.
 *
 * DER allows that OCTET STRING to arrive either primitive or split into
 * constructed segments; reading only the primitive form silently yields nothing
 * for the other. getValue() assembles either.
 */
function statementBytes(signed: pkijs.SignedData): Uint8Array {
  return new Uint8Array(signed.encapContentInfo.eContent!.getValue());
}

function commonName(certificate: pkijs.Certificate): string {
  const cn = certificate.subject.typesAndValues.find((entry) => entry.type === '2.5.4.3');
  return cn ? String(cn.value.valueBlock.value) : 'unknown authority';
}

function fail(reason: TimestampFailure, detail: string): TimestampCheck {
  return { valid: false, reason, detail };
}

/**
 * Checks a token proves `sha256Hex` existed at the time it states.
 *
 * In order: the token parses as a timestamp; its imprint is this hash; the
 * nonce matches when one is expected; the signing certificate is authorised
 * specifically for timestamping; that certificate chains to a pinned root as of
 * the timestamp's own time; and the signature over the timestamp is valid.
 */
export async function checkTimestampToken(
  token: Uint8Array,
  sha256Hex: string,
  options: { nonce?: string; roots?: readonly { der: string }[] } = {},
): Promise<TimestampCheck> {
  ensureEngine();

  let signed: pkijs.SignedData;
  let info: pkijs.TSTInfo;
  try {
    const content = new pkijs.ContentInfo({ schema: parse(token, 'The timestamp') });
    signed = new pkijs.SignedData({ schema: content.content });
    if (signed.encapContentInfo.eContentType !== OID_TST_INFO || !signed.encapContentInfo.eContent) {
      return fail('malformed', 'The token does not contain a timestamp statement.');
    }
    info = new pkijs.TSTInfo({ schema: parse(statementBytes(signed), 'The timestamp statement') });
  } catch (cause) {
    return fail('malformed', `The timestamp could not be read: ${(cause as Error).message}`);
  }

  const imprint = bytesToHex(new Uint8Array(info.messageImprint.hashedMessage.valueBlock.valueHexView));
  if (info.messageImprint.hashAlgorithm.algorithmId !== OID_SHA256 || imprint !== sha256Hex) {
    return fail('imprint-mismatch', 'The timestamp is for a different file.');
  }

  if (options.nonce !== undefined) {
    const nonce = info.nonce ? bytesToHex(new Uint8Array(info.nonce.valueBlock.valueHexView)) : '';
    if (nonce.replace(/^0+/, '') !== options.nonce.replace(/^0+/, '')) {
      return fail('nonce-mismatch', 'The timestamp does not answer the request that was sent.');
    }
  }

  const certificates = (signed.certificates ?? []).filter(
    (item): item is pkijs.Certificate => item instanceof pkijs.Certificate,
  );
  const signerInfo = signed.signerInfos[0];
  const signerCert = signerInfo
    ? certificates.find((certificate) => {
        const sid = signerInfo.sid;
        return sid instanceof pkijs.IssuerAndSerialNumber
          ? certificate.serialNumber.isEqual(sid.serialNumber) && certificate.issuer.isEqual(sid.issuer)
          : false;
      })
    : undefined;
  if (!signerCert) return fail('malformed', 'The timestamp does not include the certificate that signed it.');

  // A chain to a trusted root is not enough on its own: that root also stands
  // behind website and code-signing certificates. Only a certificate issued for
  // timestamping may make a timestamp statement.
  const eku = signerCert.extensions?.find((extension) => extension.extnID === OID_EXTENDED_KEY_USAGE);
  const purposes = (eku?.parsedValue as pkijs.ExtKeyUsage | undefined)?.keyPurposes ?? [];
  if (!purposes.includes(OID_KP_TIME_STAMPING)) {
    return fail('not-a-timestamping-certificate', `${commonName(signerCert)} is not authorised to issue timestamps.`);
  }

  const roots = (options.roots ?? TIMESTAMP_ROOTS).map(
    (root) => new pkijs.Certificate({ schema: parse(base64ToBytes(root.der), 'A trusted root') }),
  );

  const engine = pkijs.getCrypto(true);
  const authority = commonName(signerCert);

  // 1. The signing certificate chains to a pinned root. Judged as of the
  //    timestamp's own time, so it stays valid after the certificates expire.
  //    (pkijs's SignedData.verify insists on the original file for timestamps;
  //    a record only holds the hash, which is checked above, so its steps are
  //    run here individually instead.)
  try {
    const chain = new pkijs.CertificateChainValidationEngine({
      trustedCerts: roots,
      certs: certificates.filter((certificate) => certificate !== signerCert),
      checkDate: info.genTime,
    });
    chain.certs.push(signerCert);
    const outcome = await chain.verify({}, engine);
    if (!outcome.result) {
      return fail('untrusted', `${authority} does not chain to a timestamp authority Sealmark trusts.`);
    }
  } catch {
    return fail('untrusted', `${authority} does not chain to a timestamp authority Sealmark trusts.`);
  }

  // 2. The signed attributes commit to this exact timestamp statement.
  const attributes = signerInfo!.signedAttrs;
  if (!attributes) return fail('malformed', 'The timestamp has no signed attributes.');

  const contentType = attributes.attributes.find((a) => a.type === '1.2.840.113549.1.9.3');
  const messageDigest = attributes.attributes.find((a) => a.type === '1.2.840.113549.1.9.4');
  if (String(contentType?.values[0]?.valueBlock?.toString()) !== OID_TST_INFO || !messageDigest) {
    return fail('malformed', 'The timestamp signature does not cover a timestamp statement.');
  }

  const hashAlgorithm = engine.getAlgorithmByOID(signerInfo!.digestAlgorithm.algorithmId);
  if (!('name' in hashAlgorithm)) {
    return fail('bad-signature', `Unsupported digest algorithm ${signerInfo!.digestAlgorithm.algorithmId}.`);
  }
  const statement = statementBytes(signed);
  const digest = new Uint8Array(await engine.digest(hashAlgorithm.name, toBuffer(statement)));
  const claimed = new Uint8Array(messageDigest.values[0].valueBlock.valueHexView);
  if (bytesToHex(digest) !== bytesToHex(claimed)) {
    return fail('bad-signature', 'The timestamp statement has been altered.');
  }

  // 3. The authority's signature over those attributes is genuine.
  const rsa = signerInfo!.signatureAlgorithm.algorithmId === '1.2.840.113549.1.1.1';
  const verified = rsa
    ? await engine.verifyWithPublicKey(attributes.encodedValue, signerInfo!.signature, signerCert.subjectPublicKeyInfo, signerInfo!.signatureAlgorithm, hashAlgorithm.name)
    : await engine.verifyWithPublicKey(attributes.encodedValue, signerInfo!.signature, signerCert.subjectPublicKeyInfo, signerInfo!.signatureAlgorithm);
  if (!verified) return fail('bad-signature', 'The timestamp signature does not verify.');

  return {
    valid: true,
    time: info.genTime,
    authority: commonName(signerCert),
    serialNumber: bytesToHex(new Uint8Array(info.serialNumber.valueBlock.valueHexView)),
    policy: info.policy,
  };
}

/**
 * How many times to ask before giving up, when the relay routes a request to an
 * authority Sealmark does not trust. The relay spreads requests across several
 * authorities, so asking again usually reaches a trusted one; nothing untrusted
 * is ever accepted along the way.
 */
export const TIMESTAMP_ATTEMPTS = 3;

/**
 * Requests, checks and packages a timestamp for a hash.
 *
 * Throws on any failure, with a message fit to show a signer: signing should
 * carry on without a timestamp rather than silently record a bad one. Only an
 * untrusted authority is retried; a reply for the wrong file, a replayed reply
 * or a broken signature is a real problem and fails at once.
 */
export async function obtainTimestamp(
  sha256Hex: string,
  {
    fetch,
    endpoint = TIMESTAMP_ENDPOINT,
    roots,
  }: { fetch: typeof globalThis.fetch; endpoint?: string; roots?: readonly { der: string }[] },
): Promise<TimestampRecord> {
  let untrusted = '';

  for (let attempt = 1; attempt <= TIMESTAMP_ATTEMPTS; attempt += 1) {
    const request = createTimestampRequest(sha256Hex);

    let reply: Response;
    try {
      reply = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/timestamp-query' },
        body: toBuffer(request.der),
      });
    } catch {
      throw new Error('The timestamp authority could not be reached. Check the connection and try again.');
    }
    if (!reply.ok) throw new Error(`The timestamp authority returned HTTP ${reply.status}.`);

    const token = readTimestampResponse(new Uint8Array(await reply.arrayBuffer()));
    const check = await checkTimestampToken(token, sha256Hex, { nonce: request.nonce, ...(roots ? { roots } : {}) });

    if (check.valid) {
      return {
        authority: check.authority,
        time: check.time.toISOString(),
        serialNumber: check.serialNumber,
        policy: check.policy,
        hashAlgorithm: 'SHA-256',
        token: bytesToBase64(token),
        via: endpoint,
      };
    }
    if (check.reason !== 'untrusted') throw new Error(`The timestamp was rejected: ${check.detail}`);
    untrusted = check.detail;
  }

  throw new Error(`The timestamp was rejected: ${untrusted} Asked ${TIMESTAMP_ATTEMPTS} times without reaching a trusted authority.`);
}

/** Adds a timestamp to a record, with an audit event. The PDF is untouched. */
export function attachTimestamp(record: AuditRecord, timestamp: TimestampRecord): AuditRecord {
  return {
    ...record,
    timestamp,
    events: [
      ...record.events,
      {
        at: timestamp.time,
        type: 'document.timestamped',
        detail: `${timestamp.authority} timestamped the signed document, serial ${timestamp.serialNumber}.`,
      },
    ],
  };
}

export type RecordTimestampCheck =
  | { present: false }
  | (TimestampCheck & {
      present: true;
      /** Signing time claimed by the record, minus the authority's time, in ms. */
      driftMs?: number;
      /** True when the record's claimed signing time is far from the authority's. */
      timeDisagrees?: boolean;
    });

/** "3 minutes", "5 hours", "199 days" — a gap between two times, for people. */
export function describeDuration(ms: number): string {
  const minutes = Math.round(Math.abs(ms) / 60000);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  if (days >= 2) return `${days} days`;
  if (hours >= 2) return `${hours} hours`;
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

/** Checks the timestamp stored in a record against that record's signed hash. */
export async function checkRecordTimestamp(record: AuditRecord): Promise<RecordTimestampCheck> {
  if (!record.timestamp) return { present: false };

  let token: Uint8Array;
  try {
    token = base64ToBytes(record.timestamp.token);
  } catch {
    return { present: true, valid: false, reason: 'malformed', detail: 'The stored timestamp is not valid base64.' };
  }

  const check = await checkTimestampToken(token, record.signedHash);
  if (!check.valid) return { present: true, ...check };

  const driftMs = new Date(record.signedAt).getTime() - check.time.getTime();
  return { present: true, ...check, driftMs, timeDisagrees: Math.abs(driftMs) > MAX_CLOCK_DRIFT_MS };
}
