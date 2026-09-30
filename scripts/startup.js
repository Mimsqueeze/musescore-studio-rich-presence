// Adds or removes a shortcut in the Windows Startup folder so the app starts when you log in.
//   node scripts/startup.js install    add the shortcut and start the app now
//   node scripts/startup.js uninstall  remove the shortcut and stop the app
//   node scripts/startup.js stop       stop the running app
const fs = require("fs");
const path = require("path");
const { execFileSync, spawn } = require("child_process");
const { stopRunning } = require("../src/instance");

const ROOT = path.join(__dirname, "..");
const STARTUP_DIR = path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
const SHORTCUT = path.join(STARTUP_DIR, "MuseScore Studio Rich Presence.lnk");
const POWERSHELL = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

function createShortcut() {
    // Values go through environment variables so paths with spaces or quotes need no escaping.
    const script = `
        $s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK_PATH)
        $s.TargetPath = $env:LNK_TARGET
        $s.Arguments = $env:LNK_ARGS
        $s.WorkingDirectory = $env:LNK_DIR
        $s.WindowStyle = 7
        $s.Description = "Shows your current MuseScore Studio score on Discord"
        $s.Save()`;
    execFileSync(POWERSHELL, ["-NoProfile", "-NonInteractive", "-Command", script], {
        env: {
            ...process.env,
            LNK_PATH: SHORTCUT,
            LNK_TARGET: POWERSHELL,
            LNK_ARGS: `-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${path.join(ROOT, "scripts", "start-hidden.ps1")}" -Node "${process.execPath}"`,
            LNK_DIR: ROOT,
        },
        stdio: "inherit",
    });
}

function startInBackground() {
    spawn(process.execPath, ["src/index.js", "--background"], {
        cwd: ROOT,
        detached: true,
        stdio: "ignore",
        windowsHide: true,
    }).unref();
}

async function main() {
    switch (process.argv[2]) {
        case "install":
            createShortcut();
            console.log(`✓ Added to startup: ${SHORTCUT}`);
            startInBackground();
            console.log("✓ Started in the background. Messages go to logs/presence.log.");
            break;
        case "uninstall":
            if (fs.existsSync(SHORTCUT)) {
                fs.unlinkSync(SHORTCUT);
                console.log("✓ Removed from startup.");
            } else {
                console.log("· It wasn't set to start with Windows.");
            }
            if (await stopRunning()) console.log("✓ Stopped the running copy.");
            break;
        case "stop":
            console.log((await stopRunning()) ? "✓ Stopped." : "· It wasn't running.");
            break;
        default:
            console.log("Usage: node scripts/startup.js <install|uninstall|stop>");
            process.exitCode = 1;
    }
}

main();
