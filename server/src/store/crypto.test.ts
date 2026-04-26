import { describe, it, expect } from '@jest/globals';
import { encryptJson, decryptJson } from './crypto.js';

describe('crypto', () => {
  const key = Buffer.alloc(32, 7).toString('base64');

  it('round-trips JSON', () => {
    const ct = encryptJson({ a: 1, b: 'two' }, key);
    expect(decryptJson(ct, key)).toEqual({ a: 1, b: 'two' });
  });

  it('produces different ciphertexts for same plaintext (random IV)', () => {
    const a = encryptJson({ x: 1 }, key);
    const b = encryptJson({ x: 1 }, key);
    expect(a).not.toBe(b);
  });

  it('rejects tampered ciphertext', () => {
    const ct = encryptJson({ x: 1 }, key);
    const parts = ct.split('.');
    const tampered = [parts[0], parts[1], 'AAAAAAAAAAAAAAAAAAAAAA==', parts[3]].join('.');
    expect(() => decryptJson(tampered, key)).toThrow();
  });

  it('rejects wrong key', () => {
    const ct = encryptJson({ x: 1 }, key);
    const otherKey = Buffer.alloc(32, 9).toString('base64');
    expect(() => decryptJson(ct, otherKey)).toThrow();
  });
});
