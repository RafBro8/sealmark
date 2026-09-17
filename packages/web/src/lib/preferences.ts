/**
 * Per-browser conveniences. Storage can be unavailable (private windows,
 * blocked site data), so every read falls back and every write may fail
 * quietly — the setting still applies for this visit.
 */

const TIMESTAMP_KEY = 'sealmark-timestamp';

/** Whether to request a trusted timestamp when signing. Off until chosen. */
export function savedTimestampPreference(): boolean {
  try {
    return localStorage.getItem(TIMESTAMP_KEY) === 'on';
  } catch {
    return false;
  }
}

export function saveTimestampPreference(on: boolean): void {
  try {
    localStorage.setItem(TIMESTAMP_KEY, on ? 'on' : 'off');
  } catch {
    // Not remembered next visit.
  }
}
