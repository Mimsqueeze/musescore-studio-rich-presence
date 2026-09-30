// Default settings. Override any of these by creating a config.json in the project root.
const fs = require("fs");
const path = require("path");
const os = require("os");

const DEFAULTS = {
    // Discord application ID. The name of this application is what shows as "Playing ...".
    // The default shows as "MuseScore"; create your own at
    // https://discord.com/developers/applications to show "MuseScore Studio" instead.
    clientId: "577645453429047314",

    // How often to check MuseScore, in seconds. Discord rate-limits presence updates to about one per 15s,
    // but only changed activities are sent, so polling faster just makes switches feel quicker.
    updateInterval: 5,

    // Seconds between rotating the second line through composer, instruments, measures, etc.
    rotateInterval: 15,

    // Which details to rotate through on the second line. Remove any you don't want to share.
    states: ["composer", "subtitle", "instruments", "measures", "key", "tempo"],

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
