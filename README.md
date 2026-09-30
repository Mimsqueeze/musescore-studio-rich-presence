# MuseScore Studio Rich Presence

Show the score you're working on in [MuseScore Studio](https://musescore.org) as your Discord Rich Presence.

```
Playing MuseScore
Editing Moonlight Sonata
by Ludwig van Beethoven                        ← rotates every 15s
00:42 elapsed
```

The second line rotates through the composer, subtitle, instruments, measure count and time signature, key signature, and tempo.

It runs alongside MuseScore Studio, with nothing to install inside MuseScore and no admin rights needed.

## Setup

1. Install [Node.js](https://nodejs.org/) 18 or newer.
2. Clone this repository and install dependencies:
   ```powershell
   npm install
   ```
3. Start it:
   ```powershell
   npm start
   ```

It runs until you close the terminal or press Ctrl+C. Discord and MuseScore can be started before or after it. When MuseScore closes, the status is cleared.

With several MuseScore windows open, your status follows the one you used most recently. Each score keeps its own elapsed time, so switching back and forth doesn't reset it.

### Start automatically with Windows

```powershell
npm run install-startup
```

This adds a shortcut to your Windows Startup folder and starts the app right away in the background, with no window. Messages go to `logs/presence.log`.

| Command | What it does |
| --- | --- |
| `npm run install-startup` | Start with Windows, and start now |
| `npm run uninstall-startup` | Stop starting with Windows, and stop the running copy |
| `npm run stop` | Stop the running copy, including one started at login |

Only one copy runs at a time. If it's already running in the background, `npm start` tells you so and exits.

If you move this folder or reinstall Node.js, run `npm run install-startup` again to update the shortcut.

## How it works

Everything is read from outside MuseScore:

1. **Which score is open.** MuseScore Studio sets its window title to the open score's name (`Score`, `Score - Part` in a part tab, or `MuseScore Studio` on the Home screen). The title is read with `tasklist`, which works even when MuseScore runs elevated. A small PowerShell helper ([src/foreground.ps1](src/foreground.ps1)) watches which window is in front, so the status can follow the MuseScore window you're using.
2. **Where that score lives.** The title is matched against MuseScore's own `session/session.json` and `recent_files.json` in `%LOCALAPPDATA%\MuseScore\MuseScore4`. This resolves the full path wherever your Documents folder is, including OneDrive, and also covers cloud scores.
3. **Score details.** The `.mscz` file is a zip archive. The score XML inside it is read to get the title, subtitle and composer from the title frame, plus the instruments, measures, time and key signatures, and tempo. Results are cached and refreshed whenever you save.

Because the details come from the saved file, changes show up in your status after you save. The score name updates right away.

## Configuration

Create a `config.json` in the project root to override any default from [src/config.js](src/config.js). For example:

```json
{
  "clientId": "YOUR_DISCORD_APPLICATION_ID",
  "states": ["composer", "instruments", "measures"],
  "privateMode": false
}
```

| Option | Default | Description |
| --- | --- | --- |
| `clientId` | a "MuseScore" app | Discord application ID. Its name is what appears after "Playing". |
| `states` | `["composer", "subtitle", "instruments", "measures", "key", "tempo"]` | Details to rotate through on the second line. |
| `rotateInterval` | `15` | Seconds between rotations. |
| `updateInterval` | `5` | Seconds between checks of MuseScore. |
| `privateMode` | `false` | Show "Composing" instead of the score name. |
| `largeImage` / `largeImageText` | MuseScore Studio icon | Image URL (or asset key) and its hover text. |
| `processNames` | `MuseScore4.exe`, … | Executables to look for. |
| `dataDir` | `%LOCALAPPDATA%\MuseScore\MuseScore4` | Where MuseScore keeps its session and recent-files lists. |

### Showing "Playing MuseScore Studio"

The default application ID shows as **Playing MuseScore**. To use your own name:

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
2. Name it `MuseScore Studio`.
3. Copy its **Application ID** into `config.json` as `clientId`.

## Limitations

- Windows only, for now. The window-title lookup uses `tasklist`.
- Discord shows one status per app, so with several MuseScore windows open, only the most recently used one is shown.
- A new score that hasn't been saved yet shows only its name.
