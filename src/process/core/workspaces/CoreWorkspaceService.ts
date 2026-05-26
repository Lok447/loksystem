/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import { ProcessChat } from '@process/utils/initStorage';
import { migrateConversationToDatabase } from '@process/bridge/migrationUtils';
import type { IConversationService } from '@process/services/IConversationService';
import { coreEventBus } from '@process/core/shared/CoreEventBus';
import type { CoreWorkspaceQueryDto } from '@process/core/shared/CoreContracts';
import { readDirectoryRecursive } from '@process/utils';
import path from 'path';

export class CoreWorkspaceService {
  private workspaceRequestAbortController: AbortController | null = null;

  constructor(private readonly conversationService: IConversationService) {}

  public async getWorkspaceTree(params: CoreWorkspaceQueryDto): Promise<IDirOrFile[]> {
    const { conversationId, workspace, targetPath, search } = params;
    let conversation = await this.conversationService.getConversation(conversationId);
    if (!conversation) {
      const history = await ProcessChat.get('chat.history');
      conversation = (history || []).find((item) => item.id === conversationId);
      if (conversation) {
        void migrateConversationToDatabase(conversation);
      }
    }

    if (!conversation?.extra?.workspace) {
      return [];
    }

    const resolvedWorkspace = path.resolve(conversation.extra.workspace);
    const requestedWorkspace = path.resolve(workspace);
    if (resolvedWorkspace !== requestedWorkspace) {
      console.warn('[CoreWorkspaceService] Workspace mismatch', {
        conversationId,
        resolvedWorkspace,
        requestedWorkspace,
      });
      return [];
    }

    const requestedPath = path.resolve(targetPath || requestedWorkspace);
    if (!requestedPath.startsWith(resolvedWorkspace)) {
      console.warn('[CoreWorkspaceService] Rejecting out-of-workspace path', {
        conversationId,
        requestedPath,
        resolvedWorkspace,
      });
      return [];
    }

    this.workspaceRequestAbortController?.abort();
    this.workspaceRequestAbortController = new AbortController();

    try {
      const tree = await readDirectoryRecursive(requestedPath, {
        root: resolvedWorkspace,
        abortController: this.workspaceRequestAbortController,
        maxDepth: search ? Number.MAX_SAFE_INTEGER : 1,
        search: search
          ? {
              text: search,
              onProcess(result) {
                coreEventBus.emit('workspace', 'workspace.search.progress', {
                  conversationId,
                  workspace: resolvedWorkspace,
                  result,
                });
              },
            }
          : undefined,
      });

      return tree ? [tree] : [];
    } catch (error) {
      if (error instanceof Error && error.message.includes('aborted')) {
        return [];
      }
      console.error('[CoreWorkspaceService] Failed to get workspace tree:', error);
      return [];
    }
  }
}
