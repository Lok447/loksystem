/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CoreAcpAgentDescriptorDto,
  CoreAcpHealthDto,
  CoreAcpSessionSnapshotDto,
  CoreAcpStreamEventDto,
  CoreConversationStreamEventDto,
  CoreRuntimeConfigDto,
  CoreTeamAgentDto,
  CoreTaskRuntimeStateDto,
  CoreWorkspaceSearchProgressDto,
} from './CoreContracts';
import type { TeammateStatus, TeamMcpPhase } from '@/common/types/teamTypes';

export type CoreEventScope = 'auth' | 'upload' | 'session' | 'task' | 'conversation' | 'acp' | 'workspace' | 'team';

export interface CoreEventPayloadMap {
  'auth.session.updated': {
    action: 'login' | 'logout' | 'password_changed' | 'token_refreshed';
    userId?: string;
    username?: string;
  };
  'upload.file.stored': {
    conversationId: string | null;
    workspace: string | null;
    file: {
      path: string;
      name: string;
      size: number;
      type: string;
    };
  };
  'session.created': {
    conversationId: string;
    source?: string;
    type?: string;
    workspace?: string;
    sourceConversationId?: string;
    migrated?: boolean;
  };
  'session.updated': {
    action?: 'updated' | 'deleted' | 'migrated';
    conversationId: string;
    source?: string;
    targetConversationId?: string;
    updates?: unknown;
  };
  'task.runtime.updated': {
    action:
      | 'built'
      | 'warmed'
      | 'killed'
      | 'cleared'
      | 'stopped'
      | 'message_sent'
      | 'confirmation_submitted'
      | 'config_updated';
    conversationId: string;
    reason?: string;
    status?: string;
    fileCount?: number;
    msgId?: string;
    callId?: string;
    config?: CoreRuntimeConfigDto;
    runtime?: CoreTaskRuntimeStateDto | null;
  };
  'conversation.stream.message': CoreConversationStreamEventDto;
  'acp.agent.discovery.updated': {
    action: 'listed' | 'refreshed';
    agents?: CoreAcpAgentDescriptorDto[];
    count?: number;
  };
  'acp.agent.health.checked': CoreAcpHealthDto;
  'acp.session.updated': {
    action: 'mode_read' | 'model_read' | 'config_read' | 'mode_updated' | 'model_updated' | 'config_updated';
    conversationId: string;
    snapshot?: CoreAcpSessionSnapshotDto;
    mode?: string;
    modelId?: string;
    configId?: string;
    value?: string;
    success?: boolean;
    msg?: string;
  };
  'acp.stream.message': CoreAcpStreamEventDto;
  'workspace.search.progress': CoreWorkspaceSearchProgressDto;
  'team.runtime.updated': {
    action:
      | 'created'
      | 'deleted'
      | 'agent_added'
      | 'agent_removed'
      | 'agent_renamed'
      | 'renamed'
      | 'session_mode_updated'
      | 'workspace_updated'
      | 'message_sent'
      | 'message_sent_to_agent'
      | 'recovery_executed'
      | 'stopped'
      | 'session_ensured';
    teamId: string;
    slotId?: string;
    fileCount?: number;
  };
  'team.list.changed': {
    teamId: string;
    action: 'created' | 'removed' | 'agent_added' | 'agent_removed';
  };
  'team.agent.status.changed': {
    teamId: string;
    slotId: string;
    status: TeammateStatus;
    lastMessage?: string;
  };
  'team.agent.spawned': {
    teamId: string;
    agent: CoreTeamAgentDto;
  };
  'team.agent.removed': {
    teamId: string;
    slotId: string;
  };
  'team.agent.renamed': {
    teamId: string;
    slotId: string;
    oldName: string;
    newName: string;
  };
  'team.mcp.status': {
    teamId: string;
    slotId?: string;
    phase: TeamMcpPhase;
    serverCount?: number;
    port?: number;
    error?: string;
  };
}

export type CoreEventType = keyof CoreEventPayloadMap;

export interface CoreEventEnvelope<TType extends CoreEventType = CoreEventType> {
  type: TType;
  scope: CoreEventScope;
  timestamp: number;
  data: CoreEventPayloadMap[TType];
}
