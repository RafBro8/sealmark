import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import { StandardFonts, rgb } from 'pdf-lib';
import type { AuditEvent, Signer } from './types.js';
import type { StampedField } from './stamp.js';
import { formatHash } from './hash.js';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.85, 0.87, 0.9);

export interface CertificateData {
  recordId: string;
  documentName: string;
  signer: Signer;
  signedAt: string;
  originalHash: string;
  fields: StampedField[];
  events: AuditEvent[];
  recordFileName: string;
}

interface CertFonts {
  regular: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
}

/** Tracks the vertical cursor so sections can be appended in order. */
class Cursor {
  constructor(
    private readonly page: PDFPage,
    private readonly fonts: CertFonts,
    public y: number,
  ) {}

  gap(amount: number): void {
    this.y -= amount;
  }

  heading(text: string): void {
    this.y -= 18;
    this.page.drawText(text.toUpperCase(), {
      x: MARGIN,
      y: this.y,
      size: 8,
      font: this.fonts.bold,
      color: MUTED,
    });
    this.y -= 6;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: MARGIN + CONTENT_WIDTH, y: this.y },
      thickness: 0.5,
      color: RULE,
    });
    this.y -= 14;
  }

  /** Label on the left, value on the right. `mono` for hashes and ids. */
  row(label: string, value: string, mono = false): void {
    const labelWidth = 130;
    this.page.drawText(label, {
      x: MARGIN,
      y: this.y,
      size: 9,
      font: this.fonts.regular,
      color: MUTED,
    });

    const font = mono ? this.fonts.mono : this.fonts.regular;
    const size = mono ? 8 : 10;
    const maxWidth = CONTENT_WIDTH - labelWidth;

    // Hashes are long; wrap rather than run off the page edge.
    for (const line of wrap(value, font, size, maxWidth)) {
      this.page.drawText(line, {
        x: MARGIN + labelWidth,
        y: this.y,
        size,
        font,
        color: INK,
      });
      this.y -= size + 3;
    }
    this.y -= mono ? 4 : 5;
  }

  note(text: string): void {
    for (const line of wrap(text, this.fonts.regular, 8, CONTENT_WIDTH)) {
      this.page.drawText(line, { x: MARGIN, y: this.y, size: 8, font: this.fonts.regular, color: MUTED });
      this.y -= 11;
    }
  }
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
}

/**
 * Appends the human-readable signature certificate.
 *
 * This page deliberately records the hash of the *original* document, not of
 * the finished file: a page cannot contain the hash of a document it is part
 * of. The signed document's own hash lives in the accompanying record file,
 * which is what `verifyDocument` checks against.
 */
export async function appendCertificate(pdf: PDFDocument, data: CertificateData): Promise<void> {
  const fonts: CertFonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.Courier),
  };

  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const cursor = new Cursor(page, fonts, PAGE_HEIGHT - MARGIN);

  page.drawText('Signature Certificate', {
    x: MARGIN,
    y: cursor.y,
    size: 22,
    font: fonts.bold,
    color: INK,
  });
  cursor.gap(16);
  page.drawText(`Sealmark  ·  record ${data.recordId}`, {
    x: MARGIN,
    y: cursor.y,
    size: 9,
    font: fonts.regular,
    color: MUTED,
  });
  cursor.gap(8);

  cursor.heading('Document');
  cursor.row('File name', data.documentName);
  cursor.row('Original SHA-256', formatHash(data.originalHash), true);

  cursor.heading('Signer');
  cursor.row('Name', data.signer.name);
  if (data.signer.email) cursor.row('Email', data.signer.email);
  cursor.row('Signed at (UTC)', data.signedAt);

  cursor.heading(`Fields applied (${data.fields.length})`);
  for (const field of data.fields) {
    cursor.row(`${field.kind} · p${field.page + 1}`, field.value);
  }

  cursor.heading(`Audit trail (${data.events.length} events at time of sealing)`);
  for (const event of data.events) {
    cursor.row(event.at.replace('T', ' ').replace('Z', ''), `${event.type} — ${event.detail}`);
  }

  cursor.gap(10);
  cursor.note(
    `This certificate records the document as it was received and signed. Events that occur after this page is built — appending it, and sealing the file — are recorded in ${data.recordFileName}, which also holds the SHA-256 of the finished document. Verify the signed file against that record: any change to a single byte produces a different hash and fails verification.`,
  );
}
