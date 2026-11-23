// Pure-TypeScript privacy sanitizer for evidence photos: validates the format and strips metadata (EXIF/GPS, XMP, comments).
// JPEG: drops APP1 (EXIF/XMP), APP13 (IPTC), COM. PNG: drops eXIf, tEXt, iTXt, zTXt, tIME. Pixel data is untouched.
export class ImageError extends Error { constructor(m: string) { super(m); this.name = 'ImageError'; } }
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export interface Sanitized { mime: 'image/jpeg' | 'image/png'; data: Buffer; removed: string[] }

export function sanitizeImage(buf: Buffer): Sanitized {
  if (buf.length < 12) throw new ImageError('image too small');
  if (buf.length > MAX_IMAGE_BYTES) throw new ImageError('image too large (max 5 MB)');
  if (buf[0] === 0xff && buf[1] === 0xd8) return jpeg(buf);
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return png(buf);
  throw new ImageError('only JPEG and PNG images are accepted');
}
function jpeg(b: Buffer): Sanitized {
  const out: Buffer[] = [b.subarray(0, 2)], removed: string[] = []; let i = 2, sawSos = false;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new ImageError('malformed JPEG');
    const m = b[i + 1]!;
    if (m === 0xd9) { out.push(b.subarray(i, i + 2)); i += 2; break; }
    if (m === 0xff) { i++; continue; }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { out.push(b.subarray(i, i + 2)); i += 2; continue; }
    if (i + 4 > b.length) throw new ImageError('truncated JPEG');
    const len = b.readUInt16BE(i + 2), end = i + 2 + len;
    if (len < 2 || end > b.length) throw new ImageError('truncated JPEG segment');
    if (m === 0xe1 || m === 0xed || m === 0xfe) removed.push(m === 0xe1 ? 'APP1(EXIF/XMP)' : m === 0xed ? 'APP13(IPTC)' : 'COM');
    else out.push(b.subarray(i, end));
    i = end;
    if (m === 0xda) { sawSos = true; out.push(b.subarray(i)); i = b.length; break; } // entropy-coded data copied verbatim
  }
  if (!sawSos) throw new ImageError('JPEG has no image data');
  return { mime: 'image/jpeg', data: Buffer.concat(out), removed };
}
function png(b: Buffer): Sanitized {
  const out: Buffer[] = [b.subarray(0, 8)], removed: string[] = [], drop = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']); let i = 8, first = true, iend = false;
  while (i + 12 <= b.length) {
    const len = b.readUInt32BE(i), type = b.toString('latin1', i + 4, i + 8), end = i + 12 + len;
    if (end > b.length) throw new ImageError('truncated PNG chunk');
    if (first && type !== 'IHDR') throw new ImageError('malformed PNG');
    first = false;
    if (drop.has(type)) removed.push(type); else out.push(b.subarray(i, end));
    i = end; if (type === 'IEND') { iend = true; break; }
  }
  if (!iend) throw new ImageError('PNG missing IEND');
  return { mime: 'image/png', data: Buffer.concat(out), removed };
}
