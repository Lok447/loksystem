/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { createWebUiLaunchRequest, parseWebUiLaunchRequest } from '@/process/utils/webuiLaunchRequest';

describe('webuiLaunchRequest helpers', () => {
  it('creates a deploy-launcher request with browser handoff metadata', () => {
    expect(
      createWebUiLaunchRequest(true, {
        preferredPort: 25808,
        allowRemote: true,
        openBrowser: true,
        source: 'deploy-launcher',
      })
    ).toEqual({
      preferredPort: 25808,
      allowRemote: true,
      openBrowser: true,
      source: 'deploy-launcher',
    });
  });

  it('returns null when WebUI launch mode is disabled', () => {
    expect(
      createWebUiLaunchRequest(false, {
        preferredPort: 25808,
        allowRemote: true,
      })
    ).toBeNull();
  });

  it('parses a valid forwarded request payload', () => {
    expect(
      parseWebUiLaunchRequest({
        preferredPort: 3000,
        allowRemote: false,
        openBrowser: true,
        source: 'cli',
      })
    ).toEqual({
      preferredPort: 3000,
      allowRemote: false,
      openBrowser: true,
      source: 'cli',
    });
  });

  it('rejects malformed forwarded request payloads', () => {
    expect(parseWebUiLaunchRequest(null)).toBeNull();
    expect(parseWebUiLaunchRequest({})).toBeNull();
    expect(parseWebUiLaunchRequest({ allowRemote: 'yes' })).toBeNull();
    expect(parseWebUiLaunchRequest({ allowRemote: true, source: 'unknown' })).toBeNull();
  });
});
