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

module.exports = { acquireLock, stopRunning };
