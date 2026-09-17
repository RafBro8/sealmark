import { useState } from 'react';
import type { AuditRecord } from '@sealmark/core';
import { formatHash, recordFileNameFor } from '@sealmark/core';
import { downloadBytes, downloadText } from '../lib/download.js';
import { AlertIcon, CheckIcon, DownloadIcon } from './Icons.js';

/** What to keep, and what it lets someone prove later. */
function sourceAdvice(audit: AuditRecord): string {
  const source = audit.source!;
  const plural = source.files.length === 1 ? 'the original file' : 'the original files';

  if (source.relation === 'declared') {
    return `Keep ${source.files[0]?.name ?? 'the original'} too. Its fingerprint is in the record, so it can be matched later — recorded as your declaration, since the PDF was exported outside Sealmark.`;
  }
  if (source.files.some((file) => file.reencoded)) {
    return `Keep ${plural} too. Their fingerprints are in the record, so they can be matched to this document later.`;
  }
  return `Keep ${plural} too. With them, anyone can repeat the conversion and confirm it produces exactly the PDF you signed.`;
}

/** "2026-09-17 02:53:49 UTC" */
export function readableUtc(iso: string): string {
  return iso.replace('T', ' ').replace(/[.][0-9]+Z$|Z$/, ' UTC');
}

interface ResultProps {
  pdf: Uint8Array;
  audit: AuditRecord;
  /** Set when a timestamp was requested but could not be added. */
  timestampError?: string;
  onAddTimestamp: () => Promise<void>;
  onStartOver: () => void;
}

export function Result({ pdf, audit, timestampError, onAddTimestamp, onStartOver }: ResultProps) {
  const [retrying, setRetrying] = useState(false);
  const signedName = audit.documentName.replace(/\.pdf$/i, '') + '.signed.pdf';
  const recordName = recordFileNameFor(signedName);

  return (
    <div className="result">
      <div className="result-inner">
        <span className="result-badge">
          <CheckIcon size={14} />
          Sealed
        </span>

        <h2>{signedName}</h2>
        <p className="result-lede">
          Download both files and keep them together. The record is what proves the document has not
          changed.
        </p>

        <dl className="card">
          <div className="card-row">
            <dt>Record</dt>
            <dd>{audit.recordId}</dd>
          </div>
          {audit.timestamp ? (
            <div className="card-row is-timestamp">
              <dt>Trusted timestamp</dt>
              <dd>
                {readableUtc(audit.timestamp.time)}
                <span className="source-hash">{audit.timestamp.authority}</span>
              </dd>
            </div>
          ) : null}
          {audit.source
            ? audit.source.files.map((file) => (
                <div className="card-row" key={file.sha256 + file.name}>
                  <dt>{audit.source?.relation === 'converted' ? 'Made from' : 'Declared original'}</dt>
                  <dd>
                    {file.name}
                    <span className="mono source-hash">{formatHash(file.sha256)}</span>
                  </dd>
                </div>
              ))
            : null}
          <div className="card-row">
            <dt>Signer</dt>
            <dd>
              {audit.signer.name}
              {audit.signer.email ? ` · ${audit.signer.email}` : ''}
            </dd>
          </div>
          <div className="card-row">
            <dt>Signed at</dt>
            <dd>{audit.signedAt.replace('T', ' ').replace('Z', ' UTC')}</dd>
          </div>
          <div className="card-row">
            <dt>Fields</dt>
            <dd>{audit.fields.length}</dd>
          </div>
          <div className="card-row">
            <dt>Original SHA-256</dt>
            <dd className="mono">{formatHash(audit.originalHash)}</dd>
          </div>
          <div className="card-row">
            <dt>Sealed SHA-256</dt>
            <dd className="mono">{formatHash(audit.signedHash)}</dd>
          </div>
        </dl>

        {!audit.timestamp && timestampError ? (
          <div className="timestamp-failed" role="status">
            <AlertIcon size={16} />
            <div>
              <strong>Signed, but not timestamped.</strong> {timestampError} The signed PDF and record are complete
              without it. A timestamp added later proves the document existed by then, rather than when it was
              signed, so it is worth trying again now.
              <button
                type="button"
                className="btn"
                disabled={retrying}
                onClick={() => {
                  setRetrying(true);
                  void onAddTimestamp().finally(() => setRetrying(false));
                }}
              >
                {retrying ? 'Trying…' : 'Try again'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="downloads">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => downloadBytes(pdf, signedName, 'application/pdf')}
          >
            <DownloadIcon />
            Signed PDF
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              downloadText(`${JSON.stringify(audit, null, 2)}\n`, recordName, 'application/json')
            }
          >
            <DownloadIcon />
            Record file
          </button>
          <button type="button" className="btn" onClick={onStartOver}>
            Sign another
          </button>
        </div>

        <p className="keep-note">
          <strong>Keep {recordName} with the PDF.</strong> To check the document later, compare its
          SHA-256 against the sealed hash above. Any change at all produces a different value.
        </p>

        {audit.source ? <p className="keep-note">{sourceAdvice(audit)}</p> : null}
      </div>
    </div>
  );
}
