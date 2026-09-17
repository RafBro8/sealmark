import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuditRecord, FieldKind, FieldSpec, Placement, SignatureStyleId, SourceFileInput, SourceInput } from '@sealmark/core';
import { initialsOf, isoDate } from '@sealmark/core/light';
import { loadDocument, type LoadedDocument } from './lib/pdf.js';
import { textFontBytes } from './lib/font.js';
import { ensureStyleFace, familyFor, saveStyle, savedStyle, styleFontBytes } from './lib/styles.js';
import { defaultPageSize, prepareFiles } from './lib/prepare.js';
import { saveTimestampPreference, savedTimestampPreference } from './lib/preferences.js';
import { Intake } from './components/Intake.js';
import { PageView } from './components/PageView.js';
import { Panel } from './components/Panel.js';
import { Result } from './components/Result.js';
import { ThemeToggle } from './components/ThemeToggle.js';
import { Verify } from './components/Verify.js';
import { AppUpdates } from './components/AppUpdates.js';
import { useOnline } from './lib/online.js';
import { MinusIcon, PlusIcon, SealLogo, ShieldIcon } from './components/Icons.js';
import type { PlacedField, Signer } from './types.js';

interface OpenDocument {
  name: string;
  /** The original bytes, kept pristine for signing. */
  bytes: Uint8Array;
  loaded: LoadedDocument;
  /** Where the PDF came from, when it was not handed over as a PDF. */
  source?: SourceInput;
}

/** Short description of a document's origin for the viewer bar. */
function describeSource(source: SourceInput): string {
  const [first] = source.files;
  if (source.relation === 'declared') return `Original: ${first?.name ?? 'declared'}`;
  if (source.method === 'image-to-pdf') {
    return source.files.length === 1 ? 'Converted from 1 photo' : `Converted from ${source.files.length} photos`;
  }
  return `Converted from ${first?.name ?? 'text'}`;
}

interface Sealed {
  pdf: Uint8Array;
  audit: AuditRecord;
  /** Why a requested timestamp could not be added, if it could not. */
  timestampError?: string;
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

type Mode = 'sign' | 'verify';

export function App() {
  const [mode, setMode] = useState<Mode>('sign');
  const online = useOnline();
  const [doc, setDoc] = useState<OpenDocument | null>(null);
  const [signer, setSigner] = useState<Signer>({ name: '', email: '' });
  const [style, setStyle] = useState<SignatureStyleId>(savedStyle);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [armed, setArmed] = useState<FieldKind | null>(null);
  const [textValue, setTextValue] = useState('');
  const [zoom, setZoom] = useState(1);
  const [sealed, setSealed] = useState<Sealed | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declared, setDeclared] = useState<SourceFileInput | null>(null);
  const [converting, setConverting] = useState<string | null>(null);
  const [timestampOn, setTimestampOn] = useState(savedTimestampPreference);

  const pagesRef = useRef<HTMLDivElement>(null);

  // Load the chosen face as soon as there is a document to place it on, so
  // fields do not flash in a fallback font — but not before: the intake screen
  // never draws a signature, and the font is the heaviest thing it would fetch.
  const hasDocument = doc !== null;
  useEffect(() => {
    if (hasDocument) void ensureStyleFace(style).catch(() => undefined);
  }, [style, hasDocument]);

  const chooseStyle = useCallback((id: SignatureStyleId) => {
    setStyle(id);
    saveStyle(id);
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

  const openFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      setConverting('Reading…');
      try {
        const prepared = await prepareFiles(files, defaultPageSize(navigator.language), setConverting);

        if (prepared.kind === 'rejected') {
          setError(prepared.reason);
          return;
        }
        if (prepared.kind === 'office') {
          setDeclared(prepared.original);
          return;
        }

        // A PDF chosen on the Word step is the export of the declared original.
        let source = prepared.source;
        if (declared && !source) {
          source = { relation: 'declared', method: 'exported-by-signer', files: [declared] };
        } else if (declared && source) {
          setError('Choose the PDF you exported, not another photo or text file.');
          return;
        }

        const loaded = await loadDocument(prepared.bytes);
        setDoc({ name: prepared.name, bytes: prepared.bytes, loaded, ...(source ? { source } : {}) });
        setDeclared(null);
        setFields([]);
        setSealed(null);
      } catch (cause) {
        setError((cause as Error).message);
      } finally {
        setConverting(null);
      }
    },
    [declared],
  );

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
      // Signing code loads now, on first use, rather than with the page.
      const [{ signDocument }, scriptFont, textFont] = await Promise.all([
        import('@sealmark/core/sign'),
        styleFontBytes(style),
        textFontBytes(),
      ]);
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
        signatureStyle: style,
        textFont,
        ...(doc.source ? { source: doc.source } : {}),
      });

      // The PDF is final at this point. A timestamp only adds to the record, so a
      // failure to get one must not undo the signing.
      let audit = result.audit;
      let timestampError: string | undefined;
      if (timestampOn) {
        try {
          const { attachTimestamp, obtainTimestamp } = await import('@sealmark/core/timestamp');
          audit = attachTimestamp(audit, await obtainTimestamp(audit.signedHash, { fetch: window.fetch.bind(window) }));
        } catch (cause) {
          timestampError = (cause as Error).message;
        }
      }

      setSealed({ pdf: result.pdf, audit, ...(timestampError ? { timestampError } : {}) });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }, [doc, fields, signer, style, timestampOn]);

  const chooseTimestamp = useCallback((on: boolean) => {
    setTimestampOn(on);
    saveTimestampPreference(on);
  }, []);

  /** Adds a timestamp to a document already signed, e.g. after an earlier failure. */
  const addTimestamp = useCallback(async () => {
    if (!sealed) return;
    try {
      const { attachTimestamp, obtainTimestamp } = await import('@sealmark/core/timestamp');
      const timestamp = await obtainTimestamp(sealed.audit.signedHash, { fetch: window.fetch.bind(window) });
      setSealed({ pdf: sealed.pdf, audit: attachTimestamp(sealed.audit, timestamp) });
    } catch (cause) {
      setSealed({ ...sealed, timestampError: (cause as Error).message });
    }
  }, [sealed]);

  const startOver = useCallback(() => {
    setSealed(null);
    setDoc(null);
    setFields([]);
    setArmed(null);
    setTextValue('');
    setDeclared(null);
    setError(null);
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
        <nav className="modes" aria-label="Mode">
          {(['sign', 'verify'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`mode${mode === value ? ' is-active' : ''}`}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {value === 'sign' ? 'Sign' : 'Verify'}
            </button>
          ))}
        </nav>
        <div className="header-note">
          <span className="dot" aria-hidden />
          <ShieldIcon size={13} />
          <span>{online ? 'Documents never leave this tab' : 'Offline · documents never leave this tab'}</span>
        </div>
        <ThemeToggle />
      </header>

      <AppUpdates />
      <div className="main">
        {/* Kept mounted while hidden, so files added for verification survive a trip to Sign. */}
        <div className="mode-panel" hidden={mode !== 'verify'}>
          <Verify />
        </div>
        {mode === 'verify' ? null : sealed ? (
          <Result
            pdf={sealed.pdf}
            audit={sealed.audit}
            {...(sealed.timestampError ? { timestampError: sealed.timestampError } : {})}
            onAddTimestamp={addTimestamp}
            online={online}
            onStartOver={startOver}
          />
        ) : !doc ? (
          <Intake
            onFiles={(files) => void openFiles(files)}
            declared={declared}
            onCancelDeclared={() => {
              setDeclared(null);
              setError(null);
            }}
            converting={converting}
            error={error}
          />
        ) : (
          <>
            <div className="viewer">
              <div className="viewer-bar">
                <span className="doc-name" title={doc.name}>
                  {doc.name}
                </span>
                {doc.source ? (
                  <span className={`source-chip is-${doc.source.relation}`}>{describeSource(doc.source)}</span>
                ) : null}
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
                    scriptFamily={familyFor(style)}
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
              style={style}
              onStyleChange={chooseStyle}
              armed={armed}
              onArm={setArmed}
              textValue={textValue}
              onTextValueChange={setTextValue}
              fields={fields}
              onRemove={remove}
              timestamp={timestampOn}
              online={online}
              onTimestampChange={chooseTimestamp}
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
