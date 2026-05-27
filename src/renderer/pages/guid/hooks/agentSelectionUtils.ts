/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import type { AcpBackendAll } from '@/common/types/acpTypes';
import type { AcpBackend } from '../types';

/** Save preferred mode to the agent's own config key */
export async function savePreferredMode(agentKey: string, mode: string): Promise<void> {
  try {
    if (agentKey === 'gemini') {
      const config = await configService.get('gemini.config');
      await configService.set('gemini.config', { ...config, preferredMode: mode });
    } else if (agentKey === 'aionrs') {
      const config = await configService.get('aionrs.config');
      await configService.set('aionrs.config', { ...config, preferredMode: mode });
    } else if (agentKey !== 'custom') {
      const config = await configService.get('acp.config');
      const backendConfig = config?.[agentKey as AcpBackendAll] || {};
      await configService.set('acp.config', { ...config, [agentKey]: { ...backendConfig, preferredMode: mode } });
    }
  } catch {
    /* silent */
  }
}

/** Save preferred model ID to the agent's acp.config key */
export async function savePreferredModelId(agentKey: string, modelId: string): Promise<void> {
  try {
    const config = await configService.get('acp.config');
    const backendConfig = config?.[agentKey as AcpBackendAll] || {};
    await configService.set('acp.config', { ...config, [agentKey]: { ...backendConfig, preferredModelId: modelId } });
  } catch {
    /* silent */
  }
}

/**
 * Get agent key for selection.
 * Returns "custom:uuid" for custom agents, "remote:uuid" for remote agents, backend type for others.
 */
export const getAgentKey = (agent: { backend: AcpBackend; customAgentId?: string; isPreset?: boolean }): string => {
  if (agent.backend === 'remote' && agent.customAgentId) return `remote:${agent.customAgentId}`;
  if (agent.customAgentId) return `custom:${agent.customAgentId}`;
  return agent.backend;
};
