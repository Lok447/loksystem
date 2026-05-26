/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import type { BuildConversationOptions } from '@process/task/agentTypes';
import type { AgentKillReason, IAgentManager } from '@process/task/IAgentManager';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import AcpAgentManager from '@process/task/AcpAgentManager';
import { AionrsApprovalStore, AionrsManager } from '@process/task/AionrsManager';
import type OpenClawAgentManager from '@process/task/OpenClawAgentManager';
import { getBuiltinSkillsCopyDir, getSkillsDir } from '@process/utils/initStorage';
import { prepareFirstMessage } from '@process/task/agentUtils';
import { coreEventBus } from '@process/core/shared/CoreEventBus';
import type { CoreRuntimeConfigDto, CoreServiceResponse } from '@process/core/shared/CoreContracts';

export type CoreTaskSnapshot = {
  id: string;
  type: IAgentManager['type'];
  status: IAgentManager['status'];
  workspace: string;
  lastActivityAt: number;
};

export class CoreTaskRuntimeService {
  constructor(private readonly workerTaskManager: IWorkerTaskManager) {}

  public getTask(id: string): IAgentManager | undefined {
    return this.workerTaskManager.getTask(id);
  }

  public async getOrBuildTask(id: string, options?: BuildConversationOptions): Promise<IAgentManager> {
    return this.workerTaskManager.getOrBuildTask(id, options);
  }

  public getTaskSnapshot(id: string): CoreTaskSnapshot | null {
    const task = this.workerTaskManager.getTask(id);
    if (!task) return null;

    return {
      id,
      type: task.type,
      status: task.status,
      workspace: task.workspace,
      lastActivityAt: task.lastActivityAt,
    };
  }

  public listTasks() {
    return this.workerTaskManager.listTasks();
  }

  public killTask(id: string, reason?: AgentKillReason): void {
    this.workerTaskManager.kill(id, reason);
    coreEventBus.emit('task', 'task.runtime.updated', {
      action: 'killed',
      conversationId: id,
      reason,
    });
  }

  public async clear(): Promise<void> {
    await this.workerTaskManager.clear();
  }

  public async stopTask(conversationId: string): Promise<{ success: boolean; msg?: string }> {
    const task = this.workerTaskManager.getTask(conversationId);
    if (!task) return { success: true, msg: 'conversation not found' };
    await task.stop();
    coreEventBus.emit('task', 'task.runtime.updated', {
      action: 'stopped',
      conversationId,
      status: task.status,
    });
    return { success: true };
  }

  public getAcpLikeTask(id: string): AcpAgentManager | AionrsManager | null {
    const task = this.workerTaskManager.getTask(id);
    if (task instanceof AcpAgentManager || task instanceof AionrsManager) {
      return task;
    }
    return null;
  }

  public getAcpTask(id: string): AcpAgentManager | null {
    const task = this.workerTaskManager.getTask(id);
    return task instanceof AcpAgentManager ? task : null;
  }

  public async getOrBuildAcpLikeTask(id: string): Promise<AcpAgentManager | AionrsManager | null> {
    const task = await this.workerTaskManager.getOrBuildTask(id);
    if (task instanceof AcpAgentManager || task instanceof AionrsManager) {
      return task;
    }
    return null;
  }

  public async getOrBuildAcpTask(id: string): Promise<AcpAgentManager | null> {
    const task = await this.workerTaskManager.getOrBuildTask(id);
    return task instanceof AcpAgentManager ? task : null;
  }

  public async getOpenClawRuntimeTask(id: string): Promise<OpenClawAgentManager | null> {
    const task = (await this.workerTaskManager.getOrBuildTask(id)) as unknown as OpenClawAgentManager | undefined;
    if (!task || task.type !== 'openclaw-gateway') {
      return null;
    }
    return task;
  }

  public async warmupConversation(conversationId: string): Promise<IAgentManager> {
    const task = await this.workerTaskManager.getOrBuildTask(conversationId);
    if (task.type === 'acp') {
      await (task as unknown as AcpAgentManager).initAgent();
    }
    return task;
  }

  public async resetConversation(id?: string): Promise<void> {
    if (id) {
      this.killTask(id);
      return;
    }
    await this.clear();
  }

  public async reloadContext(conversationId: string): Promise<CoreServiceResponse> {
    try {
      const task = await this.workerTaskManager.getOrBuildTask(conversationId).catch((): undefined => undefined);
      if (!task) {
        return { success: false, msg: 'conversation not found' };
      }
      return { success: false, msg: 'reloadContext is no longer supported after Gemini removal' };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public async setRuntimeConfig(
    conversationId: string,
    config: CoreRuntimeConfigDto
  ): Promise<CoreServiceResponse> {
    try {
      const task = await this.workerTaskManager.getOrBuildTask(conversationId).catch((): undefined => undefined);
      if (!task) {
        return { success: false, msg: 'conversation not found' };
      }

      if ('setConfig' in task && typeof (task as { setConfig?: (value: typeof config) => void }).setConfig === 'function') {
        (task as { setConfig: (value: typeof config) => void }).setConfig(config);
        coreEventBus.emit('task', 'task.runtime.updated', {
          action: 'config_updated',
          conversationId,
          config,
        });
        return { success: true };
      }

      return { success: false, msg: 'Runtime config changes not yet supported' };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public async sendMessage(params: {
    conversation_id: string;
    files?: string[];
    input: string;
    injectSkills?: string[];
    [key: string]: unknown;
  }): Promise<{ success: boolean; msg?: string }> {
    if (!params) {
      return { success: false, msg: 'Missing request parameters' };
    }

    const { conversation_id, files, ...other } = params;
    let task: IAgentManager | undefined;
    try {
      task = await this.workerTaskManager.getOrBuildTask(conversation_id);
    } catch (error) {
      console.error(`[CoreTaskRuntimeService] sendMessage: failed to get/build task: ${conversation_id}`, error);
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'conversation not found',
      };
    }

    if (!task) {
      return { success: false, msg: 'conversation not found' };
    }

    const workspaceFiles = (files ?? []).filter((filePath) => path.isAbsolute(filePath));

    if (workspaceFiles.length > 0) {
      let workspaceCount = 0;
      let externalCount = 0;

      for (const filePath of workspaceFiles) {
        const resolvedFile = path.resolve(filePath);
        if (task.workspace && resolvedFile.startsWith(path.resolve(task.workspace) + path.sep)) {
          workspaceCount++;
        } else {
          externalCount++;
        }
      }

      console.log(
        `[CoreTaskRuntimeService] sendMessage files (${conversation_id}): workspace=${workspaceCount}, external=${externalCount}`
      );
    }

    let agentContent = other.input as string;
    if (Array.isArray(other.injectSkills) && other.injectSkills.length > 0) {
      agentContent = await prepareFirstMessage(other.input as string, {
        enabledSkills: other.injectSkills,
      });
      const skillsDir = getSkillsDir();
      const builtinSkillsCopyDir = getBuiltinSkillsCopyDir();
      agentContent = agentContent.replace(
        '[User Request]',
        `[Skills Directory]
Builtin skills: ${builtinSkillsCopyDir}
User skills: ${skillsDir}
When skill instructions reference relative paths like "skills/{name}/scripts/...", resolve them under the appropriate directory.

[User Request]`
      );
    }

    try {
      await task.sendMessage({
        ...other,
        content: other.input,
        files: workspaceFiles,
        agentContent,
      });

      coreEventBus.emit('task', 'task.runtime.updated', {
        action: 'message_sent',
        conversationId: conversation_id,
        fileCount: workspaceFiles.length,
        status: task.status,
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public confirm(conversationId: string, msgId: string, callId: string, data: unknown): { success: boolean; msg?: string } {
    const task = this.workerTaskManager.getTask(conversationId);
    if (!task) return { success: false, msg: 'conversation not found' };
    task.confirm(msgId, callId, data);
    coreEventBus.emit('task', 'task.runtime.updated', {
      action: 'confirmation_submitted',
      conversationId,
      msgId,
      callId,
    });
    return { success: true };
  }

  public listConfirmations(conversationId: string) {
    const task = this.workerTaskManager.getTask(conversationId);
    if (!task) return [];
    return task.getConfirmations();
  }

  public checkApproval(conversationId: string, action: string, commandType?: string): boolean {
    const task = this.workerTaskManager.getTask(conversationId) as unknown as AionrsManager | undefined;
    if (!task || !('approvalStore' in task) || !task.approvalStore) {
      return false;
    }

    if (task.type === 'aionrs') {
      const keys = AionrsApprovalStore.createKeysFromConfirmation(action, commandType);
      if (keys.length === 0) return false;
      return task.approvalStore.allApproved(keys);
    }

    return false;
  }
}
