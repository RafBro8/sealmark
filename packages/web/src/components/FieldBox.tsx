import { useRef, type PointerEvent as ReactPointerEvent, type KeyboardEvent } from 'react';
import type { Placement } from '@sealmark/core';
import type { PlacedField } from '../types.js';
import { FIELD_LABEL } from '../types.js';
import { clampToPage, toPdf, toScreen, tidy, type PageGeometry, type ScreenBox } from '../lib/coords.js';
import { fitTextSize } from '../lib/font.js';
import { CloseIcon } from './Icons.js';

/** Smallest usable box, in PDF points. */
const MIN_WIDTH = 24;
const MIN_HEIGHT = 10;

interface FieldBoxProps {
  field: PlacedField;
  geometry: PageGeometry;
  /** What the field will actually stamp, shown as a live preview. */
  displayText: string;
  /** CSS font family for signature and initials fields. */
  scriptFamily: string;
  onChange: (id: string, placement: Placement) => void;
  onRemove: (id: string) => void;
}

interface DragState {
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  origin: ScreenBox;
}

export function FieldBox({ field, geometry, displayText, scriptFamily, onChange, onRemove }: FieldBoxProps) {
  const drag = useRef<DragState | null>(null);
  const box = toScreen(field.placement, geometry);
  const isScript = field.kind === 'signature' || field.kind === 'initials';

  const commit = (next: ScreenBox) => {
    onChange(field.id, tidy(toPdf(clampToPage(next, geometry), field.placement.page, geometry)));
  };

  const begin = (mode: DragState['mode']) => (event: ReactPointerEvent<HTMLElement>) => {
    // Let the remove button do its own job.
    if ((event.target as HTMLElement).closest('.field-remove')) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { mode, startX: event.clientX, startY: event.clientY, origin: box };
  };

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state) return;

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;

    if (state.mode === 'move') {
      commit({ ...state.origin, left: state.origin.left + dx, top: state.origin.top + dy });
      return;
    }

    // Resizing grows from the top-left, so that corner stays put on screen.
    commit({
      ...state.origin,
      width: Math.max(MIN_WIDTH * geometry.zoom, state.origin.width + dx),
      height: Math.max(MIN_HEIGHT * geometry.zoom, state.origin.height + dy),
    });
  };

  const end = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  /** Arrow keys nudge; holding shift moves a larger step. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = (event.shiftKey ? 10 : 1) * geometry.zoom;
    const nudge: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onRemove(field.id);
      return;
    }

    const delta = nudge[event.key];
    if (!delta) return;
    event.preventDefault();
    commit({ ...box, left: box.left + delta[0], top: box.top + delta[1] });
  };

  const fontSize = fitTextSize(
    displayText,
    isScript ? scriptFamily : 'system-ui',
    Math.max(box.width - 4, 1),
    box.height,
  );

  return (
    <div
      className="field"
      role="group"
      tabIndex={0}
      aria-label={`${FIELD_LABEL[field.kind]} field. Arrow keys to move, delete to remove.`}
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      onPointerDown={begin('move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
    >
      <span className="field-tag">{FIELD_LABEL[field.kind]}</span>

      <button
        type="button"
        className="field-remove"
        aria-label={`Remove ${FIELD_LABEL[field.kind].toLowerCase()} field`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => onRemove(field.id)}
      >
        <CloseIcon />
      </button>

      <span
        className={`field-text ${isScript ? 'is-script' : 'is-plain'}`}
        style={{
          fontSize: `${fontSize}px`,
          ...(isScript ? { fontFamily: `"${scriptFamily}", cursive` } : {}),
        }}
      >
        {displayText}
      </span>

      <button
        type="button"
        className="field-handle"
        aria-label="Resize field"
        tabIndex={-1}
        onPointerDown={begin('resize')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
    </div>
  );
}
