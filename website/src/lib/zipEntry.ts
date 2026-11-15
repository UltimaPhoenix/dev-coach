// Build-time only (docusaurus.config.ts): read one file out of a ZIP archive with Node built-ins.
// The demo data lives in scripts/screenshots/fixture.zip, a plain archive we write ourselves
// (stored or deflated entries, no ZIP64, no encryption) — which is all this reads.
import { inflateRawSync } from "node:zlib";

const EOCD = 0x06054b50; // end of central directory
const CENTRAL = 0x02014b50; // central directory file header
const LOCAL = 0x04034b50; // local file header

/** The bytes of `name` inside `zip`, or null when the archive has no such entry. */
export function readZipEntry(zip: Buffer, name: string): Buffer | null {
  // The end record sits at the tail, after an optional comment of at most 64 KB.
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === EOCD) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("Not a ZIP archive: no end-of-central-directory record");
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(at) !== CENTRAL) throw new Error("Corrupt ZIP: bad central directory entry");
    const method = zip.readUInt16LE(at + 10);
    const packedSize = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const entry = zip.toString("utf8", at + 46, at + 46 + nameLength);
    if (entry === name) {
      if (zip.readUInt32LE(local) !== LOCAL) throw new Error(`Corrupt ZIP: bad local header for ${name}`);
      // The local header repeats the name and carries its own extra field: skip both.
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const packed = zip.subarray(start, start + packedSize);
      if (method === 0) return Buffer.from(packed);
      if (method === 8) return inflateRawSync(packed);
      throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}
