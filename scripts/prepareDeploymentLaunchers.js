const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath, content, executable = false) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
  if (executable) {
    fs.chmodSync(filePath, 0o755);
  }
}

function buildWindowsPowerShellScript(productFilename) {
  return `param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$CliArgs
)

$ErrorActionPreference = 'Stop'

function Show-Usage {
  Write-Host 'LokSystem one-click WebUI deployment'
  Write-Host ''
  Write-Host 'Usage:'
  Write-Host '  .\\LokSystem-Deploy.ps1 [--remote|--local] [--port <port>] [--browser] [extra args]'
  Write-Host ''
  Write-Host 'Options:'
  Write-Host '  --remote     Bind WebUI to 0.0.0.0 (default)'
  Write-Host '  --local      Bind WebUI to localhost only'
  Write-Host '  --port N     Preferred WebUI port'
  Write-Host '  --browser    Open browser after startup'
  Write-Host '  --help       Show this message'
  Write-Host ''
  Write-Host 'Examples:'
  Write-Host '  .\\LokSystem-Deploy.ps1'
  Write-Host '  .\\LokSystem-Deploy.ps1 --local --port 3000'
}

$script:UseRemote = $true
$script:OpenBrowser = $false
$script:Port = $null
$passthrough = New-Object System.Collections.Generic.List[string]

for ($i = 0; $i -lt $CliArgs.Length; $i++) {
  $arg = $CliArgs[$i]
  switch -Regex ($arg) {
    '^--help$|^-h$' {
      Show-Usage
      exit 0
    }
    '^--local$' {
      $script:UseRemote = $false
      continue
    }
    '^--remote$' {
      $script:UseRemote = $true
      continue
    }
    '^--browser$' {
      $script:OpenBrowser = $true
      continue
    }
    '^--port=(.+)$' {
      $script:Port = $Matches[1]
      continue
    }
    '^--port$' {
      if ($i + 1 -ge $CliArgs.Length) {
        throw 'Missing value for --port'
      }
      $i++
      $script:Port = $CliArgs[$i]
      continue
    }
    default {
      $passthrough.Add($arg) | Out-Null
    }
  }
}

$exePath = Join-Path $PSScriptRoot '${productFilename}.exe'
if (-not (Test-Path -LiteralPath $exePath)) {
  throw "Unable to find executable: $exePath"
}

$launchArgs = New-Object System.Collections.Generic.List[string]
$launchArgs.Add('--webui') | Out-Null
if ($script:UseRemote) {
  $launchArgs.Add('--remote') | Out-Null
}
if ($script:Port) {
  $launchArgs.Add('--port') | Out-Null
  $launchArgs.Add($script:Port) | Out-Null
}
foreach ($item in $passthrough) {
  $launchArgs.Add($item) | Out-Null
}

$browserUrl = if ($script:Port) { "http://localhost:$($script:Port)" } else { 'http://localhost:25808' }

Write-Host 'Starting LokSystem WebUI deployment...'
Write-Host "Executable: $exePath"
Write-Host "Args: $($launchArgs -join ' ')"
Write-Host 'Stop the deployment with Ctrl+C.'

if ($script:OpenBrowser) {
  Start-Job -ScriptBlock {
    param($url)
    Start-Sleep -Seconds 4
    try {
      Start-Process $url | Out-Null
    } catch {
    }
  } -ArgumentList $browserUrl | Out-Null
}

& $exePath @launchArgs
exit $LASTEXITCODE
`;
}

function buildWindowsCmdScript() {
  return `@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0LokSystem-Deploy.ps1" %*
exit /b %ERRORLEVEL%
`;
}

function buildMacShellScript(productFilename) {
  return `#!/bin/bash
set -euo pipefail

show_usage() {
  cat <<'EOF'
LokSystem one-click WebUI deployment

Usage:
  ./loksystem-deploy.sh [--remote|--local] [--port <port>] [--browser] [extra args]

Options:
  --remote     Bind WebUI to 0.0.0.0 (default)
  --local      Bind WebUI to localhost only
  --port N     Preferred WebUI port
  --browser    Open browser after startup
  --help       Show this message

Examples:
  ./loksystem-deploy.sh
  ./loksystem-deploy.sh --local --port 3000
EOF
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_BIN="$SCRIPT_DIR/${productFilename}"

if [[ ! -x "$APP_BIN" ]]; then
  echo "Unable to find executable: $APP_BIN" >&2
  exit 1
fi

USE_REMOTE=1
OPEN_BROWSER=0
PORT=""
PASSTHROUGH=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      show_usage
      exit 0
      ;;
    --local)
      USE_REMOTE=0
      shift
      ;;
    --remote)
      USE_REMOTE=1
      shift
      ;;
    --browser)
      OPEN_BROWSER=1
      shift
      ;;
    --port=*)
      PORT="\${1#*=}"
      shift
      ;;
    --port)
      if [[ $# -lt 2 ]]; then
        echo 'Missing value for --port' >&2
        exit 1
      fi
      PORT="$2"
      shift 2
      ;;
    *)
      PASSTHROUGH+=("$1")
      shift
      ;;
  esac
done

LAUNCH_ARGS=(--webui)
if [[ "$USE_REMOTE" -eq 1 ]]; then
  LAUNCH_ARGS+=(--remote)
fi
if [[ -n "$PORT" ]]; then
  LAUNCH_ARGS+=(--port "$PORT")
fi
if [[ "\${#PASSTHROUGH[@]}" -gt 0 ]]; then
  LAUNCH_ARGS+=("\${PASSTHROUGH[@]}")
fi

echo 'Starting LokSystem WebUI deployment...'
echo "Executable: $APP_BIN"
echo "Args: \${LAUNCH_ARGS[*]}"
echo 'Stop the deployment with Ctrl+C.'

if [[ "$OPEN_BROWSER" -eq 1 ]]; then
  BROWSER_PORT="$PORT"
  if [[ -z "$BROWSER_PORT" ]]; then
    BROWSER_PORT="25808"
  fi
  (
    sleep 4
    open "http://localhost:$BROWSER_PORT" >/dev/null 2>&1 || true
  ) &
fi

exec "$APP_BIN" "\${LAUNCH_ARGS[@]}"
`;
}

function buildMacCommandScript() {
  return `#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$SCRIPT_DIR/loksystem-deploy.sh" "$@"
`;
}

function buildReadme(platform) {
  const launchers =
    platform === 'win32'
      ? ['LokSystem-Deploy.ps1', 'LokSystem-Deploy.cmd']
      : ['loksystem-deploy.sh', 'loksystem-deploy.command'];

  return `LokSystem terminal deployment helpers

These launchers start LokSystem in WebUI deployment mode.

Included launchers:
  - ${launchers.join('\n  - ')}

Default behavior:
  - starts WebUI mode
  - enables remote access by default
  - keeps logs in the current terminal

Common options:
  --local      Bind to localhost only
  --remote     Bind to 0.0.0.0 (default)
  --port N     Preferred port
  --browser    Open the browser after startup
  --help       Show built-in help

Examples:
  Windows PowerShell:
    .\\LokSystem-Deploy.ps1 --port 25808

  Windows CMD:
    LokSystem-Deploy.cmd --local --port 3000

  macOS zsh/bash:
    ./loksystem-deploy.sh --port 25808
    ./loksystem-deploy.command --browser
`;
}

function prepareDeploymentLaunchers(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  const productFilename = packager?.appInfo?.productFilename || 'LokSystem';

  if (electronPlatformName === 'win32') {
    writeFile(path.join(appOutDir, 'LokSystem-Deploy.ps1'), buildWindowsPowerShellScript(productFilename));
    writeFile(path.join(appOutDir, 'LokSystem-Deploy.cmd'), buildWindowsCmdScript());
    writeFile(path.join(appOutDir, 'LokSystem-Deploy-README.txt'), buildReadme('win32'));
    console.log('Prepared Windows terminal deployment launchers');
    return;
  }

  if (electronPlatformName === 'darwin') {
    const macOsDir = path.join(appOutDir, `${productFilename}.app`, 'Contents', 'MacOS');
    writeFile(path.join(macOsDir, 'loksystem-deploy.sh'), buildMacShellScript(productFilename), true);
    writeFile(path.join(macOsDir, 'loksystem-deploy.command'), buildMacCommandScript(), true);
    writeFile(path.join(macOsDir, 'LokSystem-Deploy-README.txt'), buildReadme('darwin'));
    console.log('Prepared macOS terminal deployment launchers');
  }
}

module.exports = prepareDeploymentLaunchers;
