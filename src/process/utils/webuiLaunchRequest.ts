/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type WebUiLaunchRequestSource = 'cli' | 'deploy-launcher';

export interface WebUiLaunchRequest {
  preferredPort?: number;
  allowRemote: boolean;
  openBrowser?: boolean;
  source?: WebUiLaunchRequestSource;
}

const VALID_SOURCES: ReadonlySet<WebUiLaunchRequestSource> = new Set(['cli', 'deploy-launcher']);

export function createWebUiLaunchRequest(
  enabled: boolean,
  options: WebUiLaunchRequest = {
    allowRemote: false,
  }
): WebUiLaunchRequest | null {
  if (!enabled) {
    return null;
  }

  return {
    preferredPort: typeof options.preferredPort === 'number' ? options.preferredPort : undefined,
    allowRemote: options.allowRemote === true,
    openBrowser: options.openBrowser === true,
    source: VALID_SOURCES.has(options.source ?? 'cli') ? (options.source ?? 'cli') : 'cli',
  };
}

export function parseWebUiLaunchRequest(value: unknown): WebUiLaunchRequest | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<WebUiLaunchRequest>;

  if (typeof candidate.allowRemote !== 'boolean') {
    return null;
  }

  if (candidate.preferredPort !== undefined && typeof candidate.preferredPort !== 'number') {
    return null;
  }

  if (candidate.openBrowser !== undefined && typeof candidate.openBrowser !== 'boolean') {
    return null;
  }

  if (candidate.source !== undefined && !VALID_SOURCES.has(candidate.source)) {
    return null;
  }

  return {
    preferredPort: candidate.preferredPort,
    allowRemote: candidate.allowRemote,
    openBrowser: candidate.openBrowser,
    source: candidate.source ?? 'cli',
  };
}
