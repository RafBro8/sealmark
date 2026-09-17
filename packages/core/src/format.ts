/**
 * Small presentation helpers with no dependencies, safe to load on a first visit.
 */

/** Conventional name of the record file that accompanies a signed document. */
export function recordFileNameFor(documentName: string): string {
  return `${documentName.replace(/\.pdf$/i, '')}.sealmark.json`;
}

/** Human-readable byte size for audit trail entries. */
export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** "3 minutes", "5 hours", "199 days" — a gap between two times, for people. */
export function describeDuration(ms: number): string {
  const minutes = Math.round(Math.abs(ms) / 60000);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  if (days >= 2) return `${days} days`;
  if (hours >= 2) return `${hours} hours`;
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}
