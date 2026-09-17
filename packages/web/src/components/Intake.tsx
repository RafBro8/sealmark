import { useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react';
import type { SourceFileInput } from '@sealmark/core';
import { formatBytes } from '@sealmark/core/light';
import { CheckIcon } from './Icons.js';

const ASSURANCES = [
  'Your document never leaves this tab. Photos and text are converted here, with no upload and no server.',
  'Every signed file gets a record proving it has not changed since, and what it was made from.',
  'Works offline, and installs as an app from your browser.',
];

const ACCEPT_ANY = [
  'application/pdf', '.pdf',
  'image/*', '.heic', '.heif',
  'text/plain', '.txt', '.md',
  '.doc', '.docx', '.odt', '.rtf', '.pages',
].join(',');

const EXPORT_STEPS: Array<[string, string]> = [
  ['Microsoft Word', 'File › Save As, then choose PDF as the format'],
  ['Google Docs', 'File › Download › PDF Document'],
  ['Apple Pages', 'File › Export To › PDF'],
  ['LibreOffice', 'File › Export as PDF'],
];

interface IntakeProps {
  onFiles: (files: File[]) => void;
  /** A Word-type original waiting for its exported PDF. */
  declared: SourceFileInput | null;
  onCancelDeclared: () => void;
  /** Progress text while converting, or null when idle. */
  converting: string | null;
  error: string | null;
}

interface DropProps {
  accept: string;
  multiple: boolean;
  disabled: boolean;
  onFiles: (files: File[]) => void;
  children: ReactNode;
}

function Drop({ accept, multiple, disabled, onFiles, children }: DropProps) {
  const [isOver, setIsOver] = useState(false);

  const take = (list: FileList | null | undefined) => {
    const files = list ? [...list] : [];
    if (files.length > 0 && !disabled) onFiles(files);
  };

  return (
    <label
      className={`dropzone${isOver ? ' is-over' : ''}${disabled ? ' is-busy' : ''}`}
      aria-disabled={disabled}
      onDragOver={(event: DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        if (!disabled) setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(event: DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        setIsOver(false);
        take(event.dataTransfer.files);
      }}
    >
      {children}
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          take(event.target.files);
          // Allow re-selecting the same file after going back.
          event.target.value = '';
        }}
      />
    </label>
  );
}

export function Intake({ onFiles, declared, onCancelDeclared, converting, error }: IntakeProps) {
  if (declared) {
    return (
      <div className="intake">
        <div className="intake-inner">
          <h1>One more step for {declared.name}</h1>
          <p>
            Sealmark does not convert Word documents itself. Converters that run in a browser do not
            reproduce the layout exactly, and a signed contract has to look exactly like the one that was
            agreed. Export it as a PDF from the app it came from, then drop the PDF here.
          </p>

          {error ? <p className="alert">{error}</p> : null}

          <ol className="export-steps">
            {EXPORT_STEPS.map(([app, how]) => (
              <li key={app}>
                <strong>{app}</strong>
                <span>{how}</span>
              </li>
            ))}
          </ol>
          <p className="export-more">Excel, PowerPoint, Numbers and Keynote export the same way.</p>

          <Drop accept="application/pdf,.pdf" multiple={false} disabled={converting !== null} onFiles={onFiles}>
            <strong>Choose the exported PDF</strong>
            <span>or drop it here</span>
          </Drop>

          <p className="declared-note">
            {declared.name} ({formatBytes(declared.bytes.byteLength)}) has been fingerprinted on this device.
            The signing record will name it as the original you exported from, marked as your declaration,
            because Sealmark did not perform the export itself.
          </p>

          <button type="button" className="btn btn-quiet" onClick={onCancelDeclared}>
            Choose a different file
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="intake">
      <div className="intake-inner">
        <h1>Sign a document</h1>
        <p>
          Place your signature, seal the file, and get a record that proves it has not been altered since.
        </p>

        {error ? <p className="alert">{error}</p> : null}

        <Drop accept={ACCEPT_ANY} multiple disabled={converting !== null} onFiles={onFiles}>
          {converting ? (
            <>
              <strong>{converting}</strong>
              <span>Working in this tab</span>
            </>
          ) : (
            <>
              <strong>Choose a document, or drop it here</strong>
              <span>A PDF, photos of a paper document, or a text file</span>
            </>
          )}
        </Drop>

        <p className="formats-note">
          Word, Pages or Google Docs? Save it as a PDF first. Choose the file and we will show you how.
        </p>

        <ul className="assurances">
          {ASSURANCES.map((text) => (
            <li key={text}>
              <CheckIcon size={14} />
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
