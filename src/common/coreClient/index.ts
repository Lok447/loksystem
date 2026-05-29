/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import type { SlashCommandItem } from '@/common/chat/slash/types';
import type { TChatConversation } from '@/common/config/storage';
import type {
  CoreAcpAgentDescriptorDto,
  CoreAcpHealthDto,
  CoreAcpSessionSnapshotDto,
  CoreConversationSendMessageDto,
  CoreServiceResponse,
  CoreSessionRuntimeStateDto,
  CoreTaskRuntimeOverviewDto,
  CoreTeamAddAgentDto,
  CoreTeamAgentDto,
  CoreTeamCreateDto,
  CoreTeamDto,
  CoreTeamRecoveryExecutionDto,
  CoreTeamRecoveryPreparationDto,
  CoreTeamRenameAgentDto,
  CoreTeamRenameDto,
  CoreTeamRuntimeDiagnosticsDto,
  CoreTeamSendMessageDto,
  CoreTeamSendMessageToAgentDto,
  CoreTeamSetSessionModeDto,
  CoreTeamUpdateWorkspaceDto,
  CoreUploadCreateFileDto,
  CoreUploadCreatedFileDto,
  CoreWorkspaceQueryDto,
} from '@process/core/shared/CoreContracts';
import type { CoreEventEnvelope } from '@process/core/shared/CoreEvent';
import { resolveWebRuntimeServerPath } from '@/common/utils/webRuntimeOrigin';

type CoreHttpResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  msg?: string;
};

export type RendererCoreClient = {
  sessions: {
    getRuntimeState(conversationId: string): Promise<CoreSessionRuntimeStateDto>;
    listRuntimeStates(): Promise<CoreSessionRuntimeStateDto[]>;
  };
  conversations: {
    get(id: string): Promise<TChatConversation | undefined>;
    getAssociate(conversationId: string): Promise<TChatConversation[]>;
    listByCronJob(cronJobId: string): Promise<TChatConversation[]>;
    getSlashCommands(conversationId: string): Promise<CoreServiceResponse<{ commands: SlashCommandItem[] }>>;
    sendMessage(params: CoreConversationSendMessageDto): Promise<CoreServiceResponse>;
    stop(conversationId: string): Promise<CoreServiceResponse>;
  };
  tasks: {
    getRuntimeOverview(conversationId: string): Promise<CoreTaskRuntimeOverviewDto>;
    listRuntimeOverviews(): Promise<CoreTaskRuntimeOverviewDto[]>;
  };
  acp: {
    getAvailableAgents(): Promise<CoreServiceResponse<CoreAcpAgentDescriptorDto[]>>;
    refreshCustomAgents(): Promise<void>;
    checkAgentHealth(backend: string): Promise<CoreServiceResponse<CoreAcpHealthDto>>;
    getSessionSnapshot(conversationId: string): Promise<CoreAcpSessionSnapshotDto>;
    setModel(conversationId: string, modelId: string): Promise<unknown>;
    setMode(conversationId: string, mode: string): Promise<unknown>;
    setConfigOption(conversationId: string, configId: string, value: string): Promise<unknown>;
  };
  workspaces: {
    getTree(params: CoreWorkspaceQueryDto): Promise<IDirOrFile[]>;
  };
  teams: {
    create(params: CoreTeamCreateDto): Promise<CoreServiceResponse<CoreTeamDto>>;
    list(userId: string): Promise<CoreTeamDto[]>;
    get(id: string): Promise<CoreTeamDto | null>;
    getRuntimeDiagnostics(teamId: string): Promise<CoreServiceResponse<CoreTeamRuntimeDiagnosticsDto>>;
    prepareRecoverySession(teamId: string): Promise<CoreServiceResponse<CoreTeamRecoveryPreparationDto>>;
    executeRecoveryPlan(teamId: string): Promise<CoreServiceResponse<CoreTeamRecoveryExecutionDto>>;
    remove(id: string): Promise<CoreServiceResponse>;
    addAgent(params: CoreTeamAddAgentDto): Promise<CoreServiceResponse<CoreTeamAgentDto>>;
    removeAgent(teamId: string, slotId: string): Promise<CoreServiceResponse>;
    renameAgent(params: CoreTeamRenameAgentDto): Promise<CoreServiceResponse>;
    renameTeam(params: CoreTeamRenameDto): Promise<CoreServiceResponse>;
    setSessionMode(params: CoreTeamSetSessionModeDto): Promise<CoreServiceResponse>;
    updateWorkspace(params: CoreTeamUpdateWorkspaceDto): Promise<CoreServiceResponse>;
    sendMessage(params: CoreTeamSendMessageDto): Promise<CoreServiceResponse>;
    sendMessageToAgent(params: CoreTeamSendMessageToAgentDto): Promise<CoreServiceResponse>;
    stop(teamId: string): Promise<CoreServiceResponse>;
    ensureSession(teamId: string): Promise<CoreServiceResponse>;
  };
  uploads: {
    createFile(params: CoreUploadCreateFileDto): Promise<CoreServiceResponse<CoreUploadCreatedFileDto>>;
  };
  events: {
    subscribe(listener: (event: CoreEventEnvelope) => void): () => void;
  };
};

function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean((window as { electronAPI?: unknown }).electronAPI);
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function buildCoreUrl(path: string): string {
  if (typeof window === 'undefined') {
    return path;
  }
  return resolveWebRuntimeServerPath(path, window.location);
}

async function fetchCore<T>(path: string): Promise<T> {
  const response = await fetch(buildCoreUrl(path), {
    credentials: 'include',
  });
  const payload = (await response.json()) as CoreHttpResponse<T>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || payload.message || payload.msg || `Core request failed: ${response.status}`);
  }
  return payload.data as T;
}

async function postCore<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(buildCoreUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as CoreHttpResponse<T>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || payload.message || payload.msg || `Core request failed: ${response.status}`);
  }
  return payload.data as T;
}

function createElectronCoreClient(): RendererCoreClient {
  return {
    sessions: {
      getRuntimeState(conversationId) {
        return ipcBridge.core.sessions.getRuntimeState.invoke({ conversationId });
      },
      listRuntimeStates() {
        return ipcBridge.core.sessions.listRuntimeStates.invoke();
      },
    },
    conversations: {
      get(id) {
        return ipcBridge.core.conversations.get.invoke({ id });
      },
      getAssociate(conversationId) {
        return ipcBridge.core.conversations.getAssociate.invoke({ conversationId });
      },
      listByCronJob(cronJobId) {
        return ipcBridge.core.conversations.listByCronJob.invoke({ cronJobId });
      },
      getSlashCommands(conversationId) {
        return ipcBridge.core.conversations.getSlashCommands.invoke({ conversationId });
      },
      sendMessage(params) {
        return ipcBridge.core.conversations.sendMessage.invoke(params);
      },
      stop(conversationId) {
        return ipcBridge.core.conversations.stop.invoke({ conversationId });
      },
    },
    tasks: {
      getRuntimeOverview(conversationId) {
        return ipcBridge.core.tasks.getRuntimeOverview.invoke({ conversationId });
      },
      listRuntimeOverviews() {
        return ipcBridge.core.tasks.listRuntimeOverviews.invoke();
      },
    },
    acp: {
      getAvailableAgents() {
        return ipcBridge.core.acp.getAvailableAgents.invoke();
      },
      refreshCustomAgents() {
        return ipcBridge.core.acp.refreshCustomAgents.invoke();
      },
      checkAgentHealth(backend) {
        return ipcBridge.core.acp.checkAgentHealth.invoke({ backend });
      },
      getSessionSnapshot(conversationId) {
        return ipcBridge.core.acp.getSessionSnapshot.invoke({ conversationId });
      },
      setModel(conversationId, modelId) {
        return ipcBridge.core.acp.setModel.invoke({ conversationId, modelId });
      },
      setMode(conversationId, mode) {
        return ipcBridge.core.acp.setMode.invoke({ conversationId, mode });
      },
      setConfigOption(conversationId, configId, value) {
        return ipcBridge.core.acp.setConfigOption.invoke({ conversationId, configId, value });
      },
    },
    workspaces: {
      getTree(params) {
        return ipcBridge.core.workspaces.getTree.invoke(params);
      },
    },
    teams: {
      create(params) {
        return ipcBridge.core.teams.create.invoke(params);
      },
      list(userId) {
        return ipcBridge.core.teams.list.invoke({ userId });
      },
      get(id) {
        return ipcBridge.core.teams.get.invoke({ id });
      },
      getRuntimeDiagnostics(teamId) {
        return ipcBridge.core.teams.getRuntimeDiagnostics.invoke({ teamId });
      },
      prepareRecoverySession(teamId) {
        return ipcBridge.core.teams.prepareRecoverySession.invoke({ teamId });
      },
      executeRecoveryPlan(teamId) {
        return ipcBridge.core.teams.executeRecoveryPlan.invoke({ teamId });
      },
      remove(id) {
        return ipcBridge.core.teams.remove.invoke({ id });
      },
      addAgent(params) {
        return ipcBridge.core.teams.addAgent.invoke(params);
      },
      removeAgent(teamId, slotId) {
        return ipcBridge.core.teams.removeAgent.invoke({ teamId, slotId });
      },
      renameAgent(params) {
        return ipcBridge.core.teams.renameAgent.invoke(params);
      },
      renameTeam(params) {
        return ipcBridge.core.teams.renameTeam.invoke(params);
      },
      setSessionMode(params) {
        return ipcBridge.core.teams.setSessionMode.invoke(params);
      },
      updateWorkspace(params) {
        return ipcBridge.core.teams.updateWorkspace.invoke(params);
      },
      sendMessage(params) {
        return ipcBridge.core.teams.sendMessage.invoke(params);
      },
      sendMessageToAgent(params) {
        return ipcBridge.core.teams.sendMessageToAgent.invoke(params);
      },
      stop(teamId) {
        return ipcBridge.core.teams.stop.invoke({ teamId });
      },
      ensureSession(teamId) {
        return ipcBridge.core.teams.ensureSession.invoke({ teamId });
      },
    },
    uploads: {
      createFile(params) {
        return ipcBridge.core.uploads.createFile.invoke(params);
      },
    },
    events: {
      subscribe(listener) {
        return ipcBridge.core.events.stream.on(listener);
      },
    },
  };
}

function createHttpCoreClient(): RendererCoreClient {
  return {
    sessions: {
      getRuntimeState(conversationId) {
        return fetchCore(`/api/core/sessions/runtime/${encodePathSegment(conversationId)}`);
      },
      listRuntimeStates() {
        return fetchCore('/api/core/sessions/runtime');
      },
    },
    conversations: {
      get(id) {
        return fetchCore(`/api/core/conversations/${encodePathSegment(id)}`);
      },
      getAssociate(conversationId) {
        return fetchCore(`/api/core/conversations/${encodePathSegment(conversationId)}/associate`);
      },
      listByCronJob(cronJobId) {
        return fetchCore(`/api/core/conversations/cron/${encodePathSegment(cronJobId)}`);
      },
      getSlashCommands(conversationId) {
        return fetchCore(`/api/core/conversations/${encodePathSegment(conversationId)}/slash-commands`);
      },
      sendMessage(params) {
        return postCore(`/api/core/conversations/${encodePathSegment(params.conversation_id)}/messages`, params);
      },
      stop(conversationId) {
        return postCore(`/api/core/conversations/${encodePathSegment(conversationId)}/stop`, {});
      },
    },
    tasks: {
      getRuntimeOverview(conversationId) {
        return fetchCore(`/api/core/tasks/runtime/${encodePathSegment(conversationId)}`);
      },
      listRuntimeOverviews() {
        return fetchCore('/api/core/tasks/runtime');
      },
    },
    acp: {
      getAvailableAgents() {
        return fetchCore('/api/core/acp/agents');
      },
      refreshCustomAgents() {
        return postCore('/api/core/acp/agents/refresh', {});
      },
      checkAgentHealth(backend) {
        return fetchCore(`/api/core/acp/agents/${encodePathSegment(backend)}/health`);
      },
      getSessionSnapshot(conversationId) {
        return fetchCore(`/api/core/acp/sessions/${encodePathSegment(conversationId)}`);
      },
      setModel(conversationId, modelId) {
        return postCore(`/api/core/acp/sessions/${encodePathSegment(conversationId)}/model`, { modelId });
      },
      setMode(conversationId, mode) {
        return postCore(`/api/core/acp/sessions/${encodePathSegment(conversationId)}/mode`, { mode });
      },
      setConfigOption(conversationId, configId, value) {
        return postCore(`/api/core/acp/sessions/${encodePathSegment(conversationId)}/config`, {
          configId,
          value,
        });
      },
    },
    workspaces: {
      getTree(params) {
        const query = new URLSearchParams({
          conversationId: params.conversationId,
          workspace: params.workspace,
          targetPath: params.targetPath,
        });
        if (params.search) {
          query.set('search', params.search);
        }
        return fetchCore(`/api/core/workspaces/tree?${query.toString()}`);
      },
    },
    teams: {
      create(params) {
        return postCore('/api/core/teams', params);
      },
      list(userId) {
        return fetchCore(`/api/core/teams?userId=${encodeURIComponent(userId)}`);
      },
      get(id) {
        return fetchCore(`/api/core/teams/${encodePathSegment(id)}`);
      },
      getRuntimeDiagnostics(teamId) {
        return fetchCore(`/api/core/teams/${encodePathSegment(teamId)}/runtime-diagnostics`);
      },
      prepareRecoverySession(teamId) {
        return postCore(`/api/core/teams/${encodePathSegment(teamId)}/recovery/prepare`, {});
      },
      executeRecoveryPlan(teamId) {
        return postCore(`/api/core/teams/${encodePathSegment(teamId)}/recovery/execute`, {});
      },
      remove(id) {
        return postCore(`/api/core/teams/${encodePathSegment(id)}/delete`, {});
      },
      addAgent(params) {
        return postCore(`/api/core/teams/${encodePathSegment(params.teamId)}/agents`, params);
      },
      removeAgent(teamId, slotId) {
        return postCore(`/api/core/teams/${encodePathSegment(teamId)}/agents/${encodePathSegment(slotId)}/delete`, {});
      },
      renameAgent(params) {
        return postCore(
          `/api/core/teams/${encodePathSegment(params.teamId)}/agents/${encodePathSegment(params.slotId)}/rename`,
          params
        );
      },
      renameTeam(params) {
        return postCore(`/api/core/teams/${encodePathSegment(params.id)}/rename`, params);
      },
      setSessionMode(params) {
        return postCore(`/api/core/teams/${encodePathSegment(params.teamId)}/session-mode`, params);
      },
      updateWorkspace(params) {
        return postCore(`/api/core/teams/${encodePathSegment(params.teamId)}/workspace`, params);
      },
      sendMessage(params) {
        return postCore(`/api/core/teams/${encodePathSegment(params.teamId)}/messages`, params);
      },
      sendMessageToAgent(params) {
        return postCore(
          `/api/core/teams/${encodePathSegment(params.teamId)}/agents/${encodePathSegment(params.slotId)}/messages`,
          params
        );
      },
      stop(teamId) {
        return postCore(`/api/core/teams/${encodePathSegment(teamId)}/stop`, {});
      },
      ensureSession(teamId) {
        return postCore(`/api/core/teams/${encodePathSegment(teamId)}/session`, {});
      },
    },
    uploads: {
      createFile(params) {
        return postCore('/api/core/uploads/files', params);
      },
    },
    events: {
      subscribe(listener) {
        return ipcBridge.core.events.stream.on(listener);
      },
    },
  };
}

let client: RendererCoreClient | null = null;

export function getRendererCoreClient(): RendererCoreClient {
  if (!client) {
    client = isDesktopRuntime() ? createElectronCoreClient() : createHttpCoreClient();
  }
  return client;
}
