import { describe, it, expect } from 'vitest';
import { parseField } from './fields.js';

describe('parseField', () => {
  it('parses a signature placement and converts the page to 0-based', () => {
    expect(parseField('signature:1:60,125,230,45')).toEqual({
      kind: 'signature',
      placement: { page: 0, x: 60, y: 125, width: 230, height: 45 },
    });
  });

  it('keeps an explicit value', () => {
    expect(parseField('text:2:10,20,100,30:Agreed and accepted')).toMatchObject({
      kind: 'text',
      value: 'Agreed and accepted',
    });
  });

  it('allows colons inside a value', () => {
    expect(parseField('text:1:10,20,100,30:Ref: GLD-2026:01')).toMatchObject({
      value: 'Ref: GLD-2026:01',
    });
  });

  it('tolerates spacing and casing', () => {
    expect(parseField('SIGNATURE:1: 60 , 125 , 230 , 45 ')).toMatchObject({ kind: 'signature' });
  });

  it.each([
    ['signature', 'Malformed field'],
    ['sign:1:1,2,3,4', 'Unknown field kind'],
    ['signature:0:1,2,3,4', 'Pages start at 1'],
    ['signature:x:1,2,3,4', 'invalid page'],
    ['signature:1:1,2,3', 'four numbers'],
    ['signature:1:a,b,c,d', 'four numbers'],
    ['text:1:1,2,3,4', 'text field needs a value'],
  ])('rejects %s', (input, message) => {
    expect(() => parseField(input)).toThrow(new RegExp(message, 'i'));
  });
});
