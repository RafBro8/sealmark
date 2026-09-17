import type { FieldKind, SignatureStyleId } from '@sealmark/core';
import { initialsOf } from '@sealmark/core/light';
import { FIELD_LABEL, type PlacedField, type Signer } from '../types.js';
import { DateIcon, InitialsIcon, ShieldIcon, SignatureIcon, TextIcon } from './Icons.js';
import { StylePicker } from './StylePicker.js';

const TOOLS: Array<{ kind: FieldKind; icon: typeof SignatureIcon }> = [
  { kind: 'signature', icon: SignatureIcon },
  { kind: 'initials', icon: InitialsIcon },
  { kind: 'date', icon: DateIcon },
  { kind: 'text', icon: TextIcon },
];

interface PanelProps {
  signer: Signer;
  onSignerChange: (signer: Signer) => void;
  style: SignatureStyleId;
  onStyleChange: (style: SignatureStyleId) => void;
  armed: FieldKind | null;
  onArm: (kind: FieldKind | null) => void;
  textValue: string;
  onTextValueChange: (value: string) => void;
  fields: PlacedField[];
  onRemove: (id: string) => void;
  timestamp: boolean;
  onTimestampChange: (on: boolean) => void;
  onSign: () => void;
  busy: boolean;
  error: string | null;
}

export function Panel({
  signer,
  onSignerChange,
  style,
  onStyleChange,
  armed,
  onArm,
  textValue,
  onTextValueChange,
  fields,
  onRemove,
  timestamp,
  onTimestampChange,
  onSign,
  busy,
  error,
}: PanelProps) {
  const named = signer.name.trim().length > 0;
  const canSign = named && fields.length > 0 && !busy;

  return (
    <aside className="panel">
      <section className="panel-section">
        <h2 className="panel-title">Signer</h2>

        <div className="row">
          <label htmlFor="signer-name">Full name</label>
          <input
            id="signer-name"
            value={signer.name}
            autoComplete="name"
            placeholder="Ada Lovelace"
            onChange={(event) => onSignerChange({ ...signer, name: event.target.value })}
          />
        </div>

        <div className="row">
          <label htmlFor="signer-email">Email (optional)</label>
          <input
            id="signer-email"
            type="email"
            value={signer.email}
            autoComplete="email"
            placeholder="ada@example.com"
            onChange={(event) => onSignerChange({ ...signer, email: event.target.value })}
          />
        </div>
      </section>

      <section className="panel-section">
        <StylePicker name={signer.name} value={style} onChange={onStyleChange} />
      </section>

      <section className="panel-section">
        <h2 className="panel-title">Place a field</h2>

        <div className="tools">
          {TOOLS.map(({ kind, icon: Icon }) => (
            <button
              key={kind}
              type="button"
              className={`tool${armed === kind ? ' is-armed' : ''}`}
              aria-pressed={armed === kind}
              onClick={() => onArm(armed === kind ? null : kind)}
            >
              <Icon />
              {FIELD_LABEL[kind]}
            </button>
          ))}
        </div>

        {armed === 'text' ? (
          <div className="row" style={{ marginTop: 12 }}>
            <label htmlFor="text-value">Text to place</label>
            <input
              id="text-value"
              value={textValue}
              placeholder="Agreed and accepted"
              autoFocus
              onChange={(event) => onTextValueChange(event.target.value)}
            />
          </div>
        ) : null}

        <p className="hint">
          {armed
            ? `Click the document to place a ${FIELD_LABEL[armed].toLowerCase()} field. Drag to move, corner to resize.`
            : 'Choose a field, then click where it belongs on the page.'}
        </p>
      </section>

      <section className="panel-section">
        <h2 className="panel-title">Placed ({fields.length})</h2>

        {fields.length === 0 ? (
          <p className="empty-note">Nothing placed yet.</p>
        ) : (
          <ul className="placed">
            {fields.map((field) => (
              <li key={field.id}>
                <span className="kind">{FIELD_LABEL[field.kind]}</span>
                <span className="where">p{field.placement.page + 1}</span>
                <span className="value">{previewValue(field, signer)}</span>
                <button
                  type="button"
                  className="btn btn-icon"
                  aria-label={`Remove ${FIELD_LABEL[field.kind].toLowerCase()} on page ${field.placement.page + 1}`}
                  onClick={() => onRemove(field.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel-section">
        <label className="toggle-row">
          <input type="checkbox" checked={timestamp} onChange={(event) => onTimestampChange(event.target.checked)} />
          <span className="switch" aria-hidden />
          <span className="toggle-text">
            <strong>Add a trusted timestamp</strong>
            <small>
              DigiCert confirms when this exact signed file existed, which a forged record cannot fake. Only its
              fingerprint is sent. The document stays here.
            </small>
          </span>
        </label>

        {error ? <p className="alert">{error}</p> : null}

        <button type="button" className="btn btn-primary" disabled={!canSign} onClick={onSign}>
          <ShieldIcon />
          {busy ? (timestamp ? 'Sealing and timestamping…' : 'Sealing…') : 'Sign and seal'}
        </button>

        <p className="hint">
          {named
            ? fields.length === 0
              ? 'Place at least one field to continue.'
              : timestamp
                ? 'Your document stays in this tab. Only its fingerprint is sent, for the timestamp.'
                : 'Signing happens in this tab. Nothing is uploaded.'
            : 'Enter your name to continue.'}
        </p>
      </section>
    </aside>
  );
}

function previewValue(field: PlacedField, signer: Signer): string {
  switch (field.kind) {
    case 'signature':
      return signer.name;
    case 'initials':
      return initialsOf(signer.name);
    case 'date':
      return new Date().toISOString().slice(0, 10);
    case 'text':
      return field.value ?? '';
  }
}
