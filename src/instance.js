// Keeps only one copy running (e.g. the startup copy and a manual `npm start`),
// and lets other commands ask the running copy to stop. Uses a named pipe,
// which Windows releases automatically if the process dies.
const net = require("net");

const PIPE = "\\\\.\\pipe\\musescore-studio-rich-presence";

/** Resolves true if this is the only running copy. `onStop` is called when asked to stop. */
function acquireLock(onStop) {
    return new Promise((resolve) => {
        const server = net.createServer((socket) => {
            socket.on("data", (data) => {
                if (data.toString().trim() === "stop") {
                    socket.end("ok");
                    onStop();
                }
            });
            socket.on("error", () => {});
        });
        server.once("error", () => resolve(false));
        server.listen(PIPE, () => resolve(true));
    });
}

/** Asks a running copy to stop. Resolves true if one was running. */
function stopRunning() {
    return new Promise((resolve) => {
        const socket = net.connect(PIPE, () => socket.write("stop"));
        socket.on("data", () => {
            socket.destroy();
            resolve(true);
        });
        socket.on("error", () => resolve(false));
    });
}

/** Resolves true if a copy is currently running. */
function isRunning() {
    return new Promise((resolve) => {
        const socket = net.connect(PIPE, () => {
            socket.destroy();
            resolve(true);
        });
        socket.on("error", () => resolve(false));
    });
}

/** Asks a running copy to stop and waits (up to `timeoutMs`) until it has exited. */
async function stopAndWait(timeoutMs = 10_000) {
    if (!(await stopRunning())) return false;
    const deadline = Date.now() + timeoutMs;
    while ((await isRunning()) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 200));
    }
    return true;
}

module.exports = { acquireLock, stopRunning, stopAndWait };
