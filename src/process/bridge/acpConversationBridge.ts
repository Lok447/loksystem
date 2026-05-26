/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import { ipcBridge } from '@/common';
import { CoreAcpGatewayService } from '@process/core/acp';
import { CoreTaskRuntimeService } from '@process/core/tasks';

export function initAcpConversationBridge(workerTaskManager: IWorkerTaskManager): void {
  const taskRuntimeService = new CoreTaskRuntimeService(workerTaskManager);
  const acpGatewayService = new CoreAcpGatewayService(taskRuntimeService);

  ipcBridge.acpConversation.checkEnv.provider(() => {
    return Promise.resolve(acpGatewayService.getEnvironmentSummary());
  });

  ipcBridge.acpConversation.detectCliPath.provider(({ backend }) => {
    return Promise.resolve(acpGatewayService.detectCliPath(backend));
  });

  ipcBridge.acpConversation.getAvailableAgents.provider(() => {
    return Promise.resolve(acpGatewayService.getAvailableAgents());
  });

  ipcBridge.acpConversation.refreshCustomAgents.provider(async () => {
    await acpGatewayService.refreshCustomAgents();
    return { success: true };
  });

  ipcBridge.acpConversation.testCustomAgent.provider(async (params) => {
    const { testCustomAgentConnection } = await import('./testCustomAgentConnection');
    return testCustomAgentConnection(params);
  });

  ipcBridge.acpConversation.checkAgentHealth.provider(async ({ backend }) => {
    return acpGatewayService.checkAgentHealth(backend);
  });

  ipcBridge.acpConversation.getMode.provider(({ conversationId }) => {
    return Promise.resolve(acpGatewayService.getMode(conversationId));
  });

  ipcBridge.acpConversation.getModelInfo.provider(({ conversationId }) => {
    return Promise.resolve(acpGatewayService.getModelInfo(conversationId));
  });

  ipcBridge.acpConversation.setModel.provider(async ({ conversationId, modelId }) => {
    return acpGatewayService.setModel(conversationId, modelId);
  });

  ipcBridge.acpConversation.setMode.provider(async ({ conversationId, mode }) => {
    return acpGatewayService.setMode(conversationId, mode);
  });

  ipcBridge.acpConversation.getConfigOptions.provider(({ conversationId }) => {
    return Promise.resolve(acpGatewayService.getConfigOptions(conversationId));
  });

  ipcBridge.acpConversation.setConfigOption.provider(async ({ conversationId, configId, value }) => {
    return acpGatewayService.setConfigOption(conversationId, configId, value);
  });
}
