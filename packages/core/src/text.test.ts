import { describe, it, expect } from 'vitest';
import { initialsOf, isoDate } from './text.js';

describe('initialsOf', () => {
  it('takes first and last initials', () => {
    expect(initialsOf('Jordan Reyes')).toBe('JR');
  });

  it('skips middle names', () => {
    expect(initialsOf('Ada Marie King Lovelace')).toBe('AL');
  });

  it('falls back to two characters for a single name', () => {
    expect(initialsOf('Prince')).toBe('PR');
  });

  it('tolerates messy spacing', () => {
    expect(initialsOf('  grace   hopper  ')).toBe('GH');
  });

  it('returns empty for empty input', () => {
    expect(initialsOf('   ')).toBe('');
  });
});

describe('isoDate', () => {
  it('formats unambiguously as YYYY-MM-DD', () => {
    // Built from local fields, so the expectation holds in any timezone.
    expect(isoDate(new Date(2026, 2, 4, 12, 0))).toBe('2026-03-04');
  });

  it('dates the signer local day, not the UTC day', () => {
    // 7:30pm on 1 October in Chicago is already 2 October in UTC. Stamping
    // the UTC day put tomorrow's date next to a signature made today.
    expect(isoDate(new Date(2026, 9, 1, 19, 30))).toBe('2026-10-01');
  });

  it('holds across a year boundary', () => {
    // 11pm on New Year's Eve locally is next year in UTC.
    expect(isoDate(new Date(2026, 11, 31, 23, 0))).toBe('2026-12-31');
  });

  it('pads single-digit months and days', () => {
    expect(isoDate(new Date(2026, 0, 9, 9, 0))).toBe('2026-01-09');
  });
});
