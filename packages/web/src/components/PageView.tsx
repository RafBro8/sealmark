import { useEffect, useRef, type MouseEvent } from 'react';
import type { FieldKind, Placement } from '@sealmark/core';
import type { LoadedPage, PDFDocumentProxy } from '../lib/pdf.js';
import { renderPage } from '../lib/pdf.js';
import { clampToPage, toPdf, tidy, type PageGeometry } from '../lib/coords.js';
import { DEFAULT_SIZE, type PlacedField } from '../types.js';
import { FieldBox } from './FieldBox.js';

interface PageViewProps {
  proxy: PDFDocumentProxy;
  page: LoadedPage;
  zoom: number;
  fields: PlacedField[];
  armed: FieldKind | null;
  displayTextFor: (field: PlacedField) => string;
  scriptFamily: string;
  onPlace: (kind: FieldKind, placement: Placement) => void;
  onChange: (id: string, placement: Placement) => void;
  onRemove: (id: string) => void;
}

export function PageView({
  proxy,
  page,
  zoom,
  fields,
  armed,
  displayTextFor,
  scriptFamily,
  onPlace,
  onChange,
  onRemove,
}: PageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // A zoom change can arrive while the previous render is still running;
    // pdf.js rejects overlapping renders on one canvas, so stale results are
    // discarded rather than drawn.
    let cancelled = false;
    void renderPage(proxy, page.index, canvas, zoom).catch((error: unknown) => {
      if (!cancelled) console.error('Failed to render page', page.index + 1, error);
    });

    return () => {
      cancelled = true;
    };
  }, [proxy, page.index, zoom]);

  const geometry: PageGeometry = { widthPt: page.widthPt, heightPt: page.heightPt, zoom };

  const place = (event: MouseEvent<HTMLDivElement>) => {
    if (!armed) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const size = DEFAULT_SIZE[armed];

    // Drop the box centred on the pointer, which is where a user expects it.
    const box = clampToPage(
      {
        left: event.clientX - bounds.left - (size.width * zoom) / 2,
        top: event.clientY - bounds.top - (size.height * zoom) / 2,
        width: size.width * zoom,
        height: size.height * zoom,
      },
      geometry,
    );

    onPlace(armed, tidy(toPdf(box, page.index, geometry)));
  };

  return (
    <div className="page-shell">
      <span className="page-label">Page {page.index + 1}</span>
      <canvas ref={canvasRef} />
      <div
        className={`field-layer${armed ? ' is-arming' : ''}`}
        onClick={place}
        style={{ width: page.widthPt * zoom, height: page.heightPt * zoom }}
      >
        {fields.map((field) => (
          <FieldBox
            key={field.id}
            field={field}
            geometry={geometry}
            displayText={displayTextFor(field)}
            scriptFamily={scriptFamily}
            onChange={onChange}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  );
}
