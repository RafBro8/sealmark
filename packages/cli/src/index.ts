#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import {
  signDocument,
  verifyDocument,
  verifyOriginal,
  parseAuditRecord,
  recordFileNameFor,
  formatHash,
  type AuditRecord,
  type FieldSpec,
} from '@sealmark/core';
import { parseField, FIELD_SYNTAX } from './fields.js';
import { dim, bold, green, red } from './term.js';

const DEFAULT_FONT = fileURLToPath(
  new URL('../../core/assets/GreatVibes-Regular.ttf', import.meta.url),
);

function fail(message: string): never {
  console.error(`${red('error')}  ${message}`);
  process.exit(1);
}

async function read(path: string, label: string): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch {
    return fail(`Cannot read ${label} "${path}".`);
  }
}

async function loadRecord(path: string): Promise<AuditRecord> {
  const raw = await read(path, 'record');
  try {
    return parseAuditRecord(JSON.parse(raw.toString('utf8')));
  } catch (error) {
    return fail(`Invalid audit record "${path}": ${(error as Error).message}`);
  }
}

const program = new Command();

program
  .name('sealmark')
  .description('Tamper-evident electronic signatures for PDF documents.')
  .version('0.1.0');

program
  .command('sign')
  .description('Stamp signature fields onto a PDF and seal it with an audit record.')
  .argument('<input>', 'path to the PDF to sign')
  .requiredOption('-n, --name <name>', 'signer name, rendered as the signature')
  .option('-e, --email <email>', 'signer email, recorded in the audit trail')
  .option('-f, --field <spec...>', `field placement, repeatable. ${FIELD_SYNTAX}`)
  .option('-o, --out <path>', 'output path for the signed PDF')
  .option('--font <path>', 'TrueType/OpenType font for signature rendering', DEFAULT_FONT)
  .option('--no-certificate', 'omit the appended signature certificate page')
  .action(async (input: string, opts) => {
    const specs: string[] = opts.field ?? [];
    if (specs.length === 0) {
      fail(`At least one --field is required.  ${FIELD_SYNTAX}`);
    }

    let fields: FieldSpec[];
    try {
      fields = specs.map(parseField);
    } catch (error) {
      return fail((error as Error).message);
    }

    const document = await read(input, 'document');
    const scriptFont = await read(opts.font, 'font');

    const result = await signDocument({
      document: new Uint8Array(document),
      documentName: basename(input),
      signer: { name: opts.name, ...(opts.email ? { email: opts.email } : {}) },
      fields,
      scriptFont: new Uint8Array(scriptFont),
      appendCertificate: opts.certificate !== false,
    }).catch((error: Error) => fail(error.message));

    const outPdf = opts.out ?? join(dirname(input), `${basename(input, '.pdf')}.signed.pdf`);
    const outRecord = join(dirname(outPdf), recordFileNameFor(basename(outPdf)));

    await mkdir(dirname(outPdf), { recursive: true });
    await writeFile(outPdf, result.pdf);
    await writeFile(outRecord, `${JSON.stringify(result.audit, null, 2)}\n`);

    console.log(`${green('sealed')}  ${bold(outPdf)}`);
    console.log(`${dim('record')}  ${outRecord}`);
    console.log(`${dim('id')}      ${result.audit.recordId}`);
    console.log(`${dim('sha256')}  ${formatHash(result.audit.signedHash)}`);
    console.log();
    console.log(dim('Keep the record file. It is what proves the document has not changed.'));
  });

program
  .command('verify')
  .description('Check a signed PDF against its audit record.')
  .argument('<document>', 'path to the signed PDF')
  .argument('[record]', 'path to the .sealmark.json record (inferred when omitted)')
  .option('--original <path>', 'also confirm this file is the document that was signed')
  .action(async (documentPath: string, recordPath: string | undefined, opts) => {
    const resolved =
      recordPath ?? join(dirname(documentPath), recordFileNameFor(basename(documentPath)));

    const pdf = await read(documentPath, 'document');
    const record = await loadRecord(resolved);
    const result = await verifyDocument(new Uint8Array(pdf), record);

    console.log(
      result.intact
        ? `${green('verified')}  ${bold(documentPath)}`
        : `${red('TAMPERED')}  ${bold(documentPath)}`,
    );
    for (const message of result.messages) console.log(`          ${message}`);
    console.log();
    console.log(`${dim('expected')}  ${formatHash(result.expectedHash)}`);
    console.log(`${dim('actual')}    ${formatHash(result.actualHash)}`);

    if (opts.original) {
      const original = await read(opts.original, 'original');
      const matches = await verifyOriginal(new Uint8Array(original), record);
      console.log();
      console.log(
        matches
          ? `${green('origin')}    ${opts.original} is the document that was signed.`
          : `${red('origin')}    ${opts.original} is NOT the document that was signed.`,
      );
      if (!matches) process.exitCode = 2;
    }

    if (!result.intact) process.exit(2);
  });

program
  .command('inspect')
  .description('Print an audit record in readable form.')
  .argument('<record>', 'path to a .sealmark.json record')
  .action(async (recordPath: string) => {
    const record = await loadRecord(recordPath);
    const email = record.signer.email ? ` <${record.signer.email}>` : '';

    console.log(`${bold(record.documentName)}  ${dim(record.recordId)}`);
    console.log(`${dim('signer')}    ${record.signer.name}${email}`);
    console.log(`${dim('signed')}    ${record.signedAt}`);
    console.log(`${dim('original')}  ${formatHash(record.originalHash)}`);
    console.log(`${dim('sealed')}    ${formatHash(record.signedHash)}`);
    console.log();
    console.log(bold('fields'));
    for (const field of record.fields) {
      console.log(`  ${dim(`p${field.page + 1}`)}  ${field.kind.padEnd(10)}  ${field.value}`);
    }
    console.log();
    console.log(bold('audit trail'));
    for (const event of record.events) {
      console.log(`  ${dim(event.at)}  ${event.type}`);
      console.log(`  ${' '.repeat(20)}  ${event.detail}`);
    }
  });

program.parseAsync().catch((error: Error) => fail(error.message));
