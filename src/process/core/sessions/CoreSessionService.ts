/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import type { CreateConversationParams, IConversationService, MigrateConversationParams } from '@process/services/IConversationService';
import type { CoreSessionRuntimeStateDto } from '@process/core/shared/CoreContracts';
import { ProcessChat } from '@process/utils/initStorage';
import { computeOpenClawIdentityHash } from '@process/utils/openclawUtils';
import { AcpSkillManager } from '@process/task/AcpSkillManager';
import type AcpAgentManager from '@process/task/AcpAgentManager';
import { migrateConversationToDatabase } from '@process/bridge/migrationUtils';
import { coreEventBus } from '@process/core/shared/CoreEventBus';
import { CoreTaskRuntimeService } from '@process/core/tasks/CoreTaskRuntimeService';

const SUPPORTED_CONVERSATION_TYPES = new Set<TChatConversation['type']>([
  'acp',
  'codex',
  'openclaw-gateway',
  'nanobot',
  'remote',
  'aionrs',
]);

type CoreCreateConversationParams =
  | CreateConversationParams
  | (Omit<CreateConversationParams, 'type'> & { type: 'codex' });

export class CoreSessionService {
  constructor(
    private readonly conversationService: IConversationService,
    private readonly taskRuntimeService: CoreTaskRuntimeService
  ) {}

  public async removeConversation(id: string): Promise<boolean> {
    const conversation = await this.conversationService.getConversation(id);
    if (!conversation) {
      return false;
    }

    await this.conversationService.deleteConversation(id);
    coreEventBus.emit('session', 'session.updated', {
      action: 'deleted',
      conversationId: id,
      source: conversation.source || 'loksystem',
    });
    return true;
  }

  public async updateConversation(
    id: string,
    updates: Partial<TChatConversation>,
    mergeExtra?: boolean
  ): Promise<{ success: boolean; conversation?: TChatConversation }> {
    const conversation = await this.conversationService.getConversation(id);
    if (!conversation) {
      return { success: false };
    }

    await this.conversationService.updateConversation(id, updates, mergeExtra);
    const nextConversation = await this.conversationService.getConversation(id);

    coreEventBus.emit('session', 'session.updated', {
      action: 'updated',
      conversationId: id,
      source: conversation.source || 'loksystem',
      updates,
    });

    return {
      success: true,
      conversation: nextConversation,
    };
  }

  public isSupportedConversationType(type: unknown): type is TChatConversation['type'] {
    return SUPPORTED_CONVERSATION_TYPES.has(type as TChatConversation['type']);
  }

  public async getOpenClawRuntime(conversationId: string) {
    try {
      const conversation = await this.conversationService.getConversation(conversationId);
      if (!conversation || conversation.type !== 'openclaw-gateway') {
        return { success: false as const, msg: 'OpenClaw conversation not found' };
      }

      const task = await this.taskRuntimeService.getOpenClawRuntimeTask(conversationId);
      if (!task) {
        return { success: false as const, msg: 'OpenClaw runtime not available' };
      }

      await task.bootstrap.catch(() => {});

      const diagnostics = task.getDiagnostics();
      const identityHash = await computeOpenClawIdentityHash(diagnostics.workspace || conversation.extra?.workspace);
      const conversationModel = (conversation as { model?: { useModel?: string } }).model;
      const extra = conversation.extra as
        | {
            cliPath?: string;
            gateway?: { cliPath?: string };
            runtimeValidation?: unknown;
          }
        | undefined;
      const gatewayCliPath = extra?.gateway?.cliPath;

      return {
        success: true as const,
        data: {
          conversationId,
          runtime: {
            workspace: diagnostics.workspace || conversation.extra?.workspace,
            backend: diagnostics.backend || conversation.extra?.backend,
            agentName: diagnostics.agentName || conversation.extra?.agentName,
            cliPath: diagnostics.cliPath || extra?.cliPath || gatewayCliPath,
            model: conversationModel?.useModel,
            sessionKey: diagnostics.sessionKey,
            isConnected: diagnostics.isConnected,
            hasActiveSession: diagnostics.hasActiveSession,
            identityHash,
          },
          expected: extra?.runtimeValidation,
        },
      };
    } catch (error) {
      return {
        success: false as const,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public async createConversation(params: CoreCreateConversationParams): Promise<TChatConversation> {
    const createParams =
      params.type === 'codex'
        ? { ...params, type: 'acp' as const, extra: { ...params.extra, backend: 'codex' as const } }
        : params;

    const conversation = await this.conversationService.createConversation({
      ...createParams,
      source: 'loksystem',
    } as CreateConversationParams);

    await this.persistLoadedSkillsSnapshot(conversation, createParams.extra as {
      enabledSkills?: string[];
      excludeBuiltinSkills?: string[];
    });

    coreEventBus.emit('session', 'session.created', {
      conversationId: conversation.id,
      source: conversation.source || 'loksystem',
      type: conversation.type,
      workspace: conversation.extra?.workspace,
    });

    return conversation;
  }

  public async getAssociateConversations(conversationId: string): Promise<TChatConversation[]> {
    try {
      let currentConversation = await this.conversationService.getConversation(conversationId);

      if (!currentConversation) {
        const history = await ProcessChat.get('chat.history');
        currentConversation = (history || []).find((item) => item.id === conversationId);
        if (currentConversation) {
          void migrateConversationToDatabase(currentConversation);
        }
      }

      if (!currentConversation || !currentConversation.extra?.workspace) {
        return [];
      }

      let allConversations = await this.conversationService.listAllConversations();
      const history = await ProcessChat.get('chat.history');
      if (allConversations.length < (history?.length || 0)) {
        allConversations = history || [];
        void Promise.all(allConversations.map((conversation) => migrateConversationToDatabase(conversation)));
      }

      return allConversations.filter((item) => item.extra?.workspace === currentConversation.extra.workspace);
    } catch (error) {
      console.error('[CoreSessionService] Failed to get associate conversations:', error);
      return [];
    }
  }

  public async listConversationsByCronJob(cronJobId: string): Promise<TChatConversation[]> {
    return this.conversationService.getConversationsByCronJob(cronJobId);
  }

  public async createWithMigration(params: MigrateConversationParams): Promise<TChatConversation> {
    const conversation = await this.conversationService.createWithMigration(params);
    this.taskRuntimeService.warmupConversationBestEffort(conversation.id);
    coreEventBus.emit('session', 'session.created', {
      conversationId: conversation.id,
      source: conversation.source || 'loksystem',
      type: conversation.type,
      workspace: conversation.extra?.workspace,
      sourceConversationId: params.sourceConversationId,
      migrated: true,
    });
    if (params.sourceConversationId) {
      coreEventBus.emit('session', 'session.updated', {
        action: 'migrated',
        conversationId: params.sourceConversationId,
        targetConversationId: conversation.id,
      });
    }
    return conversation;
  }

  public async getConversationWithRuntimeStatus(id: string): Promise<TChatConversation | undefined> {
    try {
      const conversation = await this.conversationService.getConversation(id);
      if (conversation) {
        const task = this.taskRuntimeService.getTask(id);
        return { ...conversation, status: task?.status || 'finished' };
      }

      const history = await ProcessChat.get('chat.history');
      const fileConversation = (history || []).find((item) => item.id === id);
      if (fileConversation) {
        const task = this.taskRuntimeService.getTask(id);
        void migrateConversationToDatabase(fileConversation);
        return { ...fileConversation, status: task?.status || 'finished' };
      }

      return undefined;
    } catch (error) {
      console.error('[CoreSessionService] Failed to get conversation:', error);
      return undefined;
    }
  }

  public async getSessionRuntimeState(id: string): Promise<CoreSessionRuntimeStateDto> {
    const conversation = await this.getConversationWithRuntimeStatus(id);
    const overview = await this.taskRuntimeService.getRuntimeOverview(id);
    const runtime = overview.runtime;

    if (!conversation) {
      return {
        conversationId: id,
        exists: false,
        status: runtime?.status || 'finished',
        runtime,
        record: overview.record,
      };
    }

    return {
      conversationId: conversation.id,
      exists: true,
      type: conversation.type,
      source: conversation.source || 'loksystem',
      workspace: conversation.extra?.workspace,
      status: runtime?.status || conversation.status || 'finished',
      runtime,
      record: overview.record,
      persistedAt: conversation.modifyTime,
    };
  }

  public async listSessionRuntimeStates(): Promise<CoreSessionRuntimeStateDto[]> {
    const conversations = await this.conversationService.listAllConversations();
    const overviews = await this.taskRuntimeService.listRuntimeOverviews();
    const overviewById = new Map(overviews.map((overview) => [overview.conversationId, overview]));
    return conversations.map((conversation) => {
      const overview = overviewById.get(conversation.id);
      const runtime = overview?.runtime ?? null;
      return {
        conversationId: conversation.id,
        exists: true,
        type: conversation.type,
        source: conversation.source || 'loksystem',
        workspace: conversation.extra?.workspace,
        status: runtime?.status || conversation.status || 'finished',
        runtime,
        record: overview?.record ?? null,
        persistedAt: conversation.modifyTime,
      };
    });
  }

  public async getSlashCommands(conversationId: string) {
    try {
      const conversation = await this.conversationService.getConversation(conversationId);
      if (!conversation || conversation.type !== 'acp') {
        return { success: true as const, data: { commands: [] } };
      }

      const task = this.taskRuntimeService.getTask(conversationId) as unknown as AcpAgentManager | undefined;
      if (!task || task.type !== 'acp') {
        return { success: true as const, data: { commands: [] } };
      }

      const commands = await task.loadAcpSlashCommands();
      return { success: true as const, data: { commands } };
    } catch (error) {
      return {
        success: false as const,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async persistLoadedSkillsSnapshot(
    conversation: TChatConversation,
    extra: {
      enabledSkills?: string[];
      excludeBuiltinSkills?: string[];
    }
  ): Promise<void> {
    try {
      const skillManager = AcpSkillManager.getInstance(extra.enabledSkills);
      await skillManager.discoverSkills(extra.enabledSkills, extra.excludeBuiltinSkills);
      const excludeSet = new Set(extra.excludeBuiltinSkills ?? []);
      const loadedSkills = skillManager.getSkillsIndex().filter((skill) => !excludeSet.has(skill.name));
      if (loadedSkills.length > 0) {
        const updatedExtra = { ...conversation.extra, loadedSkills };
        await this.conversationService.updateConversation(
          conversation.id,
          {
            extra: updatedExtra,
          } as Partial<typeof conversation>
        );
        conversation.extra = updatedExtra as typeof conversation.extra;
      }
    } catch (error) {
      console.warn('[CoreSessionService] Failed to discover skills at creation:', error);
    }
  }
}
