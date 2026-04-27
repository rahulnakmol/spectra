import { describe, it, expect } from '@jest/globals';
import { detectAndValidateMime, ALLOWED_EXTS } from './mime.js';

const PDF = Buffer.from('%PDF-1.4\n', 'utf8');
// Minimal valid PNG: signature (8) + IHDR chunk length (4) + 'IHDR' (4) + 13 bytes data + CRC (4)
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  0x00, 0x00, 0x00, 0x0d, // IHDR chunk length = 13
  0x49, 0x48, 0x44, 0x52, // 'IHDR'
  0x00, 0x00, 0x00, 0x01, // width = 1
  0x00, 0x00, 0x00, 0x01, // height = 1
  0x08, 0x02, 0x00, 0x00, 0x00, // bit depth, color type, compression, filter, interlace
  0x90, 0x77, 0x53, 0xde, // CRC
]);

describe('detectAndValidateMime', () => {
  it('accepts PDF magic bytes', async () => {
    const out = await detectAndValidateMime(PDF, 'invoice.pdf');
    expect(out.ext).toBe('pdf');
    expect(out.mime).toBe('application/pdf');
  });
  it('accepts PNG magic bytes', async () => {
    const out = await detectAndValidateMime(PNG, 'logo.png');
    expect(out.ext).toBe('png');
  });
  it('rejects unknown bytes', async () => {
    await expect(detectAndValidateMime(Buffer.from('not a real file'), 'a.pdf')).rejects.toMatchObject({ code: 'bad_request' });
  });
  it('rejects extension/content mismatch', async () => {
    await expect(detectAndValidateMime(PDF, 'logo.png')).rejects.toMatchObject({ code: 'bad_request' });
  });
  it('exports allowlist matching spec §2', () => {
    expect(ALLOWED_EXTS).toEqual(['pdf', 'png', 'jpg', 'jpeg', 'heic', 'tiff']);
  });
});
