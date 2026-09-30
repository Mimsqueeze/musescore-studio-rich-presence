# Prints "<pid>`t<process name>" each time the foreground window changes.
# Started by foreground.js; exits on its own when the Node process that started it goes away.
param([int]$ParentPid)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Foreground {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@

$last = -1
while ($true) {
    if ($ParentPid -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { exit }

    $procId = [uint32]0
    [void][Foreground]::GetWindowThreadProcessId([Foreground]::GetForegroundWindow(), [ref]$procId)
    if ($procId -ne $last) {
        $last = $procId
        $name = ""
        try { $name = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch {}
        [Console]::Out.WriteLine("$procId`t$name")
        [Console]::Out.Flush()
    }
    Start-Sleep -Milliseconds 500
}
