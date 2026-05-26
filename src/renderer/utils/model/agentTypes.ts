/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getRendererCoreClient } from '@/common/coreClient';
import { ipcBridge } from '@/common';
import { resolveAgentLogo } from './agentLogo';

/** SWR key for detected execution engines (from AgentRegistry). */
export const DETECTED_AGENTS_SWR_KEY = 'agents.detected';

/**
 * Available agent entry returned by the backend.
 * `backend` is typed as `string` because the IPC layer returns plain strings
 * and the superset includes non-ACP values like `'remote'` and `'aionrs'`.
 */
export type AvailableAgent = {
  backend: string;
  name: string;
  displayName?: string;
  kind?: string;
  available?: boolean;
  teamCapable?: boolean;
  conversationType?: 'acp' | 'aionrs' | 'codex' | 'openclaw-gateway' | 'nanobot' | 'remote' | 'gemini';
  supportedModes?: string[];
  cliPath?: string;
  customAgentId?: string;
  isPreset?: boolean;
  context?: string;
  avatar?: string;
  presetAgentType?: string;
  supportedTransports?: string[];
  isExtension?: boolean;
  extensionName?: string;
  logo?: string | null;
  modelInfo?: {
    currentModelId?: string;
    currentModelLabel?: string;
    availableModelIds?: string[];
  };
};

function inferConversationType(
  backend: string
): 'acp' | 'aionrs' | 'codex' | 'openclaw-gateway' | 'nanobot' | 'remote' | 'gemini' {
  if (backend === 'gemini') return 'gemini';
  if (backend === 'aionrs') return 'aionrs';
  if (backend === 'codex') return 'codex';
  if (backend === 'openclaw-gateway') return 'openclaw-gateway';
  if (backend === 'nanobot') return 'nanobot';
  if (backend === 'remote') return 'remote';
  return 'acp';
}

function normalizeAvailableAgent(agent: AvailableAgent): AvailableAgent {
  return {
    ...agent,
    displayName: agent.displayName || agent.name,
    available: agent.available ?? true,
    teamCapable: agent.teamCapable ?? false,
    conversationType: agent.conversationType || inferConversationType(agent.backend),
    logo:
      agent.logo ??
      resolveAgentLogo({
        backend: agent.backend,
        customAgentId: agent.customAgentId,
        isExtension: agent.isExtension,
      }),
  };
}

/** Shared fetcher for DETECTED_AGENTS_SWR_KEY — single source of truth. */
export async function fetchDetectedAgents(): Promise<AvailableAgent[]> {
  try {
    const resp = await getRendererCoreClient().acp.getAvailableAgents();
    if (resp.success && resp.data) {
      return (resp.data as AvailableAgent[]).map(normalizeAvailableAgent);
    }
  } catch {
    try {
      const legacyResp = await ipcBridge.acpConversation.getAvailableAgents.invoke();
      if (legacyResp.success && legacyResp.data) {
        return (legacyResp.data as AvailableAgent[]).map(normalizeAvailableAgent);
      }
    } catch {
      // fallback to empty
    }
  }
  return [];
}
