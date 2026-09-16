import type { FieldKind, FieldSpec } from '@sealmark/core';

const KINDS: readonly FieldKind[] = ['signature', 'initials', 'date', 'text'];

export const FIELD_SYNTAX =
  'kind:page:x,y,width,height[:value]  e.g. signature:1:72,120,220,56';

/**
 * Parses the `--field` shorthand.
 *
 * Pages are 1-based here because that is how a person reads a PDF; the core
 * works in 0-based indices, so the conversion happens at this boundary.
 */
export function parseField(input: string): FieldSpec {
  const parts = input.split(':');
  if (parts.length < 3) {
    throw new Error(`Malformed field "${input}". Expected ${FIELD_SYNTAX}`);
  }

  const [kindRaw, pageRaw, boxRaw, ...rest] = parts;
  const kind = kindRaw!.trim().toLowerCase() as FieldKind;

  if (!KINDS.includes(kind)) {
    throw new Error(`Unknown field kind "${kindRaw}". Expected one of: ${KINDS.join(', ')}`);
  }

  const page = Number(pageRaw);
  if (!Number.isInteger(page) || page < 1) {
    throw new Error(`Field "${input}" has an invalid page "${pageRaw}". Pages start at 1.`);
  }

  const box = boxRaw!.split(',').map((n) => Number(n.trim()));
  if (box.length !== 4 || box.some((n) => !Number.isFinite(n))) {
    throw new Error(`Field "${input}" needs four numbers: x,y,width,height`);
  }
  const [x, y, width, height] = box as [number, number, number, number];

  // A value may itself contain colons (a URL, a time), so rejoin the remainder.
  const value = rest.length > 0 ? rest.join(':') : undefined;

  if (kind === 'text' && !value) {
    throw new Error(`A text field needs a value: text:${page}:${boxRaw}:Your text here`);
  }

  return {
    kind,
    placement: { page: page - 1, x, y, width, height },
    ...(value !== undefined ? { value } : {}),
  };
}
