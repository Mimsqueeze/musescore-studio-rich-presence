const fs = require("fs");
const path = require("path");
const { Client } = require("@xhayper/discord-rpc");
const { loadConfig } = require("./config");
const { findProcesses, resolveTitle } = require("./musescore");
const { getScoreInfo } = require("./score");
const { watchForeground } = require("./foreground");
const { acquireLock } = require("./instance");

const config = loadConfig();
const RECONNECT_DELAY = 15_000;
const BACKGROUND = process.argv.includes("--background");

let client = null;
let ready = false;
let lastActivityJson = null;
let lastLoggedDetails = null;
let shownPid = null; // MuseScore process currently shown on Discord
let focusedPid = null; // MuseScore process whose window was most recently in the foreground
const startTimes = new Map(); // score key -> when we first saw it open, so switching windows keeps elapsed time

/** When started at login there's no console, so write messages to logs/presence.log instead. */
function logToFile() {
    const logDir = path.join(__dirname, "..", "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const log = fs.createWriteStream(path.join(logDir, "presence.log"), { flags: "w" });
    const write = (...args) => log.write(`[${new Date().toLocaleString()}] ${args.join(" ")}\n`);
    console.log = console.warn = console.error = write;
}

/** Discord requires 2–128 characters for text fields. */
function fit(text) {
    if (!text) return undefined;
    let t = String(text).trim();
    if (t.length > 128) t = t.slice(0, 127) + "…";
    if (t.length < 2) t = `${t} ♪`;
    return t;
}

function describeInstruments(instruments) {
    if (instruments.length === 0) return null;
    const counts = new Map();
    for (const name of instruments) counts.set(name, (counts.get(name) || 0) + 1);
    const names = [...counts].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name));
    if (names.length <= 3) return names.join(", ");
    return `${instruments.length} instruments: ${names.slice(0, 3).join(", ")}, …`;
}

function buildStates(info) {
    if (!info) return [];
    const builders = {
        composer: () => info.composer && `by ${info.composer}`,
        subtitle: () => info.subtitle,
        instruments: () => describeInstruments(info.instruments),
        measures: () =>
            info.measures > 0 &&
            [`${info.measures} measure${info.measures === 1 ? "" : "s"}`, info.timeSignature].filter(Boolean).join(" · "),
        key: () => info.key && `Key: ${info.key}`,
        tempo: () => info.bpm && `♩ = ${info.bpm}`,
    };
    return config.states.map((s) => builders[s]?.()).filter(Boolean);
}

const isMuseScore = (name) =>
    config.processNames.some((p) => p.replace(/\.exe$/i, "").toLowerCase() === name.toLowerCase());

/**
 * Picks the MuseScore window to report on: the one you used most recently,
 * else the one already shown, else any window with a score open.
 */
function pickProcess(windows) {
    const withScore = windows.filter((w) => w.open);
    return (
        windows.find((w) => w.pid === focusedPid) ||
        windows.find((w) => w.pid === shownPid) ||
        withScore[0] ||
        windows[0] ||
        null
    );
}

/** Start time for `key`, forgetting scores that are no longer open anywhere. */
function startTimeFor(key, openKeys) {
    for (const k of startTimes.keys()) if (!openKeys.has(k)) startTimes.delete(k);
    if (!startTimes.has(key)) startTimes.set(key, new Date());
    return startTimes.get(key);
}

async function buildActivity() {
    const windows = (await findProcesses(config.processNames)).map((p) => {
        const open = resolveTitle(p.title, config.dataDir);
        return { ...p, open, key: open ? open.filePath || open.scoreName : `home:${p.pid}` };
    });
    const win = pickProcess(windows);
    shownPid = win?.pid ?? null;
    if (!win) {
        startTimes.clear();
        return null;
    }

    const startTimestamp = startTimeFor(win.key, new Set(windows.map((w) => w.key)));
    const base = {
        largeImageKey: config.largeImage,
        largeImageText: config.largeImageText,
        startTimestamp,
        instance: false,
    };

    const { open } = win;
    if (!open) return { ...base, details: "Browsing scores" };
    if (config.privateMode) return { ...base, details: "Composing" };

    const info = open.filePath ? getScoreInfo(open.filePath) : null;
    const name = info?.title || open.scoreName;
    const states = buildStates(info);
    if (open.partName) states.unshift(`Viewing ${open.partName} part`);

    const rotation = Math.floor(Date.now() / (config.rotateInterval * 1000));
    return {
        ...base,
        details: fit(`Editing ${name}`),
        state: fit(states.length ? states[rotation % states.length] : undefined),
    };
}

let updating = false;
let updateQueued = false;

async function update() {
    if (!ready) return;
    // Focus changes can trigger updates at any time; never run two at once.
    if (updating) {
        updateQueued = true;
        return;
    }
    updating = true;
    try {
        const activity = await buildActivity();
        const json = JSON.stringify(activity);
        if (json !== lastActivityJson) {
            if (activity) {
                await client.user.setActivity(activity);
                // Only log when the score changes, not on every rotation of the second line.
                if (activity.details !== lastLoggedDetails) console.log(`♪ ${activity.details}`);
                lastLoggedDetails = activity.details;
            } else {
                lastLoggedDetails = null;
                await client.user.clearActivity();
                console.log("· MuseScore isn't running; presence cleared.");
            }
            lastActivityJson = json;
        }
    } catch (e) {
        console.error(`X Failed to update presence: ${e.message}`);
    } finally {
        updating = false;
        if (updateQueued) {
            updateQueued = false;
            update();
        }
    }
}

function connect() {
    client = new Client({ clientId: config.clientId });

    client.on("ready", () => {
        ready = true;
        lastActivityJson = null;
        console.log(`✓ Connected to Discord as ${client.user?.username ?? "unknown user"}.`);
        update();
    });

    client.on("disconnected", () => {
        if (!ready) return;
        ready = false;
        console.log(`X Lost connection to Discord. Retrying in ${RECONNECT_DELAY / 1000}s...`);
        setTimeout(connect, RECONNECT_DELAY);
    });

    client.login().catch((e) => {
        ready = false;
        console.log(`X Couldn't connect to Discord (${e.message}). Is Discord running? Retrying in ${RECONNECT_DELAY / 1000}s...`);
        setTimeout(connect, RECONNECT_DELAY);
    });
}

async function shutdown() {
    console.log("Stopping.");
    const wasReady = ready;
    ready = false; // so the disconnect below isn't treated as a lost connection
    try {
        if (wasReady) await client.user.clearActivity();
        await client?.destroy();
    } catch {
        // Exiting anyway.
    }
    process.exit(0);
}

async function main() {
    if (!(await acquireLock(shutdown))) {
        console.log("MuseScore Studio Rich Presence is already running. Use `npm run stop` to stop it.");
        process.exit(0);
    }
    if (BACKGROUND) logToFile();

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    watchForeground(({ pid, name }) => {
        if (pid !== focusedPid && isMuseScore(name)) {
            focusedPid = pid;
            update();
        }
    });

    console.log("Connecting to Discord...");
    connect();
    setInterval(update, config.updateInterval * 1000);
}

main();
