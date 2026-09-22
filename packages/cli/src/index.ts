#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command, Option } from 'commander';
import {
  signDocument,
  verifyDocument,
  verifyOriginal,
  matchSourceFile,
  reproduceConversion,
  parseAuditRecord,
  recordFileNameFor,
  formatHash,
  formatBytes,
  imagesToPdf,
  textToPdf,
  sniffImageType,
  planIntake,
  mediaTypeFor,
  SIGNATURE_STYLES,
  DEFAULT_SIGNATURE_STYLE,
  signatureStyle,
  obtainTimestamp,
  attachTimestamp,
  checkRecordTimestamp,
  describeDuration,
  TIMESTAMP_ENDPOINT,
  type AuditRecord,
  type RecordTimestampCheck,
  type FieldSpec,
  type PageSize,
  type SourceInput,
} from '@sealmark/core';
import { parseField, FIELD_SYNTAX } from './fields.js';
import { dim, bold, green, red, yellow } from './term.js';

const asset = (name: string) => fileURLToPath(new URL(`../../core/assets/${name}`, import.meta.url));
const DEFAULT_TEXT_FONT = asset('Lato-Regular.ttf');

function fail(message: string): never {
  console.error(`${red('error')}  ${message}`);
  process.exit(1);
}

async function read(path: string, label: string): Promise<Uint8Array> {
  try {
    return new Uint8Array(await readFile(path));
  } catch {
    return fail(`Cannot read ${label} "${path}".`);
  }
}

async function loadRecord(path: string): Promise<AuditRecord> {
  const raw = await read(path, 'record');
  try {
    return parseAuditRecord(JSON.parse(new TextDecoder().decode(raw)));
  } catch (error) {
    return fail(`Invalid audit record "${path}": ${(error as Error).message}`);
  }
}

interface Prepared {
  pdf: Uint8Array;
  documentName: string;
  source?: SourceInput;
  /** Path the default output name is derived from. */
  stemFrom: string;
}

/**
 * Turns whatever was passed on the command line into a PDF ready to sign,
 * converting photos and text files and recording where the PDF came from.
 */
async function prepare(paths: string[], pageSize: PageSize, textFontPath: string): Promise<Prepared> {
  const loaded = await Promise.all(
    paths.map(async (path) => {
      const bytes = await read(path, 'input');
      return { path, name: basename(path), mediaType: mediaTypeFor(basename(path)), head: bytes.subarray(0, 16), bytes };
    }),
  );

  const plan = planIntake(loaded);
  const stem = (path: string) => basename(path, extname(path));

  switch (plan.kind) {
    case 'rejected':
      return fail(plan.reason);

    case 'pdf':
      return { pdf: plan.file.bytes, documentName: plan.file.name, stemFrom: plan.file.path };

    case 'office':
      return fail(
        [
          `${plan.file.name} needs exporting to PDF first - Sealmark does not convert office documents,`,
          '       because no converter it could run on your machine reproduces the layout faithfully.',
          '       Export it from the app that made it (Word: File > Save As > PDF), then sign the PDF and',
          '       record the original alongside it:',
          '',
          `         sealmark sign ${join(dirname(plan.file.path), `${stem(plan.file.path)}.pdf`)} --declared-source ${plan.file.path} ...`,
        ].join('\n'),
      );

    case 'images': {
      const notReady = plan.files.find((file) => !sniffImageType(file.bytes));
      if (notReady) {
        return fail(
          `${notReady.name} is not a JPEG or PNG. The browser app converts other image formats; on the command line, save it as JPEG or PNG first.`,
        );
      }
      const [first] = plan.files as [(typeof plan.files)[number]];
      return {
        pdf: await imagesToPdf(plan.files.map((file) => file.bytes), { pageSize }),
        documentName: `${stem(first.path)}.pdf`,
        source: {
          relation: 'converted',
          method: 'image-to-pdf',
          pageSize,
          files: plan.files.map(({ name, mediaType, bytes }) => ({ name, mediaType, bytes })),
        },
        stemFrom: first.path,
      };
    }

    case 'text': {
      const textFont = await read(textFontPath, 'text font');
      const { name, mediaType, bytes, path } = plan.file;
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        return fail(`${name} is not UTF-8 text. Re-save it as UTF-8 and try again.`);
      }
      const pdf = await textToPdf(text, textFont, { pageSize }).catch((error: Error) => fail(error.message));
      return {
        pdf,
        documentName: `${stem(path)}.pdf`,
        source: { relation: 'converted', method: 'text-to-pdf', pageSize, files: [{ name, mediaType, bytes }] },
        stemFrom: path,
      };
    }
  }
}

function printTimestamp(check: RecordTimestampCheck): void {
  if (!check.present) {
    console.log(`${dim('time')}      No trusted timestamp. The signing time comes from the signer's own device.`);
    return;
  }
  if (!check.valid) {
    console.log(`${red('time')}      The record's timestamp is not valid: ${check.detail}`);
    process.exitCode = 2;
    return;
  }
  console.log(`${green('time')}      ${check.authority} confirms the signed PDF existed at ${check.time.toISOString()}.`);
  if (check.timeDisagrees) {
    const direction = (check.driftMs ?? 0) < 0 ? 'earlier' : 'later';
    console.log(`${yellow('time')}      But the record claims it was signed ${describeDuration(check.driftMs ?? 0)} ${direction}. Trust the timestamp, not the record's own time.`);
    process.exitCode = 2;
  }
}

const program = new Command();

program
  .name('sealmark')
  .description('Tamper-evident electronic signatures for PDFs, photos and text documents.')
  .version('0.2.0');

program
  .command('sign')
  .description('Stamp signature fields onto a document and seal it with an audit record.')
  .argument('<inputs...>', 'a PDF, a plain text file, or one or more photos (JPEG/PNG) of the pages')
  .requiredOption('-n, --name <name>', 'signer name, rendered as the signature')
  .option('-e, --email <email>', 'signer email, recorded in the audit trail')
  .option('-f, --field <spec...>', `field placement, repeatable. ${FIELD_SYNTAX}`)
  .option('-o, --out <path>', 'output path for the signed PDF')
  .addOption(
    new Option('--page-size <size>', 'page size when converting photos or text')
      .choices(['letter', 'a4'])
      .default('letter'),
  )
  .option(
    '--declared-source <path>',
    'the original a PDF was exported from (e.g. a .docx); its fingerprint is recorded as declared by the signer',
  )
  .addOption(
    new Option('--style <style>', `signature style: ${SIGNATURE_STYLES.map((s) => `${s.id} (${s.description.toLowerCase()})`).join(', ')}`)
      .choices(SIGNATURE_STYLES.map((s) => s.id))
      .default(DEFAULT_SIGNATURE_STYLE),
  )
  .option('--font <path>', 'custom font for signature and initials, instead of a --style')
  .option('--text-font <path>', 'font for dates, text fields, converted text and the certificate', DEFAULT_TEXT_FONT)
  .option('--no-certificate', 'omit the appended signature certificate page')
  .option('--timestamp', `add a trusted timestamp; sends only the signed PDF's SHA-256 to ${TIMESTAMP_ENDPOINT}`)
  .action(async (inputs: string[], opts) => {
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

    const prepared = await prepare(inputs, opts.pageSize as PageSize, opts.textFont);

    let source = prepared.source;
    if (opts.declaredSource) {
      if (source) fail('--declared-source applies only when signing a PDF you exported yourself.');
      const bytes = await read(opts.declaredSource, 'declared source');
      const name = basename(opts.declaredSource);
      source = { relation: 'declared', method: 'exported-by-signer', files: [{ name, mediaType: mediaTypeFor(name), bytes }] };
    }

    const [scriptFont, textFont] = await Promise.all([
      read(opts.font ?? asset(signatureStyle(opts.style).file), 'font'),
      read(opts.textFont, 'text font'),
    ]);

    const result = await signDocument({
      document: prepared.pdf,
      documentName: prepared.documentName,
      signer: { name: opts.name, ...(opts.email ? { email: opts.email } : {}) },
      fields,
      scriptFont,
      // A custom font is not one of the styles, so the record does not claim one.
      ...(opts.font ? {} : { signatureStyle: opts.style }),
      textFont,
      ...(source ? { source } : {}),
      appendCertificate: opts.certificate !== false,
    }).catch((error: Error) => fail(error.message));

    const stemFrom = prepared.stemFrom;
    const outPdf =
      opts.out ?? join(dirname(stemFrom), `${basename(stemFrom, extname(stemFrom))}.signed.pdf`);
    const outRecord = join(dirname(outPdf), recordFileNameFor(basename(outPdf)));

    let audit = result.audit;
    let timestampError: string | undefined;
    if (opts.timestamp) {
      try {
        audit = attachTimestamp(audit, await obtainTimestamp(audit.signedHash, { fetch: globalThis.fetch }));
      } catch (error) {
        timestampError = (error as Error).message;
      }
    }

    await mkdir(dirname(outPdf), { recursive: true });
    await writeFile(outPdf, result.pdf);
    await writeFile(outRecord, `${JSON.stringify(audit, null, 2)}\n`);

    if (result.audit.source) {
      const { relation, files } = result.audit.source;
      const label = relation === 'converted' ? 'from' : 'original';
      for (const file of files) {
        console.log(`${dim(label.padEnd(8))}  ${file.name}  ${dim(formatBytes(file.size))}`);
      }
    }
    console.log(`${green('sealed')}  ${bold(outPdf)}`);
    console.log(`${dim('record')}  ${outRecord}`);
    console.log(`${dim('id')}      ${result.audit.recordId}`);
    console.log(`${dim('sha256')}  ${formatHash(result.audit.signedHash)}`);
    if (result.audit.signatureStyle) {
      console.log(`${dim('style')}   ${signatureStyle(result.audit.signatureStyle).label}`);
    }
    if (audit.timestamp) {
      console.log(`${green('time')}    ${audit.timestamp.time} ${dim(`by ${audit.timestamp.authority}`)}`);
    } else if (timestampError) {
      console.log(`${yellow('time')}    Not timestamped: ${timestampError}`);
      console.log(dim(`        Add one later with: sealmark timestamp ${outRecord}`));
    }
    console.log();
    console.log(dim('Keep the record file. It is what proves the document has not changed.'));
  });

program
  .command('verify')
  .description('Check a signed PDF against its audit record.')
  .argument('<document>', 'path to the signed PDF')
  .argument('[record]', 'path to the .sealmark.json record (inferred when omitted)')
  .option('--original <path>', 'also confirm this PDF is the document that was signed')
  .option('--source <paths...>', 'also confirm these files are the ones the PDF was made from, and repeat the conversion')
  .option('--text-font <path>', 'text font, needed to repeat a text conversion', DEFAULT_TEXT_FONT)
  .action(async (documentPath: string, recordPath: string | undefined, opts) => {
    const resolved =
      recordPath ?? join(dirname(documentPath), recordFileNameFor(basename(documentPath)));

    const pdf = await read(documentPath, 'document');
    const record = await loadRecord(resolved);
    const result = await verifyDocument(pdf, record);

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
      const matches = await verifyOriginal(await read(opts.original, 'original'), record);
      console.log();
      console.log(
        matches
          ? `${green('origin')}    ${opts.original} is the document that was signed.`
          : `${red('origin')}    ${opts.original} is NOT the document that was signed.`,
      );
      if (!matches) process.exitCode = 2;
    }

    if (opts.source) {
      console.log();
      if (!record.source) {
        console.log(`${red('source')}    This record lists no source files.`);
        process.exitCode = 2;
      }
      for (const path of (opts.source as string[])) {
        if (!record.source) break;
        const match = await matchSourceFile(await read(path, 'source'), record);
        if (!match) {
          console.log(`${red('source')}    ${path} does not match any source file in the record.`);
          process.exitCode = 2;
        } else if (record.source.relation === 'declared') {
          console.log(`${yellow('source')}    ${path} matches ${match.name}, declared by the signer as the original.`);
        } else {
          console.log(`${green('source')}    ${path} matches ${match.name}, which this PDF was converted from.`);
        }
      }
    }

    if (opts.source && record.source?.relation === 'converted') {
      const provided = await Promise.all((opts.source as string[]).map((p) => read(p, 'source')));
      try {
        const textFont = record.source.method === 'text-to-pdf' ? await read(opts.textFont, 'text font') : undefined;
        const outcome = await reproduceConversion(record, provided, textFont);
        console.log(
          outcome.reproduced
            ? `${green('rebuilt')}   Converting these files again produces exactly the PDF that was signed.`
            : `${red('rebuilt')}   Converting these files again does NOT produce the PDF that was signed.`,
        );
        if (!outcome.reproduced) process.exitCode = 2;
      } catch (error) {
        console.log(`${dim('rebuilt')}   Skipped: ${(error as Error).message}`);
      }
    }

    console.log();
    printTimestamp(await checkRecordTimestamp(record));

    if (!result.intact) process.exit(2);
  });

program
  .command('timestamp')
  .description(`Add a trusted timestamp to an existing record. Sends only the signed PDF's SHA-256 to ${TIMESTAMP_ENDPOINT}.`)
  .argument('<record>', 'path to the .sealmark.json record')
  .action(async (recordPath: string) => {
    const record = await loadRecord(recordPath);
    if (record.timestamp) fail(`${recordPath} already has a timestamp from ${record.timestamp.time}.`);
    let stamped: AuditRecord;
    try {
      stamped = attachTimestamp(record, await obtainTimestamp(record.signedHash, { fetch: globalThis.fetch }));
    } catch (error) {
      return fail((error as Error).message);
    }
    await writeFile(recordPath, `${JSON.stringify(stamped, null, 2)}\n`);
    console.log(`${green('timestamped')}  ${stamped.timestamp!.time} ${dim(`by ${stamped.timestamp!.authority}`)}`);
    console.log(dim('Added after signing, so it proves the signed PDF existed by then, not the moment it was signed.'));
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
    if (record.signatureStyle) console.log(`${dim('style')}     ${signatureStyle(record.signatureStyle).label}`);
    if (record.timestamp) console.log(`${dim('timestamp')} ${record.timestamp.time} ${dim(`by ${record.timestamp.authority}`)}`);
    console.log(`${dim('signed')}    ${record.signedAt}`);
    console.log(`${dim('original')}  ${formatHash(record.originalHash)}`);
    console.log(`${dim('sealed')}    ${formatHash(record.signedHash)}`);

    if (record.source) {
      console.log();
      console.log(
        bold(record.source.relation === 'converted' ? 'converted from' : 'declared original'),
      );
      for (const file of record.source.files) {
        console.log(`  ${file.name}  ${dim(`${file.mediaType}, ${formatBytes(file.size)}`)}`);
        console.log(`  ${dim(formatHash(file.sha256))}`);
      }
    }

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
