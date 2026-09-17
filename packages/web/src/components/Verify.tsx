import { useEffect, useState, type ChangeEvent, type DragEvent } from 'react';
import { describeDuration, formatHash, signatureStyle, type AuditRecord } from '@sealmark/core';
import { trailingPagesText } from '../lib/pdf.js';
import { textFontBytes } from '../lib/font.js';
import {
  assignFiles,
  certificateRecordIds,
  verify,
  type DroppedFile,
  type VerificationReport,
} from '../lib/verification.js';
import { AlertIcon, CheckIcon, CloseIcon, FileIcon, ShieldIcon } from './Icons.js';

type Role = 'Signed PDF' | 'Record' | 'PDF' | 'Supporting file';

function rolesFor(files: DroppedFile[], report: VerificationReport | null): Map<DroppedFile, Role> {
  const { record, pdfs } = assignFiles(files);
  const roles = new Map<DroppedFile, Role>();
  for (const file of files) {
    if (file === record) roles.set(file, 'Record');
    else if (pdfs.includes(file)) roles.set(file, report?.signedPdfName === file.name ? 'Signed PDF' : 'PDF');
    else roles.set(file, 'Supporting file');
  }
  return roles;
}

const VERDICT: Record<VerificationReport['status'], { title: string; tone: 'ok' | 'bad' }> = {
  verified: { title: 'Verified', tone: 'ok' },
  modified: { title: 'Changed since signing', tone: 'bad' },
  'wrong-record': { title: 'These files do not belong together', tone: 'bad' },
  mismatch: { title: 'Does not match', tone: 'bad' },
  'invalid-record': { title: 'Record file cannot be read', tone: 'bad' },
};

function signedAt(record: AuditRecord): string {
  return record.signedAt.replace('T', ' ').replace(/\.\d+Z$|Z$/, ' UTC');
}

function TimestampLine({ report }: { report: VerificationReport }) {
  const check = report.timestamp;
  if (!check) return null;

  if (!check.present) {
    return (
      <li className="is-pending">
        <FileIcon size={13} />
        <span>No trusted timestamp. The signing time comes from the signer's own device.</span>
      </li>
    );
  }
  if (!check.valid) {
    return (
      <li className="is-bad">
        <CloseIcon size={12} />
        <span>
          <strong>The record's timestamp is not valid.</strong> {check.detail} Treat this record with suspicion.
        </span>
      </li>
    );
  }

  const when = check.time.toISOString().replace('T', ' ').replace(/[.][0-9]+Z$|Z$/, ' UTC');
  const covers = report.status === 'verified' ? 'this exact PDF' : 'the signed PDF this record describes, not the file you added,';
  return (
    <>
      <li className="is-ok">
        <CheckIcon size={13} />
        <span>
          <strong>{check.authority}</strong> confirms {covers} existed at <strong>{when}</strong>.
        </span>
      </li>
      {check.timeDisagrees ? (
        <li className="is-bad">
          <AlertIcon size={14} />
          <span>
            <strong>The record claims it was signed {describeDuration(check.driftMs ?? 0)}{' '}
            {(check.driftMs ?? 0) < 0 ? 'earlier' : 'later'}.</strong> Trust the timestamp, not the record's own
            time.
          </span>
        </li>
      ) : null}
    </>
  );
}

export function Verify() {
  const [files, setFiles] = useState<DroppedFile[]>([]);
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [isOver, setIsOver] = useState(false);

  const add = async (list: FileList | null | undefined) => {
    const incoming = list ? [...list] : [];
    if (incoming.length === 0) return;
    const read = await Promise.all(
      incoming.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })),
    );
    // Adding a file with a name already present replaces it.
    setFiles((current) => [...current.filter((f) => !read.some((r) => r.name === f.name)), ...read]);
  };

  // Re-check whenever the set of files changes.
  useEffect(() => {
    let cancelled = false;
    const assigned = assignFiles(files);
    setReport(null);

    if (files.length === 0) {
      setProblem(null);
      return;
    }
    if (assigned.problem) {
      setProblem(assigned.problem);
      return;
    }
    if (!assigned.record || assigned.pdfs.length === 0) {
      setProblem(
        !assigned.record && assigned.pdfs.length === 0
          ? 'Add the signed PDF and its record file.'
          : !assigned.record
            ? 'Now add the record file — the .sealmark.json saved when the document was signed. The PDF alone cannot prove it is unchanged.'
            : 'Now add the signed PDF.',
      );
      return;
    }

    setProblem(null);
    setChecking(true);
    void (async () => {
      const certificateIds: Record<string, string[]> = {};
      for (const pdf of assigned.pdfs) {
        certificateIds[pdf.name] = certificateRecordIds(await trailingPagesText(pdf.bytes));
      }
      const result = await verify({
        record: assigned.record!,
        pdfs: assigned.pdfs,
        others: assigned.others,
        certificateIds,
        textFont: textFontBytes,
      });
      if (!cancelled) setReport(result);
    })()
      .catch((cause: Error) => {
        if (!cancelled) setProblem(cause.message);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [files]);

  const roles = rolesFor(files, report);
  const verdict = report ? VERDICT[report.status] : null;
  const record = report?.record;

  return (
    <div className="verify">
      <div className="verify-inner">
        <h1>Verify a signed document</h1>
        <p className="verify-lede">
          Add the signed PDF and its record file. To check what it was made from, add the original photos, text
          or Word file as well. Everything is checked in this tab.
        </p>

        <label
          className={`dropzone${isOver ? ' is-over' : ''}`}
          onDragOver={(event: DragEvent<HTMLLabelElement>) => {
            event.preventDefault();
            setIsOver(true);
          }}
          onDragLeave={() => setIsOver(false)}
          onDrop={(event: DragEvent<HTMLLabelElement>) => {
            event.preventDefault();
            setIsOver(false);
            void add(event.dataTransfer.files);
          }}
        >
          <strong>{files.length === 0 ? 'Choose files, or drop them here' : 'Add more files'}</strong>
          <span>The signed PDF, its .sealmark.json record, and any originals</span>
          <input
            type="file"
            multiple
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              void add(event.target.files);
              event.target.value = '';
            }}
          />
        </label>

        {files.length > 0 ? (
          <ul className="verify-files">
            {files.map((file) => (
              <li key={file.name}>
                <FileIcon />
                <span className="verify-file-name">{file.name}</span>
                <span className="verify-file-role">{roles.get(file)}</span>
                <button
                  type="button"
                  className="verify-file-remove"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setFiles((current) => current.filter((f) => f !== file))}
                >
                  <CloseIcon />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {problem ? <p className="verify-hint">{problem}</p> : null}
        {checking ? <p className="verify-hint">Checking…</p> : null}

        {report && verdict ? (
          <section className={`verdict is-${verdict.tone}`} aria-live="polite">
            <div className="verdict-head">
              {verdict.tone === 'ok' ? <ShieldIcon size={22} /> : <AlertIcon size={22} />}
              <div>
                <h2>{verdict.title}</h2>
                <p>{report.message}</p>
              </div>
            </div>

            {record ? (
              <dl className="card">
                <div className="card-row">
                  <dt>Record</dt>
                  <dd>{record.recordId}</dd>
                </div>
                <div className="card-row">
                  <dt>Signer</dt>
                  <dd>
                    {record.signer.name}
                    {record.signer.email ? ` · ${record.signer.email}` : ''}
                  </dd>
                </div>
                <div className="card-row">
                  <dt>Signed at</dt>
                  <dd>{signedAt(record)}</dd>
                </div>
                {record.signatureStyle ? (
                  <div className="card-row">
                    <dt>Signature style</dt>
                    <dd>{signatureStyle(record.signatureStyle).label}</dd>
                  </div>
                ) : null}
                <div className="card-row">
                  <dt>Expected SHA-256</dt>
                  <dd className="mono">{formatHash(report.expectedHash ?? '')}</dd>
                </div>
                <div className={`card-row${report.status === 'verified' ? '' : ' is-mismatch'}`}>
                  <dt>This PDF's SHA-256</dt>
                  <dd className="mono">{formatHash(report.actualHash ?? '')}</dd>
                </div>
              </dl>
            ) : null}

            {report.timestamp ? (
              <ul className="checks">
                <TimestampLine report={report} />
              </ul>
            ) : null}

            {report.supporting.length > 0 || report.missingSources.length > 0 || report.rebuild ? (
              <ul className="checks">
                {report.supporting.map(({ name, result }) => (
                  <li key={name} className={result.kind === 'no-match' ? 'is-bad' : 'is-ok'}>
                    {result.kind === 'no-match' ? <CloseIcon size={12} /> : <CheckIcon size={13} />}
                    <span>
                      {result.kind === 'unsigned-original' && <><strong>{name}</strong> is the unsigned document that was signed.</>}
                      {result.kind === 'source' && (
                        <>
                          <strong>{name}</strong> matches <strong>{result.entry.name}</strong>
                          {record?.source?.relation === 'declared'
                            ? ', which the signer declared as the original.'
                            : ', which the PDF was made from.'}
                        </>
                      )}
                      {result.kind === 'no-match' && <><strong>{name}</strong> does not match anything in this record.</>}
                    </span>
                  </li>
                ))}
                {report.missingSources.map((file) => (
                  <li key={file.sha256} className="is-pending">
                    <FileIcon size={13} />
                    <span>
                      <strong>{file.name}</strong> is named in the record but was not added.
                    </span>
                  </li>
                ))}
                {report.rebuild ? (
                  <li className={report.rebuild.kind === 'differs' ? 'is-bad' : report.rebuild.kind === 'skipped' ? 'is-pending' : 'is-ok'}>
                    {report.rebuild.kind === 'reproduced' ? <CheckIcon size={13} /> : report.rebuild.kind === 'differs' ? <CloseIcon size={12} /> : <FileIcon size={13} />}
                    <span>
                      {report.rebuild.kind === 'reproduced' && 'Converting these files again produces exactly the PDF that was signed.'}
                      {report.rebuild.kind === 'differs' && 'Converting these files again does not produce the PDF that was signed.'}
                      {report.rebuild.kind === 'skipped' && report.rebuild.reason}
                    </span>
                  </li>
                ) : null}
              </ul>
            ) : null}

            <p className="verify-limits">
              <strong>What this proves:</strong> the PDF is byte-for-byte the document this record describes. It
              cannot prove the record itself is genuine — someone who changes a PDF could also write a new record
              for it.{' '}
              {report.timestamp?.present && report.timestamp.valid
                ? 'The trusted timestamp narrows that: such a record would carry a timestamp from when it was forged, not from the original signing.'
                : 'A trusted timestamp, added when signing, is what narrows that. Keep your own copy of the record for anything you sign or receive.'}
            </p>

            <button type="button" className="btn" onClick={() => setFiles([])}>
              Check other files
            </button>
          </section>
        ) : null}
      </div>
    </div>
  );
}
