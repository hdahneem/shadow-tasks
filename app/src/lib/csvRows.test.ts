import { describe, it, expect } from 'vitest';
import { parseCsvRows } from './csvRows';

describe('parseCsvRows', () => {
  it('splits simple comma-separated rows', () => {
    expect(parseCsvRows('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles a quoted field containing a comma', () => {
    expect(parseCsvRows('a,b\n"one, two",three')).toEqual([
      ['a', 'b'],
      ['one, two', 'three'],
    ]);
  });

  it('handles escaped ("") quotes inside a quoted field', () => {
    expect(parseCsvRows('a\n"she said ""hi"""')).toEqual([['a'], ['she said "hi"']]);
  });

  it('handles a newline embedded inside a quoted field', () => {
    expect(parseCsvRows('a\n"line one\nline two"')).toEqual([['a'], ['line one\nline two']]);
  });

  it('strips carriage returns from CRLF line endings', () => {
    expect(parseCsvRows('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});
