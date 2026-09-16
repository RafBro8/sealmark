/**
 * Hands a file to the user.
 *
 * Everything stays in the page: the blob is built from bytes already in memory
 * and released immediately, so no upload and no server round trip is involved.
 */
export function downloadBytes(bytes: Uint8Array, filename: string, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadText(text: string, filename: string, mime: string): void {
  downloadBytes(new TextEncoder().encode(text), filename, mime);
}
