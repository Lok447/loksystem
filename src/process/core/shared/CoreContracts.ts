/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { ConversationSource } from '@/common/config/storage';
import type { AcpModelInfo, AcpSessionConfigOption } from '@/common/types/acpTypes';
import type { TeamAgent, TTeam, WorkspaceMode } from '@/common/types/teamTypes';
import type { AcpSessionRow } from '@process/services/database/IAcpSessionRepository';
import type { AgentStatus, AgentType } from '@process/task/agentTypes';

export type CoreServiceModule = 'auth' | 'upload' | 'session' | 'task' | 'acp' | 'workspace' | 'team';

export interface CoreServiceResponse<TData = Record<string, never>> {
  success: boolean;
  data?: TData;
  msg?: string;
}

export interface CoreRuntimeConfigDto {
  model?: string;
  thinking?: string;
  thinking_budget?: number;
  effort?: string;
}

export interface CoreTaskRuntimeStateDto {
  id: string;
  type: AgentType;
  status: AgentStatus | undefined;
  workspace: string;
  lastActivityAt: number;
  isActive: boolean;
}

export type CoreTaskRuntimeRecordState =
  | 'created'
  | 'pending'
  | 'running'
  | 'finished'
  | 'stopped'
  | 'killed'
  | 'cleared'
  | 'unknown';

export interface CoreTaskRuntimeRecordDto {
  conversationId: string;
  taskType?: AgentType;
  state: CoreTaskRuntimeRecordState;
  workspace?: string;
  createdAt: number;
  updatedAt: number;
  lastActivityAt?: number;
  lastEvent?: string;
  lastReason?: string;
  metadata?: Record<string, unknown>;
}

export interface CoreTaskRuntimeOverviewDto {
  conversationId: string;
  runtime: CoreTaskRuntimeStateDto | null;
  record: CoreTaskRuntimeRecordDto | null;
}

export interface CoreSessionRuntimeStateDto {
  conversationId: string;
  exists: boolean;
  type?: string;
  source?: ConversationSource;
  workspace?: string;
  status: AgentStatus | 'finished';
  runtime: CoreTaskRuntimeStateDto | null;
  record?: CoreTaskRuntimeRecordDto | null;
  persistedAt?: number;
}

export interface CoreWorkspaceQueryDto {
  conversationId: string;
  workspace: string;
  targetPath: string;
  search?: string;
}

export interface CoreWorkspaceSearchProgressDto {
  conversationId: string;
  workspace: string;
  result: {
    file: number;
    dir: number;
    match?: IDirOrFile;
  };
}

export interface CoreConversationSendMessageDto {
  input: string;
  msg_id: string;
  conversation_id: string;
  files?: string[];
  loading_id?: string;
  injectSkills?: string[];
  [key: string]: unknown;
}

export interface CoreTeamSendMessageDto {
  teamId: string;
  content: string;
  files?: string[];
}

export interface CoreTeamSendMessageToAgentDto extends CoreTeamSendMessageDto {
  slotId: string;
}

export interface CoreTeamCreateDto {
  userId: string;
  name: string;
  workspace: string;
  workspaceMode: WorkspaceMode;
  agents: TeamAgent[];
  sessionMode?: string;
}

export interface CoreTeamAddAgentDto {
  teamId: string;
  agent: Omit<TeamAgent, 'slotId'>;
}

export interface CoreTeamMutationDto {
  teamId: string;
}

export interface CoreTeamAgentMutationDto extends CoreTeamMutationDto {
  slotId: string;
}

export interface CoreTeamRenameAgentDto extends CoreTeamAgentMutationDto {
  newName: string;
}

export interface CoreTeamRenameDto {
  id: string;
  name: string;
}

export interface CoreTeamSetSessionModeDto extends CoreTeamMutationDto {
  sessionMode: string;
}

export interface CoreTeamUpdateWorkspaceDto extends CoreTeamMutationDto {
  workspace: string;
}

export type CoreTeamDto = TTeam;
export type CoreTeamAgentDto = TeamAgent;

export interface CoreUploadCreateFileDto {
  fileName: string;
  conversationId?: string;
  workspace?: string;
}

export interface CoreUploadCreatedFileDto {
  path: string;
}

export interface CoreAcpAgentDescriptorDto {
  id?: string;
  backend: string;
  name: string;
  kind?: string;
  available?: boolean;
  cliPath?: string;
  acpArgs?: string[];
  supportedTransports?: string[];
  isExtension?: boolean;
  extensionName?: string;
  isPreset?: boolean;
  customAgentId?: string;
  context?: string;
  avatar?: string;
  presetAgentType?: string;
  remoteAgentId?: string;
  url?: string;
  protocol?: string;
  authType?: string;
  version?: string;
  gatewayUrl?: string;
}

export interface CoreAcpHealthDto {
  backend: string;
  available: boolean;
  latency?: number;
  error?: string;
}

export interface CoreAcpSessionSnapshotDto {
  conversationId: string;
  exists: boolean;
  runtime: CoreTaskRuntimeStateDto | null;
  persisted?: AcpSessionRow | null;
  mode: {
    mode: string;
    initialized: boolean;
  };
  modelInfo?: AcpModelInfo | null;
  configOptions?: AcpSessionConfigOption[];
}

export interface CoreAcpStreamEventDto {
  conversationId: string;
  messageId: string;
  messageType: string;
  hidden?: boolean;
  source: 'acp' | 'cron' | 'skill_suggest' | 'team' | 'unknown';
  message: IResponseMessage;
}

export interface CoreConversationStreamEventDto {
  conversationId: string;
  messageId: string;
  messageType: string;
  hidden?: boolean;
  source: 'remote' | 'nanobot' | 'aionrs' | 'openclaw' | 'cron' | 'skill_suggest' | 'team' | 'unknown';
  message: IResponseMessage;
}
