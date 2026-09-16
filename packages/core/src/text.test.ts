import { describe, it, expect } from 'vitest';
import { initialsOf, isoDate } from './text.js';

describe('initialsOf', () => {
  it('takes first and last initials', () => {
    expect(initialsOf('Rafal Brodzinski')).toBe('RB');
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
    expect(isoDate(new Date('2026-03-04T23:30:00Z'))).toBe('2026-03-04');
  });
});
