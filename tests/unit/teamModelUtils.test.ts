/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { IProvider } from '../../src/common/config/storage';
import type { AcpModelInfo } from '../../src/common/types/acpTypes';
import {
  getTeamAvailableModels,
  getTeamDefaultModelId,
  resolveTeamModelLabel,
} from '../../src/common/utils/teamModelUtils';

function makeAcpModelInfo(overrides: Partial<AcpModelInfo> = {}): AcpModelInfo {
  return {
    currentModelId: null,
    currentModelLabel: null,
    availableModels: [],
    canSwitch: true,
    source: 'models',
    ...overrides,
  };
}

function makeProvider(overrides: Partial<IProvider> & { platform: string; model: string[] }): IProvider {
  return {
    id: 'provider',
    name: 'Provider',
    baseUrl: '',
    apiKey: '',
    enabled: true,
    ...overrides,
  };
}

describe('getTeamAvailableModels', () => {
  it('returns cached ACP models when available', () => {
    const cachedModels: Record<string, AcpModelInfo> = {
      claude: makeAcpModelInfo({
        availableModels: [{ id: 'claude-sonnet-4', label: 'Claude Sonnet 4' }],
      }),
    };

    expect(getTeamAvailableModels('claude', cachedModels, [])).toEqual([
      { id: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
    ]);
  });

  it('uses the shared provider-backed list for legacy gemini backend', () => {
    const providers: IProvider[] = [
      makeProvider({
        id: 'gemini-api',
        platform: 'gemini',
        model: ['gemini-2.5-pro', 'flux-schnell'],
      }),
      makeProvider({
        id: 'openai',
        platform: 'openai-compatible',
        model: ['gpt-4o'],
      }),
    ];

    expect(getTeamAvailableModels('gemini', {}, providers)).toEqual([
      { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
      { id: 'gpt-4o', label: 'gpt-4o' },
    ]);
  });

  it('uses the same filtered provider list for aionrs backend', () => {
    const providers: IProvider[] = [
      makeProvider({
        id: 'p1',
        platform: 'openai-compatible',
        model: ['gpt-4o', 'gpt-4o-mini'],
      }),
      makeProvider({
        id: 'p2',
        platform: 'openai-compatible',
        model: ['gpt-4o', 'custom-model'],
      }),
    ];

    expect(getTeamAvailableModels('aionrs', {}, providers)).toEqual([
      { id: 'gpt-4o', label: 'gpt-4o' },
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
      { id: 'custom-model', label: 'custom-model' },
    ]);
  });

  it('filters disabled models and models excluded from primary usage', () => {
    const providers: IProvider[] = [
      makeProvider({
        platform: 'gemini',
        model: ['gemini-2.5-pro', 'gemini-2.0-flash', 'dall-e-3'],
        modelEnabled: { 'gemini-2.5-pro': true, 'gemini-2.0-flash': false, 'dall-e-3': true },
      }),
    ];

    expect(getTeamAvailableModels('gemini', {}, providers)).toEqual([
      { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
    ]);
  });

  it('returns an empty list for unsupported backends or missing providers', () => {
    expect(getTeamAvailableModels('custom', {}, [])).toEqual([]);
    expect(getTeamAvailableModels('gemini', {}, null)).toEqual([]);
    expect(getTeamAvailableModels('aionrs', {}, undefined)).toEqual([]);
  });
});

describe('getTeamDefaultModelId', () => {
  it('prefers acp preferredModelId over cached currentModelId', () => {
    const acpConfig = { claude: { preferredModelId: 'claude-sonnet-4' } };
    const cachedModels: Record<string, AcpModelInfo> = {
      claude: makeAcpModelInfo({ currentModelId: 'claude-haiku-3.5' }),
    };

    expect(getTeamDefaultModelId('claude', cachedModels, acpConfig)).toBe('claude-sonnet-4');
  });

  it('falls back to cached currentModelId when no preferred model is set', () => {
    const cachedModels: Record<string, AcpModelInfo> = {
      claude: makeAcpModelInfo({ currentModelId: 'claude-haiku-3.5' }),
    };

    expect(getTeamDefaultModelId('claude', cachedModels, { claude: {} })).toBe('claude-haiku-3.5');
    expect(getTeamDefaultModelId('unknown', cachedModels, { claude: {} })).toBeUndefined();
  });
});

describe('resolveTeamModelLabel', () => {
  it('returns the ACP label when present', () => {
    const cachedModels: Record<string, AcpModelInfo> = {
      claude: makeAcpModelInfo({
        availableModels: [{ id: 'claude-sonnet-4', label: 'Claude Sonnet 4' }],
      }),
    };

    expect(resolveTeamModelLabel('claude-sonnet-4', 'claude', cachedModels)).toBe('Claude Sonnet 4');
  });

  it('falls back to the raw model id or default placeholder', () => {
    expect(resolveTeamModelLabel('gemini-2.5-pro', 'gemini', null)).toBe('gemini-2.5-pro');
    expect(resolveTeamModelLabel(undefined, 'claude', null)).toBe('(default)');
  });
});
