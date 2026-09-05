/** Read common image headers before allocating decoded pixels. Originals remain untouched. */
export function imageHeaderDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length));
  if (bytes.length >= 24 && text(1, 3) === 'PNG' && text(12, 4) === 'IHDR') {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 30 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    const chunk = text(12, 4);
    if (chunk === 'VP8X' && (bytes[20]! & 0x08)) return null; // EXIF orientation needs the decoder.
    if (chunk === 'VP8X') return { width: 1 + (view.getUint32(24, true) & 0xffffff), height: 1 + (view.getUint32(26, true) >>> 8) };
    if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (chunk === 'VP8L' && bytes[20] === 0x2f) { const bits = view.getUint32(21, true); return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) }; }
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let width = 0, height = 0, orientation = 1, at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at++] !== 0xff) break;
    while (bytes[at] === 0xff) at++;
    const marker = bytes[at++]!;
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd8) continue;
    if (at + 2 > bytes.length) break;
    const length = view.getUint16(at);
    if (length < 2 || at + length > bytes.length) break;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 8) {
      height = view.getUint16(at + 3); width = view.getUint16(at + 5);
    }
    if (marker === 0xe1 && length >= 16 && text(at + 2, 6) === 'Exif\x00\x00') {
      const tiff = at + 8, end = at + length;
      const little = text(tiff, 2) === 'II';
      if ((little || text(tiff, 2) === 'MM') && view.getUint16(tiff + 2, little) === 42) {
        const ifd = tiff + view.getUint32(tiff + 4, little);
        if (ifd >= tiff + 8 && ifd + 2 <= end) {
          const count = Math.min(view.getUint16(ifd, little), 256);
          for (let n = 0; n < count; n++) {
            const p = ifd + 2 + n * 12;
            if (p + 12 > end) break;
            if (view.getUint16(p, little) === 0x112 && view.getUint16(p + 2, little) === 3 && view.getUint32(p + 4, little) === 1) orientation = view.getUint16(p + 8, little);
          }
        }
      }
    }
    at += length;
  }
  return width && height ? orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height } : null;
}

export function assertImagePixelBudget(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width * height > 64_000_000) {
    throw new Error('This image exceeds the 64-megapixel decode limit. Import a smaller copy; its original file is unchanged.');
  }
}
