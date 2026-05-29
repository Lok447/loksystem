/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { CoreClientContract } from '@process/adapters/coreClient';

export function initCoreElectronClientAdapter(client: CoreClientContract): () => void {
  ipcBridge.core.sessions.getRuntimeState.provider(({ conversationId }) => {
    return client.sessions.getRuntimeState(conversationId);
  });

  ipcBridge.core.sessions.listRuntimeStates.provider(() => {
    return client.sessions.listRuntimeStates();
  });

  ipcBridge.core.conversations.get.provider(({ id }) => {
    return client.conversations.get(id);
  });

  ipcBridge.core.conversations.getAssociate.provider(({ conversationId }) => {
    return client.conversations.getAssociate(conversationId);
  });

  ipcBridge.core.conversations.listByCronJob.provider(({ cronJobId }) => {
    return client.conversations.listByCronJob(cronJobId);
  });

  ipcBridge.core.conversations.getSlashCommands.provider(({ conversationId }) => {
    return client.conversations.getSlashCommands(conversationId);
  });

  ipcBridge.core.conversations.sendMessage.provider((params) => {
    return client.conversations.sendMessage(params);
  });

  ipcBridge.core.conversations.stop.provider(({ conversationId }) => {
    return client.conversations.stop(conversationId);
  });

  ipcBridge.core.tasks.getRuntimeOverview.provider(({ conversationId }) => {
    return client.tasks.getRuntimeOverview(conversationId);
  });

  ipcBridge.core.tasks.listRuntimeOverviews.provider(() => {
    return client.tasks.listRuntimeOverviews();
  });

  ipcBridge.core.acp.getSessionSnapshot.provider(({ conversationId }) => {
    return client.acp.getSessionSnapshot(conversationId);
  });

  ipcBridge.core.acp.getAvailableAgents.provider(() => {
    return client.acp.getAvailableAgents();
  });

  ipcBridge.core.acp.refreshCustomAgents.provider(() => {
    return client.acp.refreshCustomAgents();
  });

  ipcBridge.core.acp.checkAgentHealth.provider(({ backend }) => {
    return client.acp.checkAgentHealth(backend);
  });

  ipcBridge.core.acp.setModel.provider(({ conversationId, modelId }) => {
    return client.acp.setModel(conversationId, modelId);
  });

  ipcBridge.core.acp.setMode.provider(({ conversationId, mode }) => {
    return client.acp.setMode(conversationId, mode);
  });

  ipcBridge.core.acp.setConfigOption.provider(({ conversationId, configId, value }) => {
    return client.acp.setConfigOption(conversationId, configId, value);
  });

  ipcBridge.core.workspaces.getTree.provider((params) => {
    return client.workspaces.getTree(params);
  });

  ipcBridge.core.teams.create.provider((params) => {
    return client.teams.create(params);
  });

  ipcBridge.core.teams.list.provider(({ userId }) => {
    return client.teams.list(userId);
  });

  ipcBridge.core.teams.get.provider(({ id }) => {
    return client.teams.get(id);
  });

  ipcBridge.core.teams.getRuntimeDiagnostics.provider(({ teamId }) => {
    return client.teams.getRuntimeDiagnostics(teamId);
  });

  ipcBridge.core.teams.prepareRecoverySession.provider(({ teamId }) => {
    return client.teams.prepareRecoverySession(teamId);
  });

  ipcBridge.core.teams.executeRecoveryPlan.provider(({ teamId }) => {
    return client.teams.executeRecoveryPlan(teamId);
  });

  ipcBridge.core.teams.remove.provider(({ id }) => {
    return client.teams.remove(id);
  });

  ipcBridge.core.teams.addAgent.provider((params) => {
    return client.teams.addAgent(params);
  });

  ipcBridge.core.teams.removeAgent.provider(({ teamId, slotId }) => {
    return client.teams.removeAgent(teamId, slotId);
  });

  ipcBridge.core.teams.renameAgent.provider((params) => {
    return client.teams.renameAgent(params);
  });

  ipcBridge.core.teams.renameTeam.provider((params) => {
    return client.teams.renameTeam(params);
  });

  ipcBridge.core.teams.setSessionMode.provider((params) => {
    return client.teams.setSessionMode(params);
  });

  ipcBridge.core.teams.updateWorkspace.provider((params) => {
    return client.teams.updateWorkspace(params);
  });

  ipcBridge.core.teams.sendMessage.provider((params) => {
    return client.teams.sendMessage(params);
  });

  ipcBridge.core.teams.sendMessageToAgent.provider((params) => {
    return client.teams.sendMessageToAgent(params);
  });

  ipcBridge.core.teams.stop.provider(({ teamId }) => {
    return client.teams.stop(teamId);
  });

  ipcBridge.core.teams.ensureSession.provider(({ teamId }) => {
    return client.teams.ensureSession(teamId);
  });

  ipcBridge.core.uploads.createFile.provider((params) => {
    return client.uploads.createFile(params);
  });

  return client.events.subscribe((event) => {
    ipcBridge.core.events.stream.emit(event);
  });
}
