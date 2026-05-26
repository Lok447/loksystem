/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SpeechToTextConfig, SpeechToTextProvider } from '@/common/types/speech';

export const SPEECH_TO_TEXT_CONFIG_CHANGED_EVENT = 'loksystem:speech-to-text-config-changed';

export const DEFAULT_SPEECH_TO_TEXT_CONFIG: SpeechToTextConfig = {
  enabled: true,
  provider: 'builtin',
  builtin: {
    locale: '',
  },
  openai: {
    apiKey: '',
    baseUrl: '',
    language: '',
    model: 'whisper-1',
  },
  deepgram: {
    apiKey: '',
    baseUrl: '',
    detectLanguage: true,
    language: '',
    model: 'nova-2',
    punctuate: true,
    smartFormat: true,
  },
};

export type SpeechToTextConfigIssueCode =
  | 'disabled'
  | 'missing-api-key'
  | 'missing-model'
  | 'invalid-base-url';

export type SpeechToTextConfigReadiness = {
  code: SpeechToTextConfigIssueCode | null;
  message: string | null;
  provider: SpeechToTextProvider;
  ready: boolean;
};

export const normalizeSpeechToTextConfig = (config?: SpeechToTextConfig): SpeechToTextConfig => ({
  ...DEFAULT_SPEECH_TO_TEXT_CONFIG,
  ...config,
  builtin: {
    ...DEFAULT_SPEECH_TO_TEXT_CONFIG.builtin,
    ...config?.builtin,
  },
  openai: {
    ...DEFAULT_SPEECH_TO_TEXT_CONFIG.openai,
    ...config?.openai,
  },
  deepgram: {
    ...DEFAULT_SPEECH_TO_TEXT_CONFIG.deepgram,
    ...config?.deepgram,
  },
});

const buildReadiness = (
  provider: SpeechToTextProvider,
  ready: boolean,
  code: SpeechToTextConfigIssueCode | null,
  message: string | null
): SpeechToTextConfigReadiness => ({
  code,
  message,
  provider,
  ready,
});

const isValidSpeechToTextBaseUrl = (value?: string): boolean => {
  const candidate = value?.trim();
  if (!candidate) return true;

  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const validateSpeechToTextConfig = (config?: SpeechToTextConfig): SpeechToTextConfigReadiness => {
  const normalized = normalizeSpeechToTextConfig(config);

  if (!normalized.enabled) {
    return buildReadiness(
      normalized.provider,
      false,
      'disabled',
      'Speech to text is turned off. Enable it in Settings > Tools before trying again.'
    );
  }

  if (normalized.provider === 'builtin') {
    return buildReadiness('builtin', true, null, null);
  }

  const providerConfig = normalized[normalized.provider];
  if (!providerConfig?.apiKey?.trim()) {
    return buildReadiness(
      normalized.provider,
      false,
      'missing-api-key',
      `${normalized.provider === 'openai' ? 'OpenAI Whisper' : 'Deepgram'} API key is missing. Complete the provider setup in Settings > Tools.`
    );
  }

  if (!providerConfig.model?.trim()) {
    return buildReadiness(
      normalized.provider,
      false,
      'missing-model',
      `${normalized.provider === 'openai' ? 'OpenAI Whisper' : 'Deepgram'} model is missing. Pick a model in Settings > Tools before starting speech input.`
    );
  }

  if (!isValidSpeechToTextBaseUrl(providerConfig.baseUrl)) {
    return buildReadiness(
      normalized.provider,
      false,
      'invalid-base-url',
      `${normalized.provider === 'openai' ? 'OpenAI Whisper' : 'Deepgram'} Base URL must be a valid http(s) address.`
    );
  }

  return buildReadiness(normalized.provider, true, null, null);
};
