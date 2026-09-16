import type { FieldKind, Placement } from '@sealmark/core';

export interface PlacedField {
  /** Stable key for React and for edit operations. Not persisted. */
  id: string;
  kind: FieldKind;
  placement: Placement;
  /** Only meaningful for `text` fields; other kinds derive their value. */
  value?: string;
}

export interface Signer {
  name: string;
  email: string;
}

/** Default box sizes in PDF points, sized for a typical signature block. */
export const DEFAULT_SIZE: Record<FieldKind, { width: number; height: number }> = {
  signature: { width: 200, height: 26 },
  initials: { width: 58, height: 26 },
  date: { width: 110, height: 18 },
  text: { width: 170, height: 18 },
};

export const FIELD_LABEL: Record<FieldKind, string> = {
  signature: 'Signature',
  initials: 'Initials',
  date: 'Date',
  text: 'Text',
};
