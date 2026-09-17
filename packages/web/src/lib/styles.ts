import {
  DEFAULT_SIGNATURE_STYLE,
  isSignatureStyleId,
  signatureStyle,
  type SignatureStyleId,
} from '@sealmark/core';
import { fetchFont } from './font.js';
// Vite needs each asset as a static import; the core lists which file is which.
import classicUrl from '../../../core/assets/GreatVibes-Regular.ttf?url';
import gracefulUrl from '../../../core/assets/Parisienne-Regular.ttf?url';
import relaxedUrl from '../../../core/assets/Sacramento-Regular.ttf?url';
import boldUrl from '../../../core/assets/Yellowtail-Regular.ttf?url';
import quillUrl from '../../../core/assets/Meddon.ttf?url';

export const STYLE_FONT_URLS: Record<SignatureStyleId, string> = {
  classic: classicUrl,
  graceful: gracefulUrl,
  relaxed: relaxedUrl,
  bold: boldUrl,
  quill: quillUrl,
};

/** CSS font-family name a style is registered under. */
export function familyFor(id: SignatureStyleId): string {
  return `Sealmark ${id}`;
}

const bytes = new Map<SignatureStyleId, Promise<Uint8Array>>();
const faces = new Map<SignatureStyleId, Promise<void>>();

/** The style's font file, fetched once and shared by the preview and by signing. */
export function styleFontBytes(id: SignatureStyleId): Promise<Uint8Array> {
  let pending = bytes.get(id);
  if (!pending) {
    pending = fetchFont(STYLE_FONT_URLS[id], `${signatureStyle(id).label} signature`);
    bytes.set(id, pending);
  }
  return pending;
}

/**
 * Registers the style for on-screen rendering from the same bytes that get
 * stamped, so what the signer previews is exactly the face in the PDF.
 */
export function ensureStyleFace(id: SignatureStyleId): Promise<void> {
  let pending = faces.get(id);
  if (!pending) {
    pending = styleFontBytes(id).then(async (data) => {
      // FontFace takes a buffer; copy so the cached bytes are never detached.
      const face = new FontFace(familyFor(id), data.slice().buffer);
      await face.load();
      document.fonts.add(face);
    });
    faces.set(id, pending);
  }
  return pending;
}

const STORAGE_KEY = 'sealmark-signature-style';

/** The style this browser last signed with. A convenience, so failures are ignored. */
export function savedStyle(): SignatureStyleId {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isSignatureStyleId(value) ? value : DEFAULT_SIGNATURE_STYLE;
  } catch {
    return DEFAULT_SIGNATURE_STYLE;
  }
}

export function saveStyle(id: SignatureStyleId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Not remembered next visit; the choice still applies now.
  }
}
