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
  productKey?: string;
  runtimeKey?: string;
  isBuiltinRuntime?: boolean;
  kind?: string;
  available?: boolean;
  teamCapable?: boolean;
  conversationType?: 'acp' | 'lokcli' | 'aionrs' | 'codex' | 'openclaw-gateway' | 'nanobot' | 'remote' | 'gemini';
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
): 'acp' | 'lokcli' | 'aionrs' | 'codex' | 'openclaw-gateway' | 'nanobot' | 'remote' | 'gemini' {
  if (backend === 'gemini') return 'lokcli';
  if (backend === 'hermes') return 'lokcli';
  if (backend === 'aionrs') return 'lokcli';
  if (backend === 'codex') return 'codex';
  if (backend === 'openclaw-gateway') return 'openclaw-gateway';
  if (backend === 'nanobot') return 'nanobot';
  if (backend === 'remote') return 'remote';
  return 'acp';
}

function normalizeAvailableAgent(agent: AvailableAgent): AvailableAgent {
  const normalizedConversationType = agent.conversationType || inferConversationType(agent.backend);
  const normalizedProductKey =
    agent.productKey || (normalizedConversationType === 'lokcli' ? 'lokcli' : agent.backend);
  const normalizedRuntimeKey = agent.runtimeKey || agent.backend;

  return {
    ...agent,
    displayName: agent.displayName || agent.name,
    productKey: normalizedProductKey,
    runtimeKey: normalizedRuntimeKey,
    isBuiltinRuntime: agent.isBuiltinRuntime ?? (normalizedProductKey === 'lokcli' && normalizedRuntimeKey === 'hermes'),
    available: agent.available ?? true,
    teamCapable: agent.teamCapable ?? false,
    conversationType: normalizedConversationType,
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
