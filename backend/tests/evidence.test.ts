import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeImage, ImageError } from '../src/domain/image-sanitize.ts';
import { assessCare } from '../src/domain/care.ts';
import { MemoryEvidenceStorage } from '../src/integrations/storage.ts';

// TEST FIXTURES: minimal hand-built byte sequences, not real photos and never used outside tests.
const seg = (marker: number, payload: Buffer) => { const l = Buffer.alloc(2); l.writeUInt16BE(payload.length + 2); return Buffer.concat([Buffer.from([0xff, marker]), l, payload]); };
const jpegWithExif = () => Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0')), seg(0xe1, Buffer.from('Exif\0\0GPSLatitude=22.3')), seg(0xfe, Buffer.from('camera comment')),
  seg(0xda, Buffer.from([1, 1, 0, 0, 63, 0])), Buffer.from([0x12, 0x34, 0xff, 0xd9])]);
const chunk = (type: string, data: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); return Buffer.concat([l, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]); };
const pngWithText = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', Buffer.alloc(13)), chunk('tEXt', Buffer.from('Location\0Chattogram')), chunk('IDAT', Buffer.from([1, 2, 3])), chunk('IEND', Buffer.alloc(0))]);

test('JPEG: EXIF/GPS, comments removed; JFIF and image data kept', () => {
  const r = sanitizeImage(jpegWithExif());
  assert.equal(r.mime, 'image/jpeg'); assert.deepEqual(r.removed, ['APP1(EXIF/XMP)', 'COM']);
  assert.ok(!r.data.includes(Buffer.from('GPSLatitude'))); assert.ok(!r.data.includes(Buffer.from('camera comment')));
  assert.ok(r.data.includes(Buffer.from('JFIF'))); assert.ok(r.data.subarray(-4).equals(Buffer.from([0x12, 0x34, 0xff, 0xd9])));
});
test('PNG: text/time chunks removed; structure kept', () => {
  const r = sanitizeImage(pngWithText());
  assert.deepEqual(r.removed, ['tEXt']); assert.ok(!r.data.includes(Buffer.from('Chattogram'))); assert.ok(r.data.includes(Buffer.from('IDAT')) && r.data.includes(Buffer.from('IEND')));
});
test('non-images, truncated and oversized files are rejected', () => {
  assert.throws(() => sanitizeImage(Buffer.from('GIF89a-not-allowed-here')), ImageError);
  assert.throws(() => sanitizeImage(jpegWithExif().subarray(0, 30)), ImageError);
  assert.throws(() => sanitizeImage(Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(5 * 1024 * 1024 + 1)])), /too large/);
  assert.throws(() => sanitizeImage(pngWithText().subarray(0, 40)), ImageError);
});
test('evidence storage returns a content checksum', async () => {
  const s = new MemoryEvidenceStorage(), { id, sha256 } = await s.put(Buffer.from('abc'));
  assert.equal(sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'); assert.ok((await s.get(id))!.equals(Buffer.from('abc'))); assert.equal(await s.get('nope'), null);
});
test('CARE abstains on thin evidence and flags duplicates/feasibility; never claims a confirmed site', () => {
  const thin = assessCare({ hasPhoto: false, hasLocation: false, hasLandmark: false, duplicateSuggested: true, eligibleVolunteers: 0 });
  assert.equal(thin.evidenceCompleteness, 'MINIMAL'); const t = thin.careNotes.join(' | ');
  assert.match(t, /Insufficient evidence/); assert.match(t, /Possible duplicate/); assert.match(t, /no eligible volunteer/); assert.match(t, /not a confirmed Aedes/);
  assert.equal(assessCare({ hasPhoto: true, hasLocation: false, hasLandmark: true, duplicateSuggested: false, eligibleVolunteers: 2 }).evidenceCompleteness, 'COMPLETE');
  assert.equal(assessCare({ hasPhoto: true, hasLocation: false, hasLandmark: false, duplicateSuggested: false, eligibleVolunteers: 1 }).evidenceCompleteness, 'PARTIAL');
});
