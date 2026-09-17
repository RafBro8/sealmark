import { naturalCompare, sniffImageType } from './sniff.js';

/**
 * Decides what to do with files someone hands over. Shared by the browser app
 * and the CLI so both accept exactly the same things and say no the same way.
 */

export type InputKind = 'pdf' | 'image' | 'text' | 'office' | 'unsupported';

const EXTENSION_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  txt: 'text/plain',
  text: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  pages: 'application/vnd.apple.pages',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  numbers: 'application/vnd.apple.numbers',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odp: 'application/vnd.oasis.opendocument.presentation',
  key: 'application/vnd.apple.keynote',
};

const OFFICE_EXTENSIONS = new Set([
  'doc', 'docx', 'odt', 'rtf', 'pages',
  'xls', 'xlsx', 'ods', 'numbers',
  'ppt', 'pptx', 'odp', 'key',
]);

export function extensionOf(name: string): string {
  const match = /\.([^./\\]+)$/.exec(name);
  return match ? match[1]!.toLowerCase() : '';
}

/** Best-effort media type from a filename, for the audit record. */
export function mediaTypeFor(name: string, reported = ''): string {
  return reported || EXTENSION_TYPES[extensionOf(name)] || 'application/octet-stream';
}

export interface IntakeFile {
  name: string;
  /** MIME type as reported by the browser or OS, if any. */
  mediaType?: string;
  /** The first bytes of the file. Content beats the filename where it can decide. */
  head: Uint8Array;
}

export function detectKind({ name, mediaType = '', head }: IntakeFile): InputKind {
  // Content first: a PDF renamed to .txt is still a PDF.
  if (new TextDecoder().decode(head.subarray(0, 5)) === '%PDF-') return 'pdf';
  if (sniffImageType(head)) return 'image';

  const extension = extensionOf(name);
  if (OFFICE_EXTENSIONS.has(extension)) return 'office';
  if (mediaType.startsWith('image/') || EXTENSION_TYPES[extension]?.startsWith('image/')) return 'image';
  if (extension === 'pdf' || mediaType === 'application/pdf') return 'unsupported'; // claims PDF, is not
  if (mediaType === 'text/plain' || mediaType === 'text/markdown' || ['txt', 'text', 'md', 'markdown'].includes(extension)) {
    return 'text';
  }
  return 'unsupported';
}

export type IntakePlan<T extends IntakeFile> =
  | { kind: 'pdf'; file: T }
  | { kind: 'images'; files: T[] }
  | { kind: 'text'; file: T }
  | { kind: 'office'; file: T }
  | { kind: 'rejected'; reason: string };

/**
 * Accepts one PDF, one text file, one office document, or any number of
 * images. Images are ordered by filename so that `page-2.jpg` precedes
 * `page-10.jpg`, which is how phone and scanner filenames number pages.
 */
export function planIntake<T extends IntakeFile>(files: T[]): IntakePlan<T> {
  if (files.length === 0) return { kind: 'rejected', reason: 'No file was chosen.' };

  const kinds = files.map((file) => detectKind(file));
  const unsupported = files.find((_, index) => kinds[index] === 'unsupported');
  if (unsupported) {
    return {
      kind: 'rejected',
      reason: `${unsupported.name} is not a format Sealmark can open. Use a PDF, a photo, or a plain text file.`,
    };
  }

  if (kinds.every((kind) => kind === 'image')) {
    return { kind: 'images', files: [...files].sort((a, b) => naturalCompare(a.name, b.name)) };
  }

  if (files.length > 1) {
    return {
      kind: 'rejected',
      reason: 'Choose one PDF or text file, or several photos of the same document.',
    };
  }

  const [file] = files as [T];
  switch (kinds[0]) {
    case 'pdf':
      return { kind: 'pdf', file };
    case 'text':
      return { kind: 'text', file };
    case 'office':
      return { kind: 'office', file };
    default:
      return { kind: 'rejected', reason: `${file.name} is not a format Sealmark can open.` };
  }
}
