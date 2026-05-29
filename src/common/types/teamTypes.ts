// Shared team types used by both main process and renderer.
// Renderer code should import from here instead of @process/team/types.

import type { AcpInitializeResult } from './acpTypes';
import {
  TeamCapabilityResolver,
  type TeamBackendCapabilities,
  type TeamCapabilityOverrides,
  type TeamBackendMaturity,
  type TeamExecutionKind,
  type TeamRecommendedMode,
} from '@/common/team/TeamCapabilityResolver';

export type { TeamExecutionKind, TeamRecommendedMode, TeamBackendMaturity, TeamBackendCapabilities, TeamCapabilityOverrides };

export function getTeamBackendCapabilities(
  backend: string,
  cachedInitResults: Record<string, AcpInitializeResult> | null | undefined,
  overrides?: TeamCapabilityOverrides | null
): TeamBackendCapabilities {
  return TeamCapabilityResolver.resolve(backend, cachedInitResults, overrides);
}

/**
 * Conservative check used by the current team runtime.
 * Phase 0 exposes richer capability data without enabling future gateway/managed
 * modes in the existing implementation yet.
 */
export function isTeamCapableBackend(
  backend: string,
  cachedInitResults: Record<string, AcpInitializeResult> | null | undefined,
  overrides?: TeamCapabilityOverrides | null
): boolean {
  return TeamCapabilityResolver.isCurrentlySupported(backend, cachedInitResults, overrides);
}

/**
 * Get backends that are currently selectable by the existing team runtime.
 */
export function getTeamCapableBackends(
  detectedBackends: string[],
  cachedInitResults: Record<string, AcpInitializeResult> | null | undefined,
  overrides?: TeamCapabilityOverrides | null
): string[] {
  return TeamCapabilityResolver.getCurrentlySupportedBackends(detectedBackends, cachedInitResults, overrides);
}

/** Role of a teammate within a team */
export type TeammateRole = 'leader' | 'teammate';

/** Lifecycle status of a teammate agent */
export type TeammateStatus = 'pending' | 'idle' | 'active' | 'completed' | 'failed';

/** Workspace sharing strategy for the team */
export type WorkspaceMode = 'shared' | 'isolated';

export type TeamOrchestrationMode =
  | 'native_orchestrator'
  | 'protocol_coordinated'
  | 'gateway_coordinated'
  | 'managed_mailbox'
  | 'legacy_mailbox';

export type TeamExecutionEngineId = 'legacy_mailbox' | 'hermes_native' | 'protocol' | 'gateway' | 'managed';

/** Persisted agent configuration within a team */
export type TeamAgent = {
  slotId: string;
  conversationId: string;
  role: TeammateRole;
  agentType: string;
  agentName: string;
  conversationType: 'gemini' | 'acp' | 'codex' | 'lokcli' | 'aionrs' | 'openclaw-gateway' | 'nanobot' | 'remote';
  status: TeammateStatus;
  cliPath?: string;
  customAgentId?: string;
  model?: string;
};

/** Persisted team record (stored in SQLite `teams` table) */
export type TTeam = {
  id: string;
  userId: string;
  name: string;
  workspace: string;
  workspaceMode: WorkspaceMode;
  leaderAgentId: string;
  agents: TeamAgent[];
  orchestrationMode?: TeamOrchestrationMode;
  executionEngine?: TeamExecutionEngineId;
  /** Current session permission mode (e.g. 'plan', 'auto'). Persisted so newly spawned agents inherit it. */
  sessionMode?: string;
  createdAt: number;
  updatedAt: number;
};

/** IPC event pushed to renderer when agent status changes */
export type ITeamAgentStatusEvent = {
  teamId: string;
  slotId: string;
  status: TeammateStatus;
  lastMessage?: string;
};

/** IPC event pushed to renderer when a new agent is spawned at runtime */
export type ITeamAgentSpawnedEvent = {
  teamId: string;
  agent: TeamAgent;
};

/** IPC event pushed to renderer when an agent is removed from the team */
export type ITeamAgentRemovedEvent = {
  teamId: string;
  slotId: string;
};

/** IPC event pushed to renderer when an agent is renamed */
export type ITeamAgentRenamedEvent = {
  teamId: string;
  slotId: string;
  oldName: string;
  newName: string;
};

/** IPC event pushed to renderer when the team list changes (created/removed/agent changes) */
export type ITeamListChangedEvent = {
  teamId: string;
  action: 'created' | 'removed' | 'agent_added' | 'agent_removed';
};

/** IPC event for streaming agent messages to renderer */
export type ITeamMessageEvent = {
  teamId: string;
  slotId: string;
  type: string;
  data: unknown;
  msg_id: string;
  conversation_id: string;
};

/** Phase of the MCP injection pipeline */
export type TeamMcpPhase =
  | 'tcp_ready'
  | 'tcp_error'
  | 'session_injecting'
  | 'session_ready'
  | 'session_error'
  | 'load_failed'
  | 'degraded'
  | 'config_write_failed'
  | 'mcp_tools_waiting'
  | 'mcp_tools_ready';

/** IPC event for MCP injection pipeline status */
export type ITeamMcpStatusEvent = {
  teamId: string;
  slotId?: string;
  phase: TeamMcpPhase;
  serverCount?: number;
  port?: number;
  error?: string;
};
