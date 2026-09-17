/** Where timestamp requests go. Trust rests on the reply's signature, not on this address. */
export const TIMESTAMP_ENDPOINT = 'https://rfc3161.ai.moda';

/** Allowed gap between the record's claimed signing time and the authority's time. */
export const MAX_CLOCK_DRIFT_MS = 15 * 60 * 1000;
