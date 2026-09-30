// Default settings. Override any of these by creating a config.json in the project root.
const fs = require("fs");
const path = require("path");
const os = require("os");

const DEFAULTS = {
    // Discord application ID. You don't need your own: the name shown is set by `activityName`.
    clientId: "577645453429047314",

    // Shown as "Playing ..." on your profile, in place of the application's own name ("MuseScore").
    activityName: "MuseScore Studio",

    // How often to check MuseScore, in seconds. Discord rate-limits presence updates to about one per 15s,
    // but only changed activities are sent, so polling faster just makes switches feel quicker.
    updateInterval: 5,

    // What the second line (below the title) shows. With one entry it stays fixed; with several it
    // rotates through them every `rotateInterval` seconds. Entries a score doesn't have are skipped.
    // Options: "subtitle", "part", "composer", "instruments", "measures", "key", "tempo".
    states: ["subtitle"],

    // Seconds between rotations of the second line.
    rotateInterval: 15,

    // Hide the score name entirely (shows "Composing" instead).
    privateMode: false,

    largeImage: "https://raw.githubusercontent.com/musescore/MuseScore/main/share/icons/AppIcon/MS4_AppIcon_512x512.png",
    largeImageText: "MuseScore Studio",

    // Executable names to look for. MuseScore Studio 4.x is still MuseScore4.exe.
    processNames: ["MuseScore4.exe", "MuseScore5.exe", "MuseScoreStudio.exe"],

    // Where MuseScore keeps session.json and recent_files.json.
    dataDir: path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "MuseScore", "MuseScore4"),
};

function loadConfig() {
    const file = path.join(__dirname, "..", "config.json");
    if (!fs.existsSync(file)) return { ...DEFAULTS };
    try {
        return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file, "utf8")) };
    } catch (e) {
        console.error(`X config.json is not valid JSON (${e.message}). Using defaults.`);
        return { ...DEFAULTS };
    }
}

module.exports = { loadConfig };
