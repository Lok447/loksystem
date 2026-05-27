/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageState = vi.hoisted(() => ({} as Record<string, unknown>));
const getMock = vi.hoisted(() => vi.fn(async (key: string) => storageState[key]));
const setMock = vi.hoisted(() =>
  vi.fn(async (key: string, value: unknown) => {
    storageState[key] = value;
  })
);
const removeMock = vi.hoisted(() =>
  vi.fn(async (key: string) => {
    delete storageState[key];
  })
);

vi.mock('../../src/common/config/storage', async () => {
  const actual = await vi.importActual<typeof import('../../src/common/config/storage')>(
    '../../src/common/config/storage'
  );
  return {
    ...actual,
    ConfigStorage: {
      get: getMock,
      set: setMock,
      remove: removeMock,
    },
  };
});

import { providerService } from '../../src/common/config/providerService';
import { assistantService } from '../../src/common/config/assistantService';
import { configService } from '../../src/common/config/configService';

describe('config-backed services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(storageState)) {
      delete storageState[key];
    }
    configService.clearCache();
  });

  it('providerService.updateModelHealth updates a single model health entry without dropping others', async () => {
    storageState['model.config'] = [
      {
        id: 'openai',
        name: 'OpenAI',
        platform: 'openai',
        enabled: true,
        model: ['gpt-4.1', 'gpt-4o'],
        modelHealth: {
          'gpt-4o': { status: 'healthy', lastCheck: 1, latency: 100 },
        },
      },
    ];

    const updated = await providerService.updateModelHealth('openai', 'gpt-4.1', {
      status: 'unhealthy',
      lastCheck: 2,
      latency: 300,
      error: 'timeout',
    });

    expect(updated[0].modelHealth?.['gpt-4o']).toEqual({ status: 'healthy', lastCheck: 1, latency: 100 });
    expect(updated[0].modelHealth?.['gpt-4.1']).toEqual({
      status: 'unhealthy',
      lastCheck: 2,
      latency: 300,
      error: 'timeout',
    });
  });

  it('providerService.clearAllModelHealth clears health data for all providers', async () => {
    storageState['model.config'] = [
      {
        id: 'openai',
        name: 'OpenAI',
        platform: 'openai',
        enabled: true,
        model: ['gpt-4.1'],
        modelHealth: {
          'gpt-4.1': { status: 'healthy', lastCheck: 1, latency: 100 },
        },
      },
    ];

    const updated = await providerService.clearAllModelHealth();

    expect(updated[0].modelHealth).toBeUndefined();
  });

  it('assistantService.findAssistantLikeById searches presets and custom agents', async () => {
    storageState.assistants = [{ id: 'builtin-coder', name: 'Coder', isPreset: true, enabled: true }];
    storageState['acp.customAgents'] = [{ id: 'custom-1', name: 'Custom 1', enabled: true }];

    await expect(assistantService.findAssistantLikeById('builtin-coder')).resolves.toMatchObject({
      id: 'builtin-coder',
    });
    await expect(assistantService.findAssistantLikeById('custom-1')).resolves.toMatchObject({ id: 'custom-1' });
    await expect(assistantService.findAssistantLikeById('missing')).resolves.toBeUndefined();
  });

  it('assistantService.updateCustomAgent updates a single custom agent in place', async () => {
    storageState['acp.customAgents'] = [
      { id: 'custom-1', name: 'Custom 1', enabled: true },
      { id: 'custom-2', name: 'Custom 2', enabled: true },
    ];

    const updated = await assistantService.updateCustomAgent('custom-2', (agent) => ({ ...agent, enabled: false }));

    expect(updated).toEqual([
      { id: 'custom-1', name: 'Custom 1', enabled: true },
      { id: 'custom-2', name: 'Custom 2', enabled: false },
    ]);
  });

  it('configService caches and refreshes storage values', async () => {
    storageState.language = 'zh-CN';

    await expect(configService.get('language')).resolves.toBe('zh-CN');
    storageState.language = 'en-US';
    await expect(configService.get('language')).resolves.toBe('zh-CN');
    await expect(configService.refresh('language')).resolves.toBe('en-US');
  });
});
