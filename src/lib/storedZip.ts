import { Zip, ZipPassThrough, strToU8 } from "fflate";

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let bit = 0; bit < 8; bit++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
async function crc32(blob: Blob): Promise<number> {
  let crc = 0xffffffff;
  for (let offset = 0; offset < blob.size; offset += 512 * 1024) {
    const bytes = new Uint8Array(await blob.slice(offset, offset + 512 * 1024).arrayBuffer());
    for (const value of bytes) crc = CRC_TABLE[(crc ^ value) & 255]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Stored ZIP output without a second full set of original-media ArrayBuffers. */
export async function createStoredZip(files: readonly { path: string; blob: Blob }[], maximum: number): Promise<Blob> {
  const parts: Blob[] = [];
  let size = 0, failure: Error | null = null;
  const zip = new Zip((error, data) => {
    if (error) { failure = error; return; }
    size += data.byteLength;
    if (size > maximum) { failure = new Error("Portable project archive exceeds safe size limit."); return; }
    parts.push(new Blob([data as Uint8Array<ArrayBuffer>]));
  });
  try {
    for (const file of files) {
      if (failure) throw failure;
      const entry = new ZipPassThrough(file.path);
      entry.mtime = new Date(1980, 0, 1, 0, 0, 0, 0);
      zip.add(entry);
      for (let offset = 0; offset < file.blob.size; offset += 512 * 1024) {
        if (failure) throw failure;
        entry.push(new Uint8Array(await file.blob.slice(offset, offset + 512 * 1024).arrayBuffer()), false);
      }
      entry.push(new Uint8Array(), true);
    }
    zip.end();
    if (failure) throw failure;
    return new Blob(parts, { type: "application/vnd.pitchdog.pitched+zip" });
  } catch (error) { zip.terminate(); throw error; }
}

/** Fast path for Drift's stored archives. Deflated legacy archives use the existing bounded reader. */
export async function readStoredZip(archive: Blob, limits: {
  maxAssetCount: number; maxManifestBytes: number; maxAssetBytes: number; maxTotalAssetBytes: number;
}): Promise<Map<string, Blob> | null> {
  if (archive.size < 22) return null;
  const tailStart = Math.max(0, archive.size - 65557);
  const tail = new Uint8Array(await archive.slice(tailStart).arrayBuffer());
  const tv = new DataView(tail.buffer);
  let end = -1;
  for (let n = tail.length - 22; n >= 0; n--) {
    if (tv.getUint32(n, true) === 0x06054b50 && n + 22 + tv.getUint16(n + 20, true) === tail.length) { end = n; break; }
  }
  if (end < 0) return null;
  const count = tv.getUint16(end + 10, true), length = tv.getUint32(end + 12, true), offset = tv.getUint32(end + 16, true);
  if (count === 0xffff || length === 0xffffffff || offset === 0xffffffff) return null;
  if (tv.getUint16(end + 4, true) !== 0 || tv.getUint16(end + 6, true) !== 0 || tv.getUint16(end + 8, true) !== count) throw new Error("Multi-volume projects are unsupported.");
  if (count > limits.maxAssetCount + 1 || length > 4 * 1024 * 1024 || offset + length !== tailStart + end) throw new Error("Invalid ZIP directory bounds.");
  const directory = new Uint8Array(await archive.slice(offset, offset + length).arrayBuffer());
  const view = new DataView(directory.buffer), decoder = new TextDecoder("utf-8", { fatal: true });
  const entries: { path: string; flags: number; crc: number; size: number; start: number; compressed: number; method: number }[] = [];
  const paths = new Set<string>();
  let cursor = 0, expanded = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > length || view.getUint32(cursor, true) !== 0x02014b50) throw new Error("Invalid ZIP central entry.");
    const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true);
    const compressed = view.getUint32(cursor + 20, true), size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true), extraLength = view.getUint16(cursor + 30, true), commentLength = view.getUint16(cursor + 32, true);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > length || (flags & 1) || view.getUint16(cursor + 34, true) !== 0) throw new Error("Invalid or encrypted ZIP entry.");
    const path = decoder.decode(directory.subarray(cursor + 46, cursor + 46 + nameLength));
    if (!path || path.startsWith("/") || path.includes("\\") || path.split("/").some(part => part === ".." || part === ".") || paths.has(path)) return null; // Preserve existing structured integrity errors.
    paths.add(path);
    expanded += size;
    if (size > (path === "manifest.json" ? limits.maxManifestBytes : limits.maxAssetBytes) || expanded > limits.maxTotalAssetBytes + limits.maxManifestBytes) return null;
    entries.push({ path, flags, method, compressed, size, crc: view.getUint32(cursor + 16, true), start: view.getUint32(cursor + 42, true) });
    cursor = next;
  }
  if (cursor !== length) throw new Error("Unexpected ZIP directory bytes.");
  if (entries.some(entry => entry.method !== 0)) return null;
  const result = new Map<string, Blob>();
  let previousEnd = 0;
  for (const entry of entries.sort((a, b) => a.start - b.start)) {
    if (entry.start < previousEnd || entry.start + 30 > offset || entry.compressed !== entry.size) throw new Error("Overlapping or invalid stored ZIP entry.");
    const header = new Uint8Array(await archive.slice(entry.start, entry.start + 30).arrayBuffer());
    const hv = new DataView(header.buffer);
    if (hv.getUint32(0, true) !== 0x04034b50 || hv.getUint16(6, true) !== entry.flags || hv.getUint16(8, true) !== 0) throw new Error("ZIP headers disagree.");
    const nameLength = hv.getUint16(26, true), extraLength = hv.getUint16(28, true);
    const dataStart = entry.start + 30 + nameLength + extraLength;
    const dataEnd = dataStart + entry.size;
    if (dataEnd > offset) throw new Error("ZIP data exceeds its directory boundary.");
    const localName = new Uint8Array(await archive.slice(entry.start + 30, entry.start + 30 + nameLength).arrayBuffer());
    if (decoder.decode(localName) !== entry.path || strToU8(entry.path).length !== localName.length) throw new Error("ZIP filenames disagree.");
    const blob = archive.slice(dataStart, dataEnd);
    if (await crc32(blob) !== entry.crc) return null; // Original reader reports SHA/size errors where applicable.
    previousEnd = dataEnd;
    if (entry.flags & 8) {
      if (dataEnd + 12 > offset) throw new Error("Missing ZIP data descriptor.");
      const dd = new DataView(await archive.slice(dataEnd, Math.min(dataEnd + 16, offset)).arrayBuffer());
      const shift = dd.getUint32(0, true) === 0x08074b50 ? 4 : 0;
      if (dd.byteLength < shift + 12 || dd.getUint32(shift, true) !== entry.crc || dd.getUint32(shift + 4, true) !== entry.size || dd.getUint32(shift + 8, true) !== entry.size) throw new Error("ZIP descriptor disagrees with its directory.");
      previousEnd += shift + 12;
    } else if (hv.getUint32(14, true) !== entry.crc || hv.getUint32(18, true) !== entry.size || hv.getUint32(22, true) !== entry.size) throw new Error("ZIP sizes disagree.");
    result.set(entry.path, blob);
  }
  return result;
}
