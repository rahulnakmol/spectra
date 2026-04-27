import { fileTypeFromBuffer } from 'file-type';
import { BadRequestError } from '../errors/domain.js';

export const ALLOWED_EXTS = ['pdf', 'png', 'jpg', 'jpeg', 'heic', 'tiff'] as const;
export type AllowedExt = (typeof ALLOWED_EXTS)[number];

const ALLOWED_MIME = new Map<AllowedExt, string>([
  ['pdf', 'application/pdf'],
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['heic', 'image/heic'],
  ['tiff', 'image/tiff'],
]);

export interface DetectedType {
  ext: AllowedExt;
  mime: string;
}

export async function detectAndValidateMime(buf: Buffer, filename: string): Promise<DetectedType> {
  const detected = await fileTypeFromBuffer(buf);
  if (!detected) throw new BadRequestError('Could not determine file type');
  const ext = detected.ext.toLowerCase();
  if (!isAllowedExt(ext)) throw new BadRequestError(`File type "${ext}" not allowed`);
  const declared = filename.split('.').pop()?.toLowerCase() ?? '';
  const normalize = (e: string): string => (e === 'jpeg' ? 'jpg' : e);
  if (normalize(declared) !== normalize(ext)) {
    throw new BadRequestError('File extension does not match content');
  }
  return { ext, mime: ALLOWED_MIME.get(ext) ?? detected.mime };
}

function isAllowedExt(e: string): e is AllowedExt {
  return (ALLOWED_EXTS as readonly string[]).includes(e);
}
