/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { providerService } from '@/common/config/providerService';
import { configService } from '@/common/config/configService';
import type { ICreateConversationParams } from '@/common/adapter/ipcBridge';
import type { TProviderWithModel } from '@/common/config/storage';
import type { AcpBackend } from '@/common/types/acpTypes';
import { DEFAULT_CODEX_MODELS } from '@/common/types/codex/codexModels';
import { resolveLocaleKey } from '@/common/utils';
import { loadPresetAssistantResources } from '@/common/utils/presetAssistantResources';
import {
  buildAgentConversationParams,
  getConversationTypeForBackend,
} from '@/common/utils/buildAgentConversationParams';
import type { AvailableAgent } from '@/renderer/utils/model/agentTypes';
import { getAgentModes } from '@/renderer/utils/model/agentModes';

type ModePreference = {
  preferredMode?: string;
  yoloMode?: boolean;
};

const LEGACY_YOLO_MODE_MAP: Partial<Record<string, string>> = {
  claude: 'bypassPermissions',
  codex: 'yolo',
  gemini: 'yolo',
  qwen: 'yolo',
};

function normalizeBackend(backend: string): string {
  return backend === 'gemini' ? 'aionrs' : backend;
}

async function resolvePreferredMode(backend: string): Promise<string | undefined> {
  const normalizedBackend = normalizeBackend(backend);
  const modeOptions = getAgentModes(normalizedBackend);
  if (modeOptions.length === 0) {
    return undefined;
  }

  let preference: ModePreference | undefined;

  if (normalizedBackend === 'aionrs') {
    preference = await configService.get('aionrs.config');
  } else {
    const acpConfig = await configService.get('acp.config');
    preference = acpConfig?.[normalizedBackend as AcpBackend];
  }

  if (
    preference?.preferredMode &&
    modeOptions.some((option) => option.value === preference.preferredMode)
  ) {
    return preference.preferredMode;
  }

  const legacyMode = LEGACY_YOLO_MODE_MAP[backend] ?? LEGACY_YOLO_MODE_MAP[normalizedBackend];
  if (preference?.yoloMode && legacyMode && modeOptions.some((option) => option.value === legacyMode)) {
    return legacyMode;
  }

  return undefined;
}

async function resolvePreferredAcpModelId(backend: string): Promise<string | undefined> {
  const acpConfig = await configService.get('acp.config');
  const backendConfig = acpConfig?.[backend as AcpBackend] as { preferredModelId?: string } | undefined;
  const preferredModelId = backendConfig?.preferredModelId;
  if (typeof preferredModelId === 'string' && preferredModelId.trim().length > 0) {
    return preferredModelId;
  }

  const cachedModels = await configService.get('acp.cachedModels');
  const cachedModelId = cachedModels?.[backend]?.currentModelId;
  if (typeof cachedModelId === 'string' && cachedModelId.trim().length > 0) {
    return cachedModelId;
  }

  if (backend === 'codex' && DEFAULT_CODEX_MODELS.length > 0) {
    return DEFAULT_CODEX_MODELS[0]?.id;
  }

  return undefined;
}

/**
 * Get a model from configured providers that is compatible with aionrs.
 * aionrs supports all platforms via OpenAI-compatible protocol.
 * Throws if no compatible provider is configured.
 */
export async function getDefaultAionrsModel(): Promise<TProviderWithModel> {
  const providers = await providerService.list();

  if (!providers || providers.length === 0) {
    throw new Error('No model provider configured');
  }

  // aionrs supports all platforms via OpenAI-compatible protocol
  const provider = providers.find((p) => p.enabled !== false);
  if (!provider) {
    throw new Error('No enabled model provider for Lok CLI');
  }

  const enabledModel = provider.model.find((m) => provider.modelEnabled?.[m] !== false);

  return {
    id: provider.id,
    platform: provider.platform,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: provider.model,
    useModel: enabledModel || provider.model[0],
    capabilities: provider.capabilities,
    contextLimit: provider.contextLimit,
    modelProtocols: provider.modelProtocols,
    bedrockConfig: provider.bedrockConfig,
    enabled: provider.enabled,
    modelEnabled: provider.modelEnabled,
    modelHealth: provider.modelHealth,
  };
}

/**
 * Legacy compatibility shim for callers that still ask for a Gemini model.
 * Gemini sessions now run through Lok CLI, so they share the same provider resolution.
 */
export async function getDefaultGeminiModel(): Promise<TProviderWithModel> {
  return getDefaultAionrsModel();
}

/**
 * Build ICreateConversationParams for a CLI agent.
 * The backend will automatically fill in derived fields (gateway.cliPath, runtimeValidation, etc.).
 * Lok CLI requires a real provider, so callers must invoke this inside a try block.
 */
export async function buildCliAgentParams(
  agent: AvailableAgent,
  workspace: string
): Promise<ICreateConversationParams> {
  const type = getConversationTypeForBackend(agent.backend);
  const preferredMode = await resolvePreferredMode(agent.backend);
  const preferredAcpModelId = type === 'acp' ? await resolvePreferredAcpModelId(agent.backend) : undefined;

  let model: TProviderWithModel;
  if (type === 'aionrs') {
    // Lok CLI needs a real model from configured providers (anthropic, openai, ali-intl, aws)
    model = await getDefaultAionrsModel();
  } else {
    model = {} as TProviderWithModel;
  }

  return buildAgentConversationParams({
    backend: agent.backend,
    name: agent.name,
    agentName: agent.name,
    workspace,
    cliPath: agent.cliPath,
    customAgentId: agent.customAgentId,
    model,
    sessionMode: preferredMode,
    currentModelId: preferredAcpModelId,
  });
}

/**
 * Build ICreateConversationParams for a preset assistant.
 * Applies 4-layer fallback for reading rules and skills (BUG-1 fix).
 * Uses resolveLocaleKey() to convert i18n.language to standard locale format (BUG-2 fix).
 * Lok CLI preset assistants also require a real provider, so callers must invoke this inside a try block.
 */
export async function buildPresetAssistantParams(
  agent: AvailableAgent,
  workspace: string,
  language: string
): Promise<ICreateConversationParams> {
  const { customAgentId, presetAgentType = 'hermes' } = agent;

  // [BUG-2] Map raw i18n.language to standard locale key
  const localeKey = resolveLocaleKey(language);

  const {
    rules: presetContext,
    enabledSkills,
    disabledBuiltinSkills,
  } = await loadPresetAssistantResources({
    customAgentId,
    localeKey,
  });

  const type = getConversationTypeForBackend(presetAgentType);
  const preferredMode = await resolvePreferredMode(presetAgentType);
  const preferredAcpModelId = type === 'acp' ? await resolvePreferredAcpModelId(presetAgentType) : undefined;
  const model = type === 'aionrs' ? await getDefaultAionrsModel() : ({} as TProviderWithModel);

  return buildAgentConversationParams({
    backend: agent.backend,
    name: agent.name,
    agentName: agent.name,
    workspace,
    customAgentId,
    isPreset: true,
    presetAgentType,
    presetResources: {
      rules: presetContext,
      enabledSkills,
      excludeBuiltinSkills: disabledBuiltinSkills,
    },
    model,
    sessionMode: preferredMode,
    currentModelId: preferredAcpModelId,
  });
}
