import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts'],
    environment: 'node',
    // Pinned so the date tests mean something. CI runs in UTC, where a date
    // built from UTC and a date built from local fields are identical, and a
    // regression in `isoDate` would pass unnoticed. Chicago is five or six
    // hours behind UTC, so a local evening is already tomorrow in UTC - the
    // exact case that stamped documents a day into the future.
    env: { TZ: 'America/Chicago' },
  },
});
