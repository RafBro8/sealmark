/**
 * Generates a sample agreement used by tests and manual runs.
 * Not part of the shipped app: `npx tsx scripts/make-fixture.ts`
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const BODY = [
  'This Services Agreement ("Agreement") is entered into between Good Looking',
  'Digital ("Provider") and the undersigned Client, effective as of the date of',
  'signature below.',
  '',
  '1. SCOPE OF WORK',
  'Provider will design, build and deliver a website according to the brief agreed',
  'in writing by both parties. Any work outside that brief is treated as a change',
  'request and quoted separately before it begins.',
  '',
  '2. FEES AND PAYMENT',
  'Fees are as stated in the accompanying proposal. Invoices are payable within',
  'fourteen (14) days of issue. Work may be paused on overdue accounts.',
  '',
  '3. INTELLECTUAL PROPERTY',
  'On receipt of final payment, Provider assigns to Client all right, title and',
  'interest in the delivered work, excluding third-party components which remain',
  'under their own licences.',
  '',
  '4. TERM AND TERMINATION',
  'Either party may terminate this Agreement on thirty (30) days written notice.',
  'Fees for work completed before termination remain payable.',
  '',
  '5. GOVERNING LAW',
  'This Agreement is governed by the laws of the state in which Provider is',
  'established, without regard to conflict of law principles.',
];

const doc = await PDFDocument.create();
doc.setTitle('Services Agreement');
doc.setAuthor('Good Looking Digital');
// Fixed dates keep the fixture byte-identical between runs.
doc.setCreationDate(new Date('2026-01-01T00:00:00Z'));
doc.setModificationDate(new Date('2026-01-01T00:00:00Z'));

const page = doc.addPage([612, 792]);
const regular = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const ink = rgb(0.06, 0.09, 0.16);

page.drawText('SERVICES AGREEMENT', { x: 56, y: 720, size: 16, font: bold, color: ink });

let y = 688;
for (const line of BODY) {
  if (line && line === line.toUpperCase() && /^\d\./.test(line)) {
    y -= 6;
    page.drawText(line, { x: 56, y, size: 9, font: bold, color: ink });
  } else if (line) {
    page.drawText(line, { x: 56, y, size: 9, font: regular, color: ink });
  }
  y -= 14;
}

// Signature block the CLI examples target.
page.drawText('Client signature:', { x: 56, y: 150, size: 9, font: regular, color: ink });
page.drawLine({ start: { x: 56, y: 120 }, end: { x: 300, y: 120 }, thickness: 0.75, color: ink });
page.drawText('Date:', { x: 330, y: 150, size: 9, font: regular, color: ink });
page.drawLine({ start: { x: 330, y: 120 }, end: { x: 470, y: 120 }, thickness: 0.75, color: ink });

const out = fileURLToPath(new URL('../fixtures/sample-agreement.pdf', import.meta.url));
await mkdir(fileURLToPath(new URL('../fixtures', import.meta.url)), { recursive: true });
await writeFile(out, await doc.save({ useObjectStreams: false }));
console.log(`wrote ${out}`);
