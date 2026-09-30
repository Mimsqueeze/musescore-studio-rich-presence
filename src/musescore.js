// Finds running MuseScore Studio instances and works out which score each one has open.
//
// MuseScore Studio sets its main window title to the open score's name
// ("Score" or "Score - Part" when a part tab is active, or "MuseScore Studio"
// on the Home screen). We read that title with `tasklist`, which works without
// WMIC, without admin rights, and even when MuseScore itself runs elevated.
// The title is then matched against MuseScore's own session/recent-files lists
// to get the full path of the score file.
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const HOME_TITLES = /^(MuseScore( Studio| \d)?)?$/i;

function parseCsvLine(line) {
    const fields = [];
    const re = /"((?:[^"]|"")*)"/g;
    let m;
    while ((m = re.exec(line))) fields.push(m[1].replace(/""/g, '"'));
    return fields;
}

function tasklist(imageName) {
    return new Promise((resolve) => {
        execFile(
            "tasklist",
            ["/v", "/fo", "csv", "/nh", "/fi", `imagename eq ${imageName}`],
            { windowsHide: true },
            (err, stdout) => {
                if (err) return resolve([]);
                const procs = stdout
                    .split(/\r?\n/)
                    .filter((l) => l.startsWith('"'))
                    .map(parseCsvLine)
                    .map((f) => ({ name: f[0], pid: Number(f[1]), title: f[8] === "N/A" ? "" : f[8] }));
                resolve(procs);
            }
        );
    });
}

/** Lists running MuseScore processes with their window titles. */
async function findProcesses(imageNames) {
    const results = await Promise.all(imageNames.map(tasklist));
    // Helper processes (e.g. the crash handler) have no window title; the main window always has one.
    return results.flat().filter((p) => p.title !== "");
}

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

/**
 * Collects every score MuseScore knows about, most relevant first:
 * the scores open in the current session, then the recent files list.
 * Each entry is { name, path } where `name` is what MuseScore shows in the title bar.
 */
function knownScores(dataDir) {
    const scores = [];
    const add = (p, displayName) => {
        if (typeof p !== "string" || !p) return;
        const normalized = path.normalize(p);
        const name = displayName || path.basename(normalized, path.extname(normalized));
        scores.push({ name, path: normalized });
    };

    for (const p of readJson(path.join(dataDir, "session", "session.json")) || []) add(p);
    for (const entry of readJson(path.join(dataDir, "recent_files.json")) || []) {
        if (typeof entry === "string") add(entry);
        else if (entry && typeof entry === "object") add(entry.path, entry.displayName);
    }
    return scores;
}

/**
 * Turns a window title into { scoreName, partName, filePath }.
 * Score names can themselves contain " - " (e.g. "Song - v9"), so rather than splitting
 * the title we look for a known score whose name the title starts with.
 */
function resolveTitle(title, dataDir) {
    if (HOME_TITLES.test(title.trim())) return null;

    const candidates = knownScores(dataDir)
        .filter((s) => title === s.name || title.startsWith(s.name + " - "))
        // Prefer the longest match so "Song - v9" wins over "Song".
        .sort((a, b) => b.name.length - a.name.length);

    const match = candidates[0];
    if (!match) {
        // A new, never-saved score: we only know its name.
        return { scoreName: title, partName: null, filePath: null };
    }
    const partName = title.length > match.name.length ? title.slice(match.name.length + 3) : null;
    return { scoreName: match.name, partName, filePath: match.path };
}

module.exports = { findProcesses, resolveTitle, HOME_TITLES };
