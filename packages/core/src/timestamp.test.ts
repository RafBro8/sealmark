import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import {
  attachTimestamp,
  base64ToBytes,
  bytesToBase64,
  checkRecordTimestamp,
  checkTimestampToken,
  createTimestampRequest,
  obtainTimestamp,
  readTimestampResponse,
  describeDuration,
} from './timestamp.js';
import { signDocument } from './sign.js';
import { parseAuditRecord } from './verify.js';
import { sha256Text } from './hash.js';
import type { AuditRecord } from './types.js';

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../fixtures/timestamp/${name}`, import.meta.url)));

/**
 * A real DigiCert timestamp, requested once with this module's own request
 * builder and saved, so tests never touch the network.
 */
const real = JSON.parse(fixture('fixture.json').toString('utf8')) as {
  text: string;
  sha256: string;
  nonce: string;
  time: string;
};
let token: Uint8Array;
let response: Uint8Array;

beforeAll(() => {
  token = new Uint8Array(fixture('token.der'));
  response = new Uint8Array(fixture('response.tsr'));
});

const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_TST_INFO = '1.2.840.113549.1.9.16.1.4';

const buffer = (bytes: Uint8Array) => bytes.slice().buffer;
const hexBytes = (hex: string) => new Uint8Array(hex.match(/../g)!.map((pair) => parseInt(pair, 16)));

interface Authority {
  name: string;
  keys: CryptoKeyPair;
  certificate: pkijs.Certificate;
  /** The authority's own certificate, in the form trusted roots are given. */
  root: { der: string };
}

/**
 * A self-made certificate that can sign timestamps. With `timestamping: false`
 * it lacks the timestamping purpose - the forgery a trusted-root check alone
 * would not stop.
 */
async function makeAuthority(name: string, { timestamping }: { timestamping: boolean }): Promise<Authority> {
  pkijs.setEngine('forger', new pkijs.CryptoEngine({ name: 'forger', crypto: globalThis.crypto }));
  const keys = await globalThis.crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );

  const certificate = new pkijs.Certificate();
  certificate.version = 2;
  certificate.serialNumber = new asn1js.Integer({ value: 4242 });
  const cn = new pkijs.AttributeTypeAndValue({ type: '2.5.4.3', value: new asn1js.Utf8String({ value: name }) });
  certificate.issuer.typesAndValues.push(cn);
  certificate.subject.typesAndValues.push(cn);
  certificate.notBefore.value = new Date('2020-01-01T00:00:00Z');
  certificate.notAfter.value = new Date('2040-01-01T00:00:00Z');
  certificate.extensions = [
    new pkijs.Extension({
      extnID: '2.5.29.19',
      critical: true,
      extnValue: new pkijs.BasicConstraints({ cA: true }).toSchema().toBER(false),
    }),
  ];
  if (timestamping) {
    certificate.extensions.push(
      new pkijs.Extension({
        extnID: '2.5.29.37',
        critical: true,
        extnValue: new pkijs.ExtKeyUsage({ keyPurposes: ['1.3.6.1.5.5.7.3.8'] }).toSchema().toBER(false),
        parsedValue: new pkijs.ExtKeyUsage({ keyPurposes: ['1.3.6.1.5.5.7.3.8'] }),
      }),
    );
  }
  await certificate.subjectPublicKeyInfo.importKey(keys.publicKey);
  await certificate.sign(keys.privateKey, 'SHA-256');

  return { name, keys, certificate, root: { der: bytesToBase64(new Uint8Array(certificate.toSchema().toBER(false))) } };
}

/** A timestamp token for `sha256Hex`, signed by `authority`, echoing `nonce` when given. */
async function issueToken(authority: Authority, sha256Hex: string, nonce?: asn1js.Integer): Promise<Uint8Array> {
  const statement = new pkijs.TSTInfo({
    version: 1,
    policy: '1.2.3.4',
    messageImprint: new pkijs.MessageImprint({
      hashAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: OID_SHA256 }),
      hashedMessage: new asn1js.OctetString({ valueHex: buffer(hexBytes(sha256Hex)) }),
    }),
    serialNumber: new asn1js.Integer({ value: 7 }),
    genTime: new Date('2026-09-17T00:00:00Z'),
    ...(nonce ? { nonce } : {}),
  });
  const statementDer = statement.toSchema().toBER(false);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', statementDer);

  const signed = new pkijs.SignedData({
    version: 3,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({
      eContentType: OID_TST_INFO,
      eContent: new asn1js.OctetString({ valueHex: statementDer }),
    }),
    signerInfos: [
      new pkijs.SignerInfo({
        version: 1,
        sid: new pkijs.IssuerAndSerialNumber({
          issuer: authority.certificate.issuer,
          serialNumber: authority.certificate.serialNumber,
        }),
        signedAttrs: new pkijs.SignedAndUnsignedAttributes({
          type: 0,
          attributes: [
            new pkijs.Attribute({ type: '1.2.840.113549.1.9.3', values: [new asn1js.ObjectIdentifier({ value: OID_TST_INFO })] }),
            new pkijs.Attribute({ type: '1.2.840.113549.1.9.4', values: [new asn1js.OctetString({ valueHex: digest })] }),
          ],
        }),
      }),
    ],
    certificates: [authority.certificate],
  });
  await signed.sign(authority.keys.privateKey, 0, 'SHA-256');

  const content = new pkijs.ContentInfo({ contentType: '1.2.840.113549.1.7.2', content: signed.toSchema(true) });
  return new Uint8Array(content.toSchema().toBER(false));
}

async function forgeToken(sha256Hex: string, { timestamping }: { timestamping: boolean }) {
  const authority = await makeAuthority('Forged Timestamp Authority', { timestamping });
  return { token: await issueToken(authority, sha256Hex), root: authority.root };
}

/**
 * A fetch that behaves like a timestamp relay: it reads each request and answers
 * with a granted response from the next authority in `sequence`, echoing the
 * request's nonce. `calls` counts how many requests were made.
 */
function fakeRelay(sequence: Authority[], { hashOverride }: { hashOverride?: string } = {}) {
  const relay = {
    calls: 0,
    fetch: (async (_url: string, init?: RequestInit) => {
      const authority = sequence[Math.min(relay.calls, sequence.length - 1)]!;
      relay.calls += 1;
      const request = new pkijs.TimeStampReq({ schema: asn1js.fromBER(init!.body as ArrayBuffer).result });
      const hash =
        hashOverride ??
        [...new Uint8Array(request.messageImprint.hashedMessage.valueBlock.valueHexView)]
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      const token = await issueToken(authority, hash, request.nonce);
      const reply = new pkijs.TimeStampResp({
        status: new pkijs.PKIStatusInfo({ status: 0 }),
        timeStampToken: new pkijs.ContentInfo({ schema: asn1js.fromBER(buffer(token)).result }),
      });
      return new Response(reply.toSchema().toBER(false), { status: 200 });
    }) as unknown as typeof fetch,
  };
  return relay;
}

describe('createTimestampRequest', () => {
  it('encodes the hash, asks for certificates, and carries a positive nonce', () => {
    const request = createTimestampRequest(real.sha256);
    const parsed = new pkijs.TimeStampReq({ schema: asn1js.fromBER(buffer(request.der)).result });
    const imprint = new Uint8Array(parsed.messageImprint.hashedMessage.valueBlock.valueHexView);
    expect([...imprint].map((b) => b.toString(16).padStart(2, '0')).join('')).toBe(real.sha256);
    expect(parsed.messageImprint.hashAlgorithm.algorithmId).toBe(OID_SHA256);
    expect(parsed.certReq).toBe(true);
    expect(request.nonce).toMatch(/^[0-9a-f]{16}$/);
    expect(parseInt(request.nonce.slice(0, 2), 16)).toBeLessThan(0x80);
  });

  it('uses a fresh nonce every time', () => {
    expect(createTimestampRequest(real.sha256).nonce).not.toBe(createTimestampRequest(real.sha256).nonce);
  });

  it('refuses anything that is not a SHA-256 hex digest', () => {
    expect(() => createTimestampRequest('not-a-hash')).toThrow(/SHA-256/);
  });
});

describe('readTimestampResponse', () => {
  it('extracts the token from a granted reply', () => {
    expect(readTimestampResponse(response)).toEqual(token);
  });

  it('refuses bytes that are not a timestamp reply', () => {
    expect(() => readTimestampResponse(new Uint8Array([1, 2, 3]))).toThrow(/not a timestamp response/);
  });
});

describe('checkTimestampToken, against a real DigiCert timestamp', () => {
  it('accepts it, reporting the authority and time', async () => {
    const check = await checkTimestampToken(token, real.sha256, { nonce: real.nonce });
    expect(check).toMatchObject({ valid: true, authority: expect.stringContaining('DigiCert') });
    expect(check.valid && check.time.toISOString()).toBe(real.time);
  });

  it('rejects it for any other file', async () => {
    expect(await checkTimestampToken(token, await sha256Text('a different document'))).toMatchObject({
      valid: false,
      reason: 'imprint-mismatch',
    });
  });

  it('rejects it as the answer to a different request', async () => {
    expect(await checkTimestampToken(token, real.sha256, { nonce: 'deadbeef' })).toMatchObject({
      valid: false,
      reason: 'nonce-mismatch',
    });
  });

  it('rejects it when DigiCert is not among the trusted roots', async () => {
    expect(await checkTimestampToken(token, real.sha256, { roots: [] })).toMatchObject({ valid: false, reason: 'untrusted' });
  });

  it('rejects it when its signature is damaged', async () => {
    const damaged = new Uint8Array(token);
    const index = damaged.length - 20;
    damaged[index] = (damaged[index] ?? 0) ^ 0xff;
    expect(await checkTimestampToken(damaged, real.sha256)).toMatchObject({ valid: false, reason: 'bad-signature' });
  });

  it('rejects it when the signed statement is altered, even with the same hash', async () => {
    // Change a digit inside the timestamp's own time, leaving the imprint intact.
    const altered = new Uint8Array(token);
    const year = new TextEncoder().encode(real.time.slice(0, 4));
    const at = altered.findIndex((_, i) => year.every((byte, j) => altered[i + j] === byte));
    expect(at).toBeGreaterThan(0);
    altered[at + 3] = altered[at + 3] === 0x39 ? 0x38 : (altered[at + 3] ?? 0) + 1;
    expect(await checkTimestampToken(altered, real.sha256)).toMatchObject({ valid: false });
  });

  it('rejects garbage', async () => {
    expect(await checkTimestampToken(new Uint8Array([0x30, 0x03, 1, 2, 3]), real.sha256)).toMatchObject({
      valid: false,
      reason: 'malformed',
    });
  });
});

describe('checkTimestampToken, against forgeries', () => {
  it('rejects a certificate that was never authorised to issue timestamps, even if trusted', async () => {
    const forged = await forgeToken(real.sha256, { timestamping: false });
    expect(await checkTimestampToken(forged.token, real.sha256, { roots: [forged.root] })).toMatchObject({
      valid: false,
      reason: 'not-a-timestamping-certificate',
    });
  });

  it('rejects a self-made timestamp authority that does not chain to a pinned root', async () => {
    const forged = await forgeToken(real.sha256, { timestamping: true });
    expect(await checkTimestampToken(forged.token, real.sha256)).toMatchObject({ valid: false, reason: 'untrusted' });
  });

  it('would accept that same forgery only if its maker were trusted - so the pinned roots are the gate', async () => {
    const forged = await forgeToken(real.sha256, { timestamping: true });
    expect(await checkTimestampToken(forged.token, real.sha256, { roots: [forged.root] })).toMatchObject({
      valid: true,
      authority: 'Forged Timestamp Authority',
    });
  });
});

describe('records with timestamps', () => {
  const FIELD = [{ kind: 'signature' as const, placement: { page: 0, x: 60, y: 120, width: 200, height: 26 } }];
  const asset = (file: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../assets/${file}`, import.meta.url))));
  const pdf = () => new Uint8Array(readFileSync(fileURLToPath(new URL('../../../fixtures/sample-agreement.pdf', import.meta.url))));

  /** A record whose signed hash is the fixture's hash, so the real token applies to it. */
  async function recordFor(signedAt: string): Promise<AuditRecord> {
    const { audit } = await signDocument({
      document: pdf(), documentName: 'a.pdf', signer: { name: 'Ada Lovelace' }, fields: FIELD,
      scriptFont: asset('GreatVibes-Regular.ttf'), textFont: asset('Lato-Regular.ttf'), now: new Date(signedAt),
    });
    return { ...audit, signedHash: real.sha256 };
  }

  const stored = () => ({
    authority: 'DigiCert SHA256 RSA4096 Timestamp Responder 2026 1',
    time: real.time,
    serialNumber: 'x',
    policy: 'x',
    hashAlgorithm: 'SHA-256' as const,
    token: bytesToBase64(token),
    via: 'https://rfc3161.ai.moda',
  });

  it('attaches the timestamp with an audit event, and survives JSON and validation', async () => {
    const record = attachTimestamp(await recordFor(real.time), stored());
    expect(record.events.at(-1)?.type).toBe('document.timestamped');
    const reparsed = parseAuditRecord(JSON.parse(JSON.stringify(record)));
    expect(base64ToBytes(reparsed.timestamp!.token)).toEqual(token);
  });

  it('verifies a record whose signing time agrees with the authority', async () => {
    const record = attachTimestamp(await recordFor(real.time), stored());
    expect(await checkRecordTimestamp(record)).toMatchObject({ present: true, valid: true, timeDisagrees: false });
  });

  it('flags a record that claims a signing time the authority contradicts', async () => {
    // A backdated record: the forger can change signedAt, but not DigiCert's clock.
    const record = attachTimestamp(await recordFor('2026-01-01T09:00:00Z'), stored());
    const check = await checkRecordTimestamp(record);
    expect(check).toMatchObject({ present: true, valid: true, timeDisagrees: true });
  });

  it('reports a record without a timestamp as such', async () => {
    expect(await checkRecordTimestamp(await recordFor(real.time))).toEqual({ present: false });
  });

  it('rejects a malformed stored timestamp during validation', async () => {
    const record = { ...(await recordFor(real.time)), timestamp: { token: 42 } };
    expect(() => parseAuditRecord(JSON.parse(JSON.stringify(record)))).toThrow(/malformed timestamp/);
  });
});

describe('obtainTimestamp', () => {
  it('turns an unreachable authority into a message a signer can act on', async () => {
    const offline = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch;
    await expect(obtainTimestamp(real.sha256, { fetch: offline })).rejects.toThrow(/could not be reached/);
  });

  it('reports an HTTP failure', async () => {
    const failing = (() => Promise.resolve(new Response('busy', { status: 503 }))) as typeof fetch;
    await expect(obtainTimestamp(real.sha256, { fetch: failing })).rejects.toThrow(/HTTP 503/);
  });

  it('refuses a reply that answers a different request', async () => {
    // The saved reply carries the fixture's nonce, not the fresh one this call generates.
    const replay = (() => Promise.resolve(new Response(buffer(response), { status: 200 }))) as typeof fetch;
    await expect(obtainTimestamp(real.sha256, { fetch: replay })).rejects.toThrow(/does not answer the request/);
  });
});

describe('describeDuration', () => {
  it.each([
    [60_000, '1 minute'],
    [14 * 60_000, '14 minutes'],
    [5 * 3_600_000, '5 hours'],
    [-199 * 86_400_000, '199 days'],
  ])('%i ms reads as %s', (ms, text) => {
    expect(describeDuration(ms)).toBe(text);
  });
});

describe('a real Sectigo timestamp', () => {
  // The relay does not only use DigiCert: in sampling it also routed to Sectigo,
  // whose chain ends at USERTrust RSA Certification Authority.
  it('verifies against the pinned roots', async () => {
    const sectigo = JSON.parse(fixture('sectigo.json').toString('utf8')) as { sha256: string };
    const check = await checkTimestampToken(new Uint8Array(fixture('sectigo-token.der')), sectigo.sha256);
    expect(check).toMatchObject({ valid: true, authority: expect.stringContaining('Sectigo') });
  });
});

describe('obtainTimestamp retrying an untrusted authority', () => {
  it('asks again when the relay routes to an authority it does not trust, and accepts a trusted one', async () => {
    const untrusted = await makeAuthority('Unknown Authority', { timestamping: true });
    const trusted = await makeAuthority('Trusted Authority', { timestamping: true });
    const relay = fakeRelay([untrusted, untrusted, trusted]);

    const record = await obtainTimestamp(real.sha256, { fetch: relay.fetch, roots: [trusted.root] });
    expect(record.authority).toBe('Trusted Authority');
    expect(relay.calls).toBe(3);
  });

  it('gives up after three attempts, never accepting the untrusted reply', async () => {
    const untrusted = await makeAuthority('Unknown Authority', { timestamping: true });
    const trusted = await makeAuthority('Trusted Authority', { timestamping: true });
    const relay = fakeRelay([untrusted]);

    await expect(obtainTimestamp(real.sha256, { fetch: relay.fetch, roots: [trusted.root] })).rejects.toThrow(
      /Asked 3 times without reaching a trusted authority/,
    );
    expect(relay.calls).toBe(3);
  });

  it('does not retry a reply for the wrong file', async () => {
    const trusted = await makeAuthority('Trusted Authority', { timestamping: true });
    const relay = fakeRelay([trusted], { hashOverride: 'b'.repeat(64) });

    await expect(obtainTimestamp(real.sha256, { fetch: relay.fetch, roots: [trusted.root] })).rejects.toThrow(
      /for a different file/,
    );
    expect(relay.calls).toBe(1);
  });
});
