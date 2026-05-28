/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import os from 'node:os';

function getBinaryName(): string {
  return process.platform === 'win32' ? 'hermes.exe' : 'hermes';
}

function getBundledRuntimeBinaryPath(resourcesPath: string): string {
  const runtimeKey = `${process.platform}-${process.arch}`;
  const runtimeDir = join(resourcesPath, 'bundled-hermes', runtimeKey);
  const binSegments = process.platform === 'win32' ? ['Scripts', getBinaryName()] : ['bin', getBinaryName()];
  return join(runtimeDir, ...binSegments);
}

/**
 * Resolve the bundled/default Hermes runtime for LokCLI.
 *
 * Migration note:
 * - User-facing flows should treat this runtime as "LokCLI"
 * - `hermes` remains the internal default runtime/backend
 * - `aionrs` is being phased down to a compatibility role
 *
 * Search order:
 *  1. Explicit override via HERMES_CLI_PATH
 *  2. Bundled binary inside packaged app resources
 *  3. Historical local venv location
 *  4. System PATH
 */
export function resolveHermesBinary(): string | null {
  const explicitPath = process.env.HERMES_CLI_PATH;
  if (explicitPath && existsSync(explicitPath)) {
    return explicitPath;
  }

  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    const bundled = getBundledRuntimeBinaryPath(resourcesPath);
    if (existsSync(bundled)) {
      return bundled;
    }
  }

  const legacyVenv = join(
    os.homedir(),
    'hermes-agent-main',
    '.venv',
    process.platform === 'win32' ? 'Scripts' : 'bin',
    getBinaryName()
  );
  if (existsSync(legacyVenv)) {
    return legacyVenv;
  }

  try {
    const cmd = process.platform === 'win32' ? 'where hermes' : 'which hermes';
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
    if (result && existsSync(result)) {
      return result;
    }
  } catch {
    // not found in PATH
  }

  return null;
}

export function isHermesAvailable(): boolean {
  return resolveHermesBinary() !== null;
}
