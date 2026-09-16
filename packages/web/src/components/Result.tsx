import type { AuditRecord } from '@sealmark/core';
import { formatHash, recordFileNameFor } from '@sealmark/core';
import { downloadBytes, downloadText } from '../lib/download.js';
import { CheckIcon, DownloadIcon } from './Icons.js';

interface ResultProps {
  pdf: Uint8Array;
  audit: AuditRecord;
  onStartOver: () => void;
}

export function Result({ pdf, audit, onStartOver }: ResultProps) {
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
      </div>
    </div>
  );
}
