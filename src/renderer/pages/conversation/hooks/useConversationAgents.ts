/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import useSWR from 'swr';
import { assistantService } from '@/common/config/assistantService';
import type { AcpBackendConfig } from '@/common/types/acpTypes';
import { DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents } from '@/renderer/utils/model/agentTypes';
import type { AvailableAgent } from '@/renderer/utils/model/agentTypes';

export type UseConversationAgentsResult = {
  /** Detected execution engines (acp, extension, remote, aionrs, gemini, etc.) */
  cliAgents: AvailableAgent[];
  /** Preset assistants from config layer */
  presetAssistants: AvailableAgent[];
  /** Loading state */
  isLoading: boolean;
  /** Refresh data */
  refresh: () => Promise<void>;
};

/**
 * Convert a preset assistant config into an AvailableAgent shape.
 */
function configToAvailableAgent(config: AcpBackendConfig): AvailableAgent {
  const backend = config.presetAgentType || 'hermes';
  const conversationType =
    backend === 'gemini' || backend === 'aionrs' || backend === 'hermes'
      ? 'lokcli'
      : backend === 'codex'
        ? 'codex'
        : 'acp';
  return {
    backend,
    name: config.name,
    displayName: config.name,
    customAgentId: config.id,
    isPreset: true,
    context: config.context,
    avatar: config.avatar,
    presetAgentType: config.presetAgentType,
    available: config.enabled !== false,
    teamCapable: !['gemini', 'aionrs', 'claude'].includes(backend),
    conversationType,
  };
}

/**
 * Hook to fetch available CLI agents and preset assistants for the conversation tab dropdown.
 *
 * Two independent data sources:
 *   - Execution engines — from AgentRegistry via IPC (agents.detected)
 *   - Preset assistants — from assistantService/configService
 */
export const useConversationAgents = (): UseConversationAgentsResult => {
  const {
    data: cliAgents,
    isLoading: isLoadingAgents,
    mutate,
  } = useSWR<AvailableAgent[]>(DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents);

  const { data: presetConfigs, isLoading: isLoadingPresets } = useSWR('assistants.presets', async () => {
    return (await assistantService.listPresetAssistants()).filter((a) => a.enabled !== false);
  });

  const presetAssistants = useMemo(() => (presetConfigs || []).map(configToAvailableAgent), [presetConfigs]);

  const refresh = async () => {
    await mutate();
  };

  return {
    cliAgents: cliAgents || [],
    presetAssistants,
    isLoading: isLoadingAgents || isLoadingPresets,
    refresh,
  };
};
