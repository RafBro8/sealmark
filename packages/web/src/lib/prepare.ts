import { extensionOf, mediaTypeFor, planIntake, sniffImageType } from '@sealmark/core/light';
import type { PageSize, SourceFileInput, SourceInput } from '@sealmark/core';
import { textFontBytes } from './font.js';

/**
 * Turns whatever someone drops in — a PDF, photos of a paper contract, a text
 * file — into a PDF ready to sign, entirely in this tab.
 */

export type Prepared =
  | { kind: 'ready'; name: string; bytes: Uint8Array; source?: SourceInput }
  | { kind: 'office'; original: SourceFileInput }
  | { kind: 'rejected'; reason: string };

/** Regions that use US Letter. Everywhere else defaults to A4. */
const LETTER_REGIONS = new Set(['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'GT', 'CR', 'PA', 'DO', 'PR', 'SV', 'BZ']);

/**
 * Page size for converted documents, from the browser's locale. `Intl.Locale`
 * fills in the likely region for a bare language tag ("pl" becomes "pl-PL"),
 * so a Polish browser gets A4 and an American one gets Letter.
 */
export function defaultPageSize(locale: string): PageSize {
  try {
    const region = new Intl.Locale(locale).maximize().region;
    return region && LETTER_REGIONS.has(region) ? 'letter' : 'a4';
  } catch {
    return 'a4';
  }
}

export function pdfNameFor(name: string): string {
  return `${name.replace(/\.[^./\\]+$/, '')}.pdf`;
}

async function bytesOf(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

function heicAdvice(name: string): string {
  const extension = extensionOf(name);
  return extension === 'heic' || extension === 'heif'
    ? ' HEIC photos only open in Safari. On an iPhone, set Settings › Camera › Formats to Most Compatible, or export the photo as JPEG.'
    : ' Save it as JPEG or PNG and try again.';
}

/**
 * Decodes an image the PDF library cannot embed directly (WebP, GIF, HEIC in
 * Safari) using the browser's own decoder, and re-encodes it as PNG.
 */
async function decodeToPng(file: File): Promise<Uint8Array> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`This browser cannot read ${file.name}.${heicAdvice(file.name)}`);
  }

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not get a 2D canvas context.');
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error(`Could not convert ${file.name}.`);
  return bytesOf(blob);
}

export async function prepareFiles(
  files: File[],
  pageSize: PageSize,
  onProgress: (message: string) => void = () => undefined,
): Promise<Prepared> {
  const picked = await Promise.all(
    files.map(async (file) => ({
      file,
      name: file.name,
      mediaType: mediaTypeFor(file.name, file.type),
      head: await bytesOf(file.slice(0, 16)),
    })),
  );

  const plan = planIntake(picked);

  switch (plan.kind) {
    case 'rejected':
      return plan;

    case 'pdf':
      return { kind: 'ready', name: plan.file.name, bytes: await bytesOf(plan.file.file) };

    case 'office':
      return {
        kind: 'office',
        original: {
          name: plan.file.name,
          mediaType: plan.file.mediaType,
          bytes: await bytesOf(plan.file.file),
        },
      };

    case 'images': {
      const count = plan.files.length;
      const sources: SourceFileInput[] = [];
      const pages: Uint8Array[] = [];

      for (const [index, item] of plan.files.entries()) {
        onProgress(count === 1 ? 'Converting the photo…' : `Converting photo ${index + 1} of ${count}…`);
        const original = await bytesOf(item.file);

        if (sniffImageType(original)) {
          pages.push(original);
          sources.push({ name: item.name, mediaType: item.mediaType, bytes: original });
        } else {
          pages.push(await decodeToPng(item.file));
          sources.push({ name: item.name, mediaType: item.mediaType, bytes: original, reencoded: true });
        }
      }

      onProgress('Building the PDF…');
      const first = plan.files[0]!;
      return {
        kind: 'ready',
        name: pdfNameFor(first.name),
        bytes: await (await import('@sealmark/core/convert')).imagesToPdf(pages, { pageSize }),
        source: { relation: 'converted', method: 'image-to-pdf', pageSize, files: sources },
      };
    }

    case 'text': {
      onProgress('Converting the text…');
      const original = await bytesOf(plan.file.file);
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(original);
      } catch {
        return { kind: 'rejected', reason: `${plan.file.name} is not UTF-8 text. Re-save it as UTF-8, or export it as a PDF.` };
      }

      try {
        return {
          kind: 'ready',
          name: pdfNameFor(plan.file.name),
          bytes: await (await import('@sealmark/core/convert')).textToPdf(text, await textFontBytes(), { pageSize }),
          source: {
            relation: 'converted',
            method: 'text-to-pdf',
            pageSize,
            files: [{ name: plan.file.name, mediaType: plan.file.mediaType, bytes: original }],
          },
        };
      } catch (cause) {
        return { kind: 'rejected', reason: `${(cause as Error).message} Export it as a PDF from the app that made it instead.` };
      }
    }
  }
}
