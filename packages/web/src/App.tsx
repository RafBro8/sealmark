import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuditRecord, FieldKind, FieldSpec, Placement } from '@sealmark/core';
import { initialsOf, isoDate, signDocument } from '@sealmark/core';
import { loadDocument, type LoadedDocument } from './lib/pdf.js';
import { ensureScriptFace, scriptFontBytes } from './lib/font.js';
import { Intake } from './components/Intake.js';
import { PageView } from './components/PageView.js';
import { Panel } from './components/Panel.js';
import { Result } from './components/Result.js';
import { MinusIcon, PlusIcon, SealLogo, ShieldIcon } from './components/Icons.js';
import type { PlacedField, Signer } from './types.js';

interface OpenDocument {
  name: string;
  /** The original bytes, kept pristine for signing. */
  bytes: Uint8Array;
  loaded: LoadedDocument;
}

interface Sealed {
  pdf: Uint8Array;
  audit: AuditRecord;
}

const ZOOM_STEPS = [0.35, 0.5, 0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.6, 2];
const MIN_ZOOM = ZOOM_STEPS[0] ?? 0.35;
const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1] ?? 2;

/**
 * Zoom presets act as stops around whatever the current zoom is, which may be
 * an arbitrary fitted ratio rather than one of the presets.
 */
function stepUp(current: number): number {
  return ZOOM_STEPS.find((step) => step > current + 0.001) ?? MAX_ZOOM;
}

function stepDown(current: number): number {
  for (let index = ZOOM_STEPS.length - 1; index >= 0; index -= 1) {
    const step = ZOOM_STEPS[index];
    if (step !== undefined && step < current - 0.001) return step;
  }
  return MIN_ZOOM;
}

export function App() {
  const [doc, setDoc] = useState<OpenDocument | null>(null);
  const [signer, setSigner] = useState<Signer>({ name: '', email: '' });
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [armed, setArmed] = useState<FieldKind | null>(null);
  const [textValue, setTextValue] = useState('');
  const [zoom, setZoom] = useState(1);
  const [sealed, setSealed] = useState<Sealed | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pagesRef = useRef<HTMLDivElement>(null);

  // Load the script face early so the first preview does not flash in a
  // fallback font.
  useEffect(() => {
    void ensureScriptFace().catch(() => undefined);
  }, []);

  // Open at a zoom that fits the viewer, so a letter-size page does not arrive
  // needing a horizontal scroll on a narrow screen. Fitting uses an exact
  // ratio rather than the nearest preset, because on a phone no preset fits.
  useEffect(() => {
    const container = pagesRef.current;
    if (!doc || !container) return;

    const widest = Math.max(...doc.loaded.pages.map((page) => page.widthPt));
    const styles = getComputedStyle(container);
    const available =
      container.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);

    if (available <= 0) return;
    // Never enlarge past 100% on open; a document should start life-size.
    const fitted = Math.min(1, available / widest);
    setZoom(Math.max(MIN_ZOOM, Math.round(fitted * 1000) / 1000));
  }, [doc]);

  const openFile = useCallback(async (file: File) => {
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      // Cheap format check so a mis-picked file fails with a clear message
      // rather than a parser error.
      const header = new TextDecoder().decode(bytes.subarray(0, 5));
      if (header !== '%PDF-') {
        setError(`${file.name} does not look like a PDF.`);
        return;
      }

      const loaded = await loadDocument(bytes);
      setDoc({ name: file.name, bytes, loaded });
      setFields([]);
      setSealed(null);
    } catch (cause) {
      setError(`Could not open ${file.name}. ${(cause as Error).message}`);
    }
  }, []);

  const place = useCallback(
    (kind: FieldKind, placement: Placement) => {
      if (kind === 'text' && !textValue.trim()) {
        setError('Enter the text before placing a text field.');
        return;
      }
      setError(null);
      setFields((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          kind,
          placement,
          ...(kind === 'text' ? { value: textValue.trim() } : {}),
        },
      ]);
      setArmed(null);
    },
    [textValue],
  );

  const change = useCallback((id: string, placement: Placement) => {
    setFields((current) =>
      current.map((field) => (field.id === id ? { ...field, placement } : field)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setFields((current) => current.filter((field) => field.id !== id));
  }, []);

  const displayTextFor = useCallback(
    (field: PlacedField): string => {
      switch (field.kind) {
        case 'signature':
          return signer.name || 'Your name';
        case 'initials':
          return initialsOf(signer.name) || 'AB';
        case 'date':
          return isoDate(new Date());
        case 'text':
          return field.value ?? '';
      }
    },
    [signer.name],
  );

  const sign = useCallback(async () => {
    if (!doc) return;
    setBusy(true);
    setError(null);

    try {
      const scriptFont = await scriptFontBytes();
      const specs: FieldSpec[] = fields.map((field) => ({
        kind: field.kind,
        placement: field.placement,
        ...(field.value !== undefined ? { value: field.value } : {}),
      }));

      const email = signer.email.trim();
      const result = await signDocument({
        document: doc.bytes,
        documentName: doc.name,
        signer: { name: signer.name.trim(), ...(email ? { email } : {}) },
        fields: specs,
        scriptFont,
      });

      setSealed({ pdf: result.pdf, audit: result.audit });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }, [doc, fields, signer]);

  const startOver = useCallback(() => {
    setSealed(null);
    setDoc(null);
    setFields([]);
    setArmed(null);
    setTextValue('');
  }, []);

  const fieldsByPage = useMemo(() => {
    const map = new Map<number, PlacedField[]>();
    for (const field of fields) {
      const list = map.get(field.placement.page) ?? [];
      list.push(field);
      map.set(field.placement.page, list);
    }
    return map;
  }, [fields]);

  return (
    <div className="app">
      <header className="header">
        <div className="wordmark">
          <SealLogo />
          Sealmark
        </div>
        <div className="header-note">
          <span className="dot" aria-hidden />
          <ShieldIcon size={13} />
          <span>Nothing leaves this tab</span>
        </div>
      </header>

      <div className="main">
        {sealed ? (
          <Result pdf={sealed.pdf} audit={sealed.audit} onStartOver={startOver} />
        ) : !doc ? (
          <Intake onFile={(file) => void openFile(file)} error={error} />
        ) : (
          <>
            <div className="viewer">
              <div className="viewer-bar">
                <span className="doc-name" title={doc.name}>
                  {doc.name}
                </span>
                <span className="spacer" />
                <div className="zoom">
                  <button
                    type="button"
                    className="btn btn-icon"
                    aria-label="Zoom out"
                    disabled={zoom <= MIN_ZOOM}
                    onClick={() => setZoom(stepDown)}
                  >
                    <MinusIcon />
                  </button>
                  <span>{Math.round(zoom * 100)}%</span>
                  <button
                    type="button"
                    className="btn btn-icon"
                    aria-label="Zoom in"
                    disabled={zoom >= MAX_ZOOM}
                    onClick={() => setZoom(stepUp)}
                  >
                    <PlusIcon />
                  </button>
                </div>
                <button type="button" className="btn" onClick={startOver}>
                  Close
                </button>
              </div>

              <div className="pages" ref={pagesRef}>
                {doc.loaded.pages.map((page) => (
                  <PageView
                    key={page.index}
                    proxy={doc.loaded.proxy}
                    page={page}
                    zoom={zoom}
                    fields={fieldsByPage.get(page.index) ?? []}
                    armed={armed}
                    displayTextFor={displayTextFor}
                    onPlace={place}
                    onChange={change}
                    onRemove={remove}
                  />
                ))}
              </div>
            </div>

            <Panel
              signer={signer}
              onSignerChange={setSigner}
              armed={armed}
              onArm={setArmed}
              textValue={textValue}
              onTextValueChange={setTextValue}
              fields={fields}
              onRemove={remove}
              onSign={() => void sign()}
              busy={busy}
              error={error}
            />
          </>
        )}
      </div>
    </div>
  );
}
