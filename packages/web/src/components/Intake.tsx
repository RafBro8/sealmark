import { useState, type ChangeEvent, type DragEvent } from 'react';
import { CheckIcon } from './Icons.js';

const ASSURANCES = [
  'Your document never leaves this tab. There is no upload and no server.',
  'Every signed file gets a record proving it has not changed since.',
  'Works offline once the page has loaded.',
];

interface IntakeProps {
  onFile: (file: File) => void;
  error: string | null;
}

export function Intake({ onFile, error }: IntakeProps) {
  const [isOver, setIsOver] = useState(false);

  const take = (file: File | undefined) => {
    if (file) onFile(file);
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsOver(false);
    take(event.dataTransfer.files[0]);
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    take(event.target.files?.[0]);
    // Allow re-selecting the same file after going back.
    event.target.value = '';
  };

  return (
    <div className="intake">
      <div className="intake-inner">
        <h1>Sign a document</h1>
        <p>
          Place your signature, seal the file, and get a record that proves it has not been altered
          since.
        </p>

        {error ? <p className="alert">{error}</p> : null}

        <label
          className={`dropzone${isOver ? ' is-over' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsOver(true);
          }}
          onDragLeave={() => setIsOver(false)}
          onDrop={onDrop}
        >
          <strong>Choose a PDF, or drop one here</strong>
          <span>Word and other formats arrive in a later release</span>
          <input type="file" accept="application/pdf,.pdf" onChange={onChange} />
        </label>

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
