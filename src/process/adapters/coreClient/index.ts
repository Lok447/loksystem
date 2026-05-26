/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

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
  CoreTeamRenameAgentDto,
  CoreTeamRenameDto,
  CoreTeamSendMessageDto,
  CoreTeamSendMessageToAgentDto,
  CoreTeamSetSessionModeDto,
  CoreTeamUpdateWorkspaceDto,
  CoreUploadCreateFileDto,
  CoreUploadCreatedFileDto,
  CoreWorkspaceQueryDto,
} from '@process/core/shared/CoreContracts';
import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import type { SlashCommandItem } from '@/common/chat/slash/types';
import type { TChatConversation } from '@/common/config/storage';
import type { CoreEventEnvelope } from '@process/core/shared/CoreEvent';
import type { CoreBackendServices } from '@process/core';
import { coreEventBus } from '@process/core/shared/CoreEventBus';

/**
 * M5 preparation only: shared client shape for future IPC/HTTP adapters.
 * Do not route renderer traffic here until M4 service boundaries stabilize.
 */
export interface CoreClientContract {
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
}

let currentCoreClient: CoreClientContract | null = null;

export function registerCoreClient(client: CoreClientContract): CoreClientContract {
  currentCoreClient = client;
  return client;
}

export function getRegisteredCoreClient(): CoreClientContract | null {
  return currentCoreClient;
}

export function createInProcessCoreClient(services: CoreBackendServices): CoreClientContract {
  return {
    sessions: {
      getRuntimeState(conversationId) {
        return services.sessions.getSessionRuntimeState(conversationId);
      },
      listRuntimeStates() {
        return services.sessions.listSessionRuntimeStates();
      },
    },
    conversations: {
      get(id) {
        return services.sessions.getConversationWithRuntimeStatus(id);
      },
      getAssociate(conversationId) {
        return services.sessions.getAssociateConversations(conversationId);
      },
      listByCronJob(cronJobId) {
        return services.sessions.listConversationsByCronJob(cronJobId);
      },
      getSlashCommands(conversationId) {
        return services.sessions.getSlashCommands(conversationId);
      },
      sendMessage(params) {
        return services.taskRuntime.sendMessage(params);
      },
      stop(conversationId) {
        return services.taskRuntime.stopTask(conversationId);
      },
    },
    tasks: {
      getRuntimeOverview(conversationId) {
        return services.taskRuntime.getRuntimeOverview(conversationId);
      },
      listRuntimeOverviews() {
        return services.taskRuntime.listRuntimeOverviews();
      },
    },
    acp: {
      getAvailableAgents() {
        return Promise.resolve(services.acpGateway.getAvailableAgents());
      },
      refreshCustomAgents() {
        return services.acpGateway.refreshCustomAgents();
      },
      checkAgentHealth(backend) {
        return services.acpGateway.checkAgentHealth(backend).then((response) => ({
          ...response,
          data: response.data ? { backend, ...response.data } : undefined,
        }));
      },
      getSessionSnapshot(conversationId) {
        return services.acpGateway.getSessionSnapshot(conversationId);
      },
      setModel(conversationId, modelId) {
        return services.acpGateway.setModel(conversationId, modelId);
      },
      setMode(conversationId, mode) {
        return services.acpGateway.setMode(conversationId, mode);
      },
      setConfigOption(conversationId, configId, value) {
        return services.acpGateway.setConfigOption(conversationId, configId, value);
      },
    },
    workspaces: {
      getTree(params) {
        return services.workspaces.getWorkspaceTree(params);
      },
    },
    teams: {
      create(params) {
        return services.teams.create(params);
      },
      list(userId) {
        return services.teams.list(userId);
      },
      get(id) {
        return services.teams.get(id);
      },
      remove(id) {
        return services.teams.remove(id);
      },
      addAgent(params) {
        return services.teams.addAgent(params);
      },
      removeAgent(teamId, slotId) {
        return services.teams.removeAgent(teamId, slotId);
      },
      renameAgent(params) {
        return services.teams.renameAgent(params);
      },
      renameTeam(params) {
        return services.teams.renameTeam(params);
      },
      setSessionMode(params) {
        return services.teams.setSessionMode(params);
      },
      updateWorkspace(params) {
        return services.teams.updateWorkspace(params);
      },
      sendMessage(params) {
        return services.teams.sendMessage(params);
      },
      sendMessageToAgent(params) {
        return services.teams.sendMessageToAgent(params);
      },
      stop(teamId) {
        return services.teams.stop(teamId);
      },
      ensureSession(teamId) {
        return services.teams.ensureSession(teamId);
      },
    },
    uploads: {
      async createFile(params) {
        try {
          const file = await services.uploads.createUploadFile(params);
          return { success: true, data: { path: file.path } };
        } catch (error) {
          return {
            success: false,
            msg: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },
    events: {
      subscribe(listener) {
        return coreEventBus.on(listener);
      },
    },
  };
}
