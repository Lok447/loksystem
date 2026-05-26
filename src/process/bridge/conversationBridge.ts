/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import type { IConversationService } from '@process/services/IConversationService';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { TeamSessionService } from '@process/team/TeamSessionService';
import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import { removeFromMessageCache } from '@process/utils/message';
import { coreEventBus } from '@process/core/shared';
import { CoreBackendServices } from '@process/core';
import { refreshTrayMenu } from '@process/utils/tray';

const refreshTrayMenuSafely = async (): Promise<void> => {
  try {
    await refreshTrayMenu();
  } catch (error) {
    console.warn('[conversationBridge] Failed to refresh tray menu:', error);
  }
};

export function initConversationBridge(
  conversationService: IConversationService,
  workerTaskManager: IWorkerTaskManager,
  teamSessionService?: TeamSessionService,
  coreServices?: CoreBackendServices
): void {
  const services = coreServices ?? new CoreBackendServices({ conversationService, workerTaskManager });
  const taskRuntimeService = services.taskRuntime;
  const sessionService = services.sessions;
  const sessionInteractionService = services.sessionInteractions;
  const sessionRuntimeService = services.sessionRuntime;
  const workspaceService = services.workspaces;

  const emitConversationListChanged = (
    conversation: Pick<TChatConversation, 'id' | 'source'>,
    action: 'created' | 'updated' | 'deleted'
  ) => {
    ipcBridge.conversation.listChanged.emit({
      conversationId: conversation.id,
      action,
      source: conversation.source || 'loksystem',
    });
  };

  coreEventBus.on((event) => {
    if (event.scope === 'workspace' && event.type === 'workspace.search.progress') {
      const data = event.data as {
        result: {
          file: number;
          dir: number;
          match?: IDirOrFile;
        };
      };
      void ipcBridge.conversation.responseSearchWorkSpace.invoke(data.result);
      return;
    }

    if (event.scope !== 'session') {
      return;
    }

    if (event.type === 'session.created') {
      const data = event.data as { conversationId: string; source?: string };
      emitConversationListChanged({ id: data.conversationId, source: data.source }, 'created');
      void refreshTrayMenuSafely();
      return;
    }

    if (event.type === 'session.updated') {
      const data = event.data as {
        action?: 'updated' | 'deleted' | 'migrated';
        conversationId: string;
        source?: string;
      };
      if (data.action === 'deleted') {
        emitConversationListChanged({ id: data.conversationId, source: data.source }, 'deleted');
      } else {
        emitConversationListChanged({ id: data.conversationId, source: data.source }, 'updated');
      }
      void refreshTrayMenuSafely();
    }

  });

  ipcBridge.openclawConversation.getRuntime.provider(async ({ conversation_id }) => {
    return sessionService.getOpenClawRuntime(conversation_id);
  });

  ipcBridge.conversation.create.provider(async (params): Promise<TChatConversation> => {
    if (!sessionService.isSupportedConversationType(params?.type)) {
      console.warn('[conversationBridge] Rejecting create request with invalid conversation type:', params?.type);
      return undefined as unknown as TChatConversation;
    }
    try {
      return await sessionService.createConversation(params as never);
    } catch (error) {
      console.error('[conversationBridge] Failed to create conversation:', error);
      throw error;
    }
  });

  ipcBridge.conversation.createWithConversation.provider(async (params): Promise<TChatConversation> => {
    return sessionService.createWithMigration(params);
  });

  ipcBridge.conversation.get.provider(async ({ id }) => {
    return sessionService.getConversationWithRuntimeStatus(id);
  });

  ipcBridge.conversation.getAssociateConversation.provider(async ({ conversation_id }) => {
    return sessionService.getAssociateConversations(conversation_id);
  });

  ipcBridge.conversation.listByCronJob.provider(async ({ cronJobId }) => {
    return sessionService.listConversationsByCronJob(cronJobId);
  });

  ipcBridge.conversation.remove.provider(async ({ id }) => {
    try {
      const removed = await sessionService.removeConversation(id);
      if (removed) {
        removeFromMessageCache(id);
        taskRuntimeService.killTask(id);
      }
      return removed;
    } catch (error) {
      console.error('[conversationBridge] Failed to remove conversation:', error);
      return false;
    }
  });

  ipcBridge.conversation.update.provider(async ({ id, updates, mergeExtra }) => {
    try {
      const result = await sessionService.updateConversation(id, updates, mergeExtra);
      return result.success;
    } catch (error) {
      console.error('[conversationBridge] Failed to update conversation:', error);
      return false;
    }
  });

  ipcBridge.conversation.warmup.provider(async ({ conversation_id }) => {
    taskRuntimeService.warmupConversationBestEffort(conversation_id);
  });

  ipcBridge.conversation.reset.provider(async ({ id }) => {
    await sessionRuntimeService.resetConversation(id);
  });

  ipcBridge.conversation.stop.provider(async ({ conversation_id }) => {
    return taskRuntimeService.stopTask(conversation_id);
  });

  ipcBridge.conversation.getSlashCommands.provider(async ({ conversation_id }) => {
    return sessionService.getSlashCommands(conversation_id);
  });

  ipcBridge.conversation.askSideQuestion.provider(async ({ conversation_id, question }) => {
    try {
      const data = await sessionInteractionService.askSideQuestion(conversation_id, question);
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcBridge.conversation.getWorkspace.provider(async ({ conversation_id, workspace, path: targetPath, search }) => {
    return workspaceService.getWorkspaceTree({
      conversationId: conversation_id,
      workspace,
      targetPath,
      search,
    });
  });

  ipcBridge.conversation.reloadContext.provider(async ({ conversation_id }) => {
    return sessionRuntimeService.reloadContext(conversation_id);
  });

  ipcBridge.conversation.setConfig.provider(async ({ conversation_id, config }) => {
    return sessionRuntimeService.setConfig(conversation_id, config);
  });

  // Generic sendMessage delegates to the shared task runtime facade.
  ipcBridge.conversation.sendMessage.provider(async (params) => {
    return taskRuntimeService.sendMessage(params as unknown as {
      conversation_id: string;
      files?: string[];
      input: string;
      injectSkills?: string[];
      [key: string]: unknown;
    });
  });

  // 通用 confirmMessage 实现 - 自动根据 conversation 类型分发

  ipcBridge.conversation.confirmation.confirm.provider(async ({ conversation_id, msg_id, data, callId }) => {
    return taskRuntimeService.confirm(conversation_id, msg_id, callId, data);
  });
  ipcBridge.conversation.confirmation.list.provider(async ({ conversation_id }) => {
    return taskRuntimeService.listConfirmations(conversation_id);
  });

  ipcBridge.conversation.approval.check.provider(async ({ conversation_id, action, commandType }) => {
    return taskRuntimeService.checkApproval(conversation_id, action, commandType);
  });
}
