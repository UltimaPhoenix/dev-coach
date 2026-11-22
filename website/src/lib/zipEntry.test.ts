// Run with `npm test` (node --test; Node 24+ strips the types natively).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";
import { readZipEntry } from "./zipEntry.ts";

const fixture = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "scripts", "screenshots", "fixture.zip"),
);

/** A minimal archive: one local header + one central entry per file, then the end record. */
function zipOf(files: Record<string, { data: Buffer; method: 0 | 8; flags?: number; crc?: number }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, { data, method, flags = 0, crc = crc32(data) }] of Object.entries(files)) {
    const packed = method === 8 ? deflateRawSync(data) : data;
    const local = Buffer.alloc(30 + name.length + 4); // + a 4-byte extra field the reader must skip
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(4, 28);
    local.write(name, 30);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    central.write(name, 46);
    locals.push(local, packed);
    centrals.push(central);
    offset += local.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length, 8);
  end.writeUInt16LE(centrals.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test("reads the demo course and its metadata out of the screenshot fixture", () => {
  const meta = JSON.parse(readZipEntry(fixture, "courses.json")?.toString("utf8") ?? "null");
  assert.ok(Array.isArray(meta.courses) && meta.courses.length > 0);
  const id = meta.courses[0].id;
  const html = readZipEntry(fixture, `courses/${id}/index.html`)?.toString("utf8") ?? "";
  assert.match(html, /<section id="step-1"/);
  assert.match(html, /<\/html>\s*$/);
});

test("reads stored and deflated entries, skipping the local extra field", () => {
  const text = Buffer.from("devcoach ".repeat(200));
  const zip = zipOf({ "a/stored.txt": { data: Buffer.from("plain"), method: 0 }, "b.txt": { data: text, method: 8 } });
  assert.equal(readZipEntry(zip, "a/stored.txt")?.toString(), "plain");
  assert.deepEqual(readZipEntry(zip, "b.txt"), text);
});

test("a missing entry is null; a file that is not an archive throws", () => {
  assert.equal(readZipEntry(fixture, "courses/nope/index.html"), null);
  assert.throws(() => readZipEntry(Buffer.from("definitely not a zip archive"), "x"), /Not a ZIP archive/);
});

test("refuses what it does not read: a corrupt entry, an encrypted one, a ZIP64 archive", () => {
  const data = Buffer.from("devcoach");
  assert.throws(() => readZipEntry(zipOf({ "x.txt": { data, method: 8, crc: 1 } }), "x.txt"), /fails its CRC check/);
  assert.throws(() => readZipEntry(zipOf({ "x.txt": { data, method: 0, flags: 1 } }), "x.txt"), /encrypted/);
  const zip64 = zipOf({ "x.txt": { data, method: 0 } });
  zip64.writeUInt32LE(0xffffffff, zip64.length - 6); // the end record's directory offset
  assert.throws(() => readZipEntry(zip64, "x.txt"), /ZIP64/);
});
