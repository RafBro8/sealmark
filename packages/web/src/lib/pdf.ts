import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
// Bundled from node_modules and served from our own origin — never a CDN.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFDocumentProxy, PDFPageProxy };

export interface LoadedPage {
  index: number;
  widthPt: number;
  heightPt: number;
}

export interface LoadedDocument {
  proxy: PDFDocumentProxy;
  pages: LoadedPage[];
}

/**
 * Parses a PDF for display.
 *
 * The bytes are copied first: pdf.js transfers the buffer it is given to its
 * worker, which detaches it and would leave the original unusable for signing.
 */
export async function loadDocument(bytes: Uint8Array): Promise<LoadedDocument> {
  const proxy = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const pages: LoadedPage[] = [];

  for (let n = 1; n <= proxy.numPages; n += 1) {
    const page = await proxy.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    pages.push({ index: n - 1, widthPt: viewport.width, heightPt: viewport.height });
  }

  return { proxy, pages };
}

/**
 * Draws a page into a canvas at `zoom` CSS pixels per point.
 *
 * The backing store is scaled by the device pixel ratio so text stays sharp on
 * high-density displays, while the CSS size stays in layout pixels.
 */
export async function renderPage(
  proxy: PDFDocumentProxy,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  zoom: number,
): Promise<void> {
  const page = await proxy.getPage(pageIndex + 1);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const viewport = page.getViewport({ scale: zoom * dpr });

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
  canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not get a 2D canvas context.');

  await page.render({ canvasContext: context, viewport }).promise;
}

/**
 * Text of a PDF's last few pages, where Sealmark's certificate lives.
 *
 * Reads from the end because the certificate is appended after the document,
 * and may continue across more than one page. Returns an empty string for a
 * file pdf.js cannot open, so verification can still report on the bytes.
 */
export async function trailingPagesText(bytes: Uint8Array, pages = 4): Promise<string> {
  try {
    const proxy = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
    const first = Math.max(1, proxy.numPages - pages + 1);
    const parts: string[] = [];
    for (let n = first; n <= proxy.numPages; n += 1) {
      const content = await (await proxy.getPage(n)).getTextContent();
      for (const item of content.items) {
        if ('str' in item) parts.push(item.str);
      }
    }
    await proxy.destroy();
    return parts.join(' ');
  } catch {
    return '';
  }
}
