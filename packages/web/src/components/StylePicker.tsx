import { useEffect, useState } from 'react';
import { SIGNATURE_STYLES, type SignatureStyleId } from '@sealmark/core/light';
import { ensureStyleFace, familyFor, styleFontBytes } from '../lib/styles.js';
import { fitTextSize } from '../lib/font.js';

/** Sample area inside each option, in CSS pixels. Matches .style-sample in the stylesheet. */
const SAMPLE_WIDTH = 188;
const SAMPLE_HEIGHT = 40;

interface StylePickerProps {
  name: string;
  value: SignatureStyleId;
  onChange: (id: SignatureStyleId) => void;
}

/**
 * Shows the signer's own name in every style, so the choice is made by looking
 * at their signature rather than at a font name.
 */
export function StylePicker({ name, value, onChange }: StylePickerProps) {
  const [loaded, setLoaded] = useState<Partial<Record<SignatureStyleId, Uint8Array>>>({});
  // The glyph check needs a font parser, so it arrives with the fonts rather than the page.
  const [missingGlyphs, setMissingGlyphs] = useState<((font: Uint8Array, text: string) => string[]) | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import('@sealmark/core/coverage')
      .then((module) => {
        if (!cancelled) setMissingGlyphs(() => module.missingGlyphs);
      })
      .catch(() => undefined);
    for (const style of SIGNATURE_STYLES) {
      void Promise.all([styleFontBytes(style.id), ensureStyleFace(style.id)])
        .then(([bytes]) => {
          if (!cancelled) setLoaded((current) => ({ ...current, [style.id]: bytes }));
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const sample = name.trim() || 'Your name';

  return (
    <fieldset className="style-picker">
      <legend className="panel-title">Signature style</legend>

      {SIGNATURE_STYLES.map((style) => {
        const bytes = loaded[style.id];
        const missing = bytes && missingGlyphs && name.trim() ? missingGlyphs(bytes, name) : [];
        const unavailable = missing.length > 0;
        const family = familyFor(style.id);
        const size = bytes ? fitTextSize(sample, family, SAMPLE_WIDTH, SAMPLE_HEIGHT, 32) : 22;

        return (
          <label
            key={style.id}
            className={`style-option${value === style.id ? ' is-selected' : ''}${unavailable ? ' is-unavailable' : ''}`}
            title={unavailable ? `${style.label} cannot write ${missing.join(' ')}` : style.description}
          >
            <input
              type="radio"
              name="signature-style"
              value={style.id}
              checked={value === style.id}
              disabled={unavailable}
              onChange={() => onChange(style.id)}
            />
            <span
              className={`style-sample${bytes ? '' : ' is-loading'}${name.trim() ? '' : ' is-placeholder'}`}
              style={{ fontFamily: `"${family}", cursive`, fontSize: `${size}px` }}
              aria-hidden
            >
              {sample}
            </span>
            <span className="style-label">
              {style.label}
              <small>{unavailable ? `Can't write ${missing.join(' ')}` : style.description}</small>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
