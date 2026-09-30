// Reads metadata from a saved MuseScore file (.mscz or .mscx).
// MuseScore Studio no longer lets plugins write files reliably, so instead of
// exporting info from inside MuseScore we read the score file on disk directly.
const fs = require("fs");
const path = require("path");
const { extractFile } = require("./zip");

// Placeholder values MuseScore fills in for new scores; showing these is just noise.
const PLACEHOLDERS = new Set(["", "untitled score", "composer / arranger", "subtitle", "title", "composer", "lyricist"]);

// Keys indexed by number of sharps (+) / flats (-), offset by 7.
const MAJOR_KEYS = ["C♭", "G♭", "D♭", "A♭", "E♭", "B♭", "F", "C", "G", "D", "A", "E", "B", "F♯", "C♯"];
const MINOR_KEYS = ["A♭", "E♭", "B♭", "F", "C", "G", "D", "A", "E", "B", "F♯", "C♯", "G♯", "D♯", "A♯"];

function keyName(fifths, mode) {
    const major = MAJOR_KEYS[fifths + 7];
    const minor = MINOR_KEYS[fifths + 7];
    if (!major) return null;
    if (mode === "major") return `${major} major`;
    if (mode === "minor") return `${minor} minor`;
    // Most scores don't record the mode, so show both readings of the key signature.
    return `${major} major / ${minor} minor`;
}

const cache = new Map();

function decodeEntities(s) {
    return s
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
        .replace(/&amp;/g, "&");
}

/**
 * Converts MuseScore rich text (<font/>, <b>, <br/>, <sym>...) to plain lines,
 * each with the largest font size used on it (null if the style default applies).
 */
function richTextToSizedLines(xml) {
    const lines = [];
    let size = null;
    for (const raw of xml.split(/<br\s*\/>/)) {
        let maxSize = size;
        for (const m of raw.matchAll(/<font size="([\d.]+)"\s*\/>/g)) {
            size = Number(m[1]);
            maxSize = Math.max(maxSize ?? 0, size);
        }
        const text = decodeEntities(raw.replace(/<sym>[^<]*<\/sym>/g, "").replace(/<[^>]+>/g, "")).trim();
        if (text) lines.push({ text, size: maxSize });
    }
    return lines;
}

function richTextToLines(xml) {
    return richTextToSizedLines(xml).map((l) => l.text);
}

/**
 * Title frames often hold more than the title ("Arranged for ...", a series name), with the
 * actual title in the biggest font. Returns that line, plus the line after it as a subtitle.
 */
function pickTitle(lines) {
    if (lines.length === 0) return {};
    const DEFAULT_TITLE_SIZE = 22;
    const sizeOf = (l) => l.size ?? DEFAULT_TITLE_SIZE;
    let best = 0;
    lines.forEach((l, i) => {
        if (sizeOf(l) > sizeOf(lines[best])) best = i;
    });
    return { title: lines[best].text, subtitle: lines[best + 1]?.text };
}

function clean(value) {
    if (!value) return null;
    const v = value.trim();
    return PLACEHOLDERS.has(v.toLowerCase()) ? null : v;
}

function readMscx(filePath) {
    if (/\.mscx$/i.test(filePath)) return fs.readFileSync(filePath, "utf8");
    // The main score is the .mscx at the archive root; part excerpts live under Excerpts/.
    const entry = extractFile(filePath, (name) => !name.includes("/") && /\.mscx$/i.test(name));
    if (!entry) throw new Error("No .mscx found inside archive");
    return entry.data.toString("utf8");
}

function parseScoreXml(xml) {
    const metaTags = {};
    for (const m of xml.matchAll(/<metaTag name="([^"]+)">([^<]*)<\/metaTag>/g)) {
        metaTags[m[1]] = decodeEntities(m[2]);
    }

    // Text shown in the title frame at the top of the score. This is what users
    // actually edit, whereas metaTags often keep their defaults.
    const frame = {};
    const vbox = xml.match(/<VBox>([\s\S]*?)<\/VBox>/);
    if (vbox) {
        for (const m of vbox[1].matchAll(/<Text>[\s\S]*?<style>([^<]+)<\/style>[\s\S]*?<text>([\s\S]*?)<\/text>/g)) {
            frame[m[1]] ??= m[2];
        }
    }

    const titleFrame = pickTitle(frame.title ? richTextToSizedLines(frame.title) : []);
    const frameLines = (style) => (frame[style] ? richTextToLines(frame[style]) : []);
    const joinLines = (lines) => lines.map((l) => l.replace(/,\s*$/, "")).join(", ");
    const composerLines = frameLines("composer").filter((l) => !/^arr\.?$/i.test(l));

    const instruments = [];
    for (const m of xml.matchAll(/<Part\b[^>]*>[\s\S]*?<trackName>([^<]*)<\/trackName>/g)) {
        const name = decodeEntities(m[1]).trim();
        if (name) instruments.push(name);
    }

    // Measures are stored per staff after all <Part> definitions; count them in the first staff.
    let measures = 0;
    const afterParts = xml.slice(xml.lastIndexOf("</Part>") + 1);
    const firstStaff = afterParts.match(/<Staff id="[^"]*">([\s\S]*?)<\/Staff>/);
    if (firstStaff) measures = (firstStaff[1].match(/<Measure[\s>]/g) || []).length;

    const sigN = xml.match(/<sigN>(\d+)<\/sigN>/);
    const sigD = xml.match(/<sigD>(\d+)<\/sigD>/);
    const keySig = xml.match(/<KeySig>([\s\S]*?)<\/KeySig>/)?.[1] || "";
    const concertKey = keySig.match(/<(?:concertKey|accidental)>(-?\d+)<\//);
    const mode = keySig.match(/<mode>(major|minor)<\/mode>/)?.[1];
    const tempoText = xml.match(/<Tempo>[\s\S]*?<text>([\s\S]*?)<\/text>/);
    const bpm = tempoText && richTextToLines(tempoText[1]).join(" ").match(/=\s*(\d+(?:\.\d+)?)/);

    return {
        title: clean(titleFrame.title) || clean(metaTags.workTitle),
        subtitle: clean(frameLines("subtitle")[0]) || clean(titleFrame.subtitle) || clean(metaTags.subtitle),
        composer: clean(joinLines(composerLines)) || clean(metaTags.composer),
        instruments,
        measures,
        timeSignature: sigN && sigD ? `${sigN[1]}/${sigD[1]}` : null,
        key: concertKey ? keyName(Number(concertKey[1]), mode) : null,
        bpm: bpm ? Math.round(Number(bpm[1])) : null,
    };
}

/**
 * Returns metadata for the score at `filePath`, or null if it can't be read.
 * Results are cached until the file's modification time changes (i.e. it is saved).
 */
function getScoreInfo(filePath) {
    let stat;
    try {
        stat = fs.statSync(filePath);
    } catch {
        return null;
    }

    const cached = cache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.info;

    let info = null;
    if (/\.msc[zx]$/i.test(filePath)) {
        try {
            info = parseScoreXml(readMscx(filePath));
        } catch (e) {
            console.warn(`! Couldn't read score metadata from ${path.basename(filePath)}: ${e.message}`);
        }
    }
    cache.set(filePath, { mtimeMs: stat.mtimeMs, info });
    return info;
}

module.exports = { getScoreInfo, parseScoreXml };
