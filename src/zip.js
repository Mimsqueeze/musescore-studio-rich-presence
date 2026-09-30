// Minimal ZIP reader: just enough to pull one file out of a .mscz archive
// without adding a dependency.
const fs = require("fs");
const zlib = require("zlib");

const EOCD_SIG = 0x06054b50;
const CDH_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;

function findEndOfCentralDirectory(buf) {
    // The EOCD record is at least 22 bytes and may be followed by a comment of up to 64 KiB.
    const min = Math.max(0, buf.length - 22 - 0xffff);
    for (let i = buf.length - 22; i >= min; i--) {
        if (buf.readUInt32LE(i) === EOCD_SIG) return i;
    }
    throw new Error("Not a zip file (no end of central directory record)");
}

function listEntries(buf) {
    const eocd = findEndOfCentralDirectory(buf);
    const count = buf.readUInt16LE(eocd + 10);
    let offset = buf.readUInt32LE(eocd + 16);

    const entries = [];
    for (let i = 0; i < count; i++) {
        if (buf.readUInt32LE(offset) !== CDH_SIG) throw new Error("Corrupt zip central directory");
        const method = buf.readUInt16LE(offset + 10);
        const compressedSize = buf.readUInt32LE(offset + 20);
        const nameLength = buf.readUInt16LE(offset + 28);
        const extraLength = buf.readUInt16LE(offset + 30);
        const commentLength = buf.readUInt16LE(offset + 32);
        const localHeaderOffset = buf.readUInt32LE(offset + 42);
        const name = buf.toString("utf8", offset + 46, offset + 46 + nameLength);
        entries.push({ name, method, compressedSize, localHeaderOffset });
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}

function readEntry(buf, entry) {
    const lh = entry.localHeaderOffset;
    if (buf.readUInt32LE(lh) !== LFH_SIG) throw new Error("Corrupt zip local header");
    const dataStart = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
    const data = buf.subarray(dataStart, dataStart + entry.compressedSize);
    if (entry.method === 0) return data;
    if (entry.method === 8) return zlib.inflateRawSync(data);
    throw new Error(`Unsupported zip compression method ${entry.method}`);
}

/** Returns { name, data } for the first entry matching `predicate`, or null. */
function extractFile(zipPath, predicate) {
    const buf = fs.readFileSync(zipPath);
    const entry = listEntries(buf).find((e) => predicate(e.name));
    return entry ? { name: entry.name, data: readEntry(buf, entry) } : null;
}

module.exports = { extractFile };
