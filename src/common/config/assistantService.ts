/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackendConfig } from '@/common/types/acpTypes';
import { configService } from './configService';

const ASSISTANT_KEY = 'assistants';
const CUSTOM_AGENT_KEY = 'acp.customAgents';

const normalizeList = (items: AcpBackendConfig[] | undefined): AcpBackendConfig[] => {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item) => ({
    ...item,
    enabled: item.enabled ?? true,
  }));
};

export const assistantService = {
  async listAssistants(): Promise<AcpBackendConfig[]> {
    const items = await configService.get(ASSISTANT_KEY);
    return normalizeList(items);
  },

  async saveAssistants(items: AcpBackendConfig[]): Promise<AcpBackendConfig[]> {
    const normalized = normalizeList(items);
    await configService.set(ASSISTANT_KEY, normalized);
    return normalized;
  },

  async upsertAssistant(item: AcpBackendConfig): Promise<AcpBackendConfig[]> {
    const current = await this.listAssistants();
    const next = current.some((agent: AcpBackendConfig) => agent.id === item.id)
      ? current.map((agent: AcpBackendConfig) => (agent.id === item.id ? { ...agent, ...item } : agent))
      : [...current, item];
    return this.saveAssistants(next);
  },

  async removeAssistant(assistantId: string): Promise<AcpBackendConfig[]> {
    const current = await this.listAssistants();
    return this.saveAssistants(current.filter((agent: AcpBackendConfig) => agent.id !== assistantId));
  },

  async listCustomAgents(): Promise<AcpBackendConfig[]> {
    const items = await configService.get(CUSTOM_AGENT_KEY);
    return normalizeList(items);
  },

  async saveCustomAgents(items: AcpBackendConfig[]): Promise<AcpBackendConfig[]> {
    const normalized = normalizeList(items);
    await configService.set(CUSTOM_AGENT_KEY, normalized);
    return normalized;
  },
};
