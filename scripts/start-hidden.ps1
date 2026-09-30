# Run by the Startup folder shortcut: starts the app in the background with no console window.
param([string]$Node = "node")

$root = Split-Path -Parent $PSScriptRoot
Start-Process -FilePath $Node -ArgumentList "src/index.js", "--background" -WorkingDirectory $root -WindowStyle Hidden
