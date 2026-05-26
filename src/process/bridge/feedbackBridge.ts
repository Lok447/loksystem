/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * IPC handler for collecting and compressing recent log files
 * for the bug report feature.
 */

import { ipcMain, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import os from 'os';
import { getOrCreateAnalyticsId } from '@process/utils/analyticsId';

/**
 * Get log file paths for the last N days.
 * Log files are named YYYY-MM-DD.log by electron-log.
 */
const getRecentLogPaths = (logsDir: string, days: number): string[] => {
  const paths: string[] = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const filename = `${date.toISOString().slice(0, 10)}.log`;
    const filePath = path.join(logsDir, filename);
    if (fs.existsSync(filePath)) {
      paths.push(filePath);
    }
  }

  return paths;
};

const LOG_DAYS = 3;

const SENSITIVE_PATTERNS = [
  /(api[_-]?key\s*[:=]\s*)([^\s'"]+)/gi,
  /(authorization\s*[:=]\s*bearer\s+)([^\s'"]+)/gi,
  /(auth[_-]?token\s*[:=]\s*)([^\s'"]+)/gi,
  /(password\s*[:=]\s*)([^\s'"]+)/gi,
];

function sanitizeLogContent(content: string): string {
  return SENSITIVE_PATTERNS.reduce((current, pattern) => current.replace(pattern, '$1[REDACTED]'), content);
}

function collectCandidateLogDirs(): string[] {
  const userDataDir = app.getPath('userData');
  const logsDir = (() => {
    try {
      return app.getPath('logs');
    } catch {
      return path.join(userDataDir, 'logs');
    }
  })();

  return Array.from(
    new Set([
      logsDir,
      path.join(userDataDir, 'logs'),
      path.join(userDataDir, 'aionrs', 'logs'),
      path.join(userDataDir, 'core', 'logs'),
      path.join(userDataDir, 'webui', 'logs'),
    ])
  );
}

function collectLogFiles(days: number): Array<{ label: string; filePath: string }> {
  const entries: Array<{ label: string; filePath: string }> = [];

  for (const dir of collectCandidateLogDirs()) {
    if (!fs.existsSync(dir)) continue;

    for (const logPath of getRecentLogPaths(dir, days)) {
      if (entries.some((entry) => entry.filePath === logPath)) continue;
      entries.push({
        label: path.relative(app.getPath('userData'), logPath) || path.basename(logPath),
        filePath: logPath,
      });
    }

    for (const file of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, file);
      if (!fs.statSync(fullPath).isFile()) continue;
      if (!/\.(log|txt)$/i.test(file)) continue;
      if (entries.some((entry) => entry.filePath === fullPath)) continue;
      entries.push({
        label: path.relative(app.getPath('userData'), fullPath) || file,
        filePath: fullPath,
      });
    }
  }

  return entries;
}

ipcMain.handle('feedback:collect-logs', async () => {
  try {
    const logEntries = collectLogFiles(LOG_DAYS);
    if (logEntries.length === 0) {
      return null;
    }

    // Read and concatenate all log files with date headers
    const parts: string[] = [];
    for (const entry of logEntries) {
      const content = sanitizeLogContent(fs.readFileSync(entry.filePath, 'utf-8'));
      parts.push(`=== ${entry.label} ===\n${content}\n`);
    }

    const metadata = {
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      hostname: os.hostname(),
      releaseChannel: app.isPackaged ? 'production' : 'development',
      mode: process.argv.includes('--webui') ? 'webui' : 'desktop',
      deviceId: getOrCreateAnalyticsId(),
      collectedAt: new Date().toISOString(),
      files: logEntries.map((entry) => entry.label),
    };

    parts.unshift(`=== metadata.json ===\n${JSON.stringify(metadata, null, 2)}\n`);

    const combined = parts.join('\n');
    const compressed = zlib.gzipSync(Buffer.from(combined, 'utf-8'));

    // Return as number array for IPC serialization (Buffer is not serializable)
    return {
      filename: 'logs.gz',
      data: Array.from(compressed),
      metadata,
    };
  } catch (error) {
    console.error('[feedbackBridge] Failed to collect logs:', error);
    return null;
  }
});
