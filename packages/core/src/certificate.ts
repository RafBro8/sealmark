import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import { StandardFonts, rgb } from 'pdf-lib';
import type { AuditEvent, Signer, SourceRecord } from './types.js';
import type { StampedField } from './stamp.js';
import { formatHash } from './hash.js';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LABEL_WIDTH = 130;

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
  source?: SourceRecord;
}

interface CertFonts {
  /** Unicode-capable: everything that can contain user-supplied text. */
  regular: PDFFont;
  /** Standard font, used only for fixed ASCII headings. */
  bold: PDFFont;
  /** Standard font, used only for hex hashes. */
  mono: PDFFont;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';

  for (const word of text.split(' ')) {
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
 * Lays the certificate out top to bottom, starting a continuation page when a
 * block would cross the bottom margin. A signature with many fields, or a
 * document converted from many photos, does not fit on one page.
 */
class Layout {
  private page: PDFPage;
  private y: number;

  constructor(
    private readonly pdf: PDFDocument,
    private readonly fonts: CertFonts,
  ) {
    this.page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  /** Makes sure `space` points remain on the page, turning the page if not. */
  private ensure(space: number): void {
    if (this.y - space >= MARGIN) return;
    this.page = this.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
    this.page.drawText('Signature Certificate (continued)', {
      x: MARGIN,
      y: this.y,
      size: 10,
      font: this.fonts.bold,
      color: MUTED,
    });
    this.y -= 14;
  }

  title(text: string, subtitle: string): void {
    this.page.drawText(text, { x: MARGIN, y: this.y, size: 22, font: this.fonts.bold, color: INK });
    this.y -= 16;
    this.page.drawText(subtitle, {
      x: MARGIN,
      y: this.y,
      size: 9,
      font: this.fonts.regular,
      color: MUTED,
    });
    this.y -= 8;
  }

  heading(text: string): void {
    // A heading must not be stranded at the foot of a page without a row under it.
    this.ensure(18 + 20 + 16);
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
    const font = mono ? this.fonts.mono : this.fonts.regular;
    const size = mono ? 8 : 10;
    const lines = wrap(value, font, size, CONTENT_WIDTH - LABEL_WIDTH);

    this.ensure(lines.length * (size + 3) + 5);

    this.page.drawText(label, {
      x: MARGIN,
      y: this.y,
      size: 9,
      font: this.fonts.regular,
      color: MUTED,
    });
    for (const line of lines) {
      this.page.drawText(line, { x: MARGIN + LABEL_WIDTH, y: this.y, size, font, color: INK });
      this.y -= size + 3;
    }
    this.y -= mono ? 4 : 5;
  }

  gap(amount: number): void {
    this.y -= amount;
  }

  note(text: string): void {
    const lines = wrap(text, this.fonts.regular, 8, CONTENT_WIDTH);
    this.ensure(lines.length * 11);
    for (const line of lines) {
      this.page.drawText(line, { x: MARGIN, y: this.y, size: 8, font: this.fonts.regular, color: MUTED });
      this.y -= 11;
    }
  }
}

function sourceHeading(source: SourceRecord): string {
  const plural = source.files.length === 1 ? 'file' : 'files';
  return source.relation === 'converted'
    ? `Source ${plural} (converted to PDF by Sealmark)`
    : `Source ${plural} (declared by the signer)`;
}

/**
 * Appends the human-readable signature certificate.
 *
 * This page deliberately records the hash of the *original* document, not of
 * the finished file: a page cannot contain the hash of a document it is part
 * of. The signed document's own hash lives in the accompanying record file,
 * which is what `verifyDocument` checks against.
 *
 * `textFont` must be the embedded Unicode font — names, filenames and field
 * values all pass through it.
 */
export async function appendCertificate(
  pdf: PDFDocument,
  textFont: PDFFont,
  data: CertificateData,
): Promise<void> {
  const fonts: CertFonts = {
    regular: textFont,
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.Courier),
  };

  const layout = new Layout(pdf, fonts);
  layout.title('Signature Certificate', `Sealmark  ·  record ${data.recordId}`);

  if (data.source) {
    layout.heading(sourceHeading(data.source));
    for (const file of data.source.files) {
      layout.row('File', file.name);
      layout.row('SHA-256', formatHash(file.sha256), true);
    }
  }

  layout.heading('Document');
  layout.row('File name', data.documentName);
  layout.row('Original SHA-256', formatHash(data.originalHash), true);

  layout.heading('Signer');
  layout.row('Name', data.signer.name);
  if (data.signer.email) layout.row('Email', data.signer.email);
  layout.row('Signed at (UTC)', data.signedAt);

  layout.heading(`Fields applied (${data.fields.length})`);
  for (const field of data.fields) {
    layout.row(`${field.kind} · p${field.page + 1}`, field.value);
  }

  layout.heading(`Audit trail (${data.events.length} events at time of sealing)`);
  for (const event of data.events) {
    layout.row(event.at.replace('T', ' ').replace('Z', ''), `${event.type} — ${event.detail}`);
  }

  if (data.source?.relation === 'declared') {
    layout.gap(10);
    layout.note(
      'The source file above was named by the signer as the original of this PDF, which was exported outside Sealmark. Its fingerprint is recorded so the original can be matched later, but Sealmark did not perform that conversion and does not attest to it.',
    );
  }

  layout.gap(10);
  layout.note(
    `This certificate records the document as it was received and signed. Events that occur after this certificate is built — appending it, and sealing the file — are recorded in ${data.recordFileName}, which also holds the SHA-256 of the finished document. Verify the signed file against that record: any change to a single byte produces a different hash and fails verification.`,
  );
}
