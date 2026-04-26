import { describe, it, expect } from '@jest/globals';
import { sanitizeFilename } from './sanitize.js';

describe('sanitizeFilename', () => {
  it('keeps simple names unchanged', () => {
    expect(sanitizeFilename('invoice.pdf')).toBe('invoice.pdf');
  });
  it('strips path separators', () => {
    expect(sanitizeFilename('a/b\\c.pdf')).toBe('a_b_c.pdf');
  });
  it('rejects path traversal', () => {
    expect(() => sanitizeFilename('../etc/passwd')).toThrow();
    expect(() => sanitizeFilename('..\\boot.ini')).toThrow();
  });
  it('rejects control chars', () => {
    expect(() => sanitizeFilename('hi\u0001.pdf')).toThrow();
  });
  it('truncates names over 200 chars while preserving extension', () => {
    const long = 'a'.repeat(300) + '.pdf';
    const out = sanitizeFilename(long);
    expect(out.endsWith('.pdf')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(200);
  });
  it('rejects empty or dot-only names', () => {
    expect(() => sanitizeFilename('')).toThrow();
    expect(() => sanitizeFilename('.')).toThrow();
    expect(() => sanitizeFilename('..')).toThrow();
  });
  it('strips Windows reserved characters', () => {
    expect(sanitizeFilename('a:b*c?.pdf')).toBe('a_b_c_.pdf');
  });
});
