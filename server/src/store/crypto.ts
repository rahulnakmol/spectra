import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALG = 'aes-256-gcm';
const VERSION = 'v1';

function keyToBuffer(b64: string): Buffer {
  const buf = Buffer.from(b64, 'base64');
  if (buf.length !== 32) throw new Error('session encryption key must decode to 32 bytes');
  return buf;
}

export function encryptJson(value: unknown, keyB64: string): string {
  const key = keyToBuffer(keyB64);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  const pt = Buffer.from(JSON.stringify(value), 'utf8');
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.');
}

export function decryptJson<T = unknown>(token: string, keyB64: string): T {
  const [v, ivB64, tagB64, ctB64] = token.split('.');
  if (v !== VERSION || !ivB64 || !tagB64 || !ctB64) throw new Error('bad ciphertext envelope');
  const key = keyToBuffer(keyB64);
  const decipher = createDecipheriv(ALG, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
  return JSON.parse(pt.toString('utf8')) as T;
}
