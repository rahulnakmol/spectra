import { BadRequestError } from '../errors/domain.js';

const FORBIDDEN_CHARS = /[\u0000-\u001F\u007F<>:"|?*]/g;
const SEPARATORS = /[\\/]/g;
const TRAVERSAL = /(^|[\\/])\.\.([\\/]|$)/;
const MAX_LEN = 200;

export function sanitizeFilename(input: string): string {
  if (typeof input !== 'string' || input.length === 0) throw new BadRequestError('Filename empty');
  if (TRAVERSAL.test(input)) throw new BadRequestError('Path traversal in filename');
  if (input === '.' || input === '..') throw new BadRequestError('Invalid filename');
  if (/[\u0000-\u001F\u007F]/.test(input)) throw new BadRequestError('Control chars in filename');
  let out = input.replace(SEPARATORS, '_').replace(FORBIDDEN_CHARS, '_').trim();
  if (!out || out === '.' || out === '..') throw new BadRequestError('Invalid filename after sanitization');
  if (out.length > MAX_LEN) {
    const dot = out.lastIndexOf('.');
    if (dot > 0 && dot >= out.length - 8) {
      const ext = out.slice(dot);
      out = out.slice(0, MAX_LEN - ext.length) + ext;
    } else {
      out = out.slice(0, MAX_LEN);
    }
  }
  return out;
}
