/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Singleton WorkerTaskManager wired with all registered agent creators.
 * Extracted to a separate module to avoid circular dependencies with initBridge.ts.
 */

import { AgentFactory } from './AgentFactory';
import { WorkerTaskManager } from './WorkerTaskManager';
import { SqliteConversationRepository } from '@process/services/database/SqliteConversationRepository';
import AcpAgentManager from './AcpAgentManager';
import OpenClawAgentManager from './OpenClawAgentManager';
import NanoBotAgentManager from './NanoBotAgentManager';
import RemoteAgentManager from './RemoteAgentManager';
import { AionrsManager } from './AionrsManager';

const agentFactory = new AgentFactory();

// Legacy gemini conversations now reuse the Lok CLI runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createLokCliManager = (conv: any, opts?: { yoloMode?: boolean }) =>
  new AionrsManager({ ...conv.extra, conversation_id: conv.id, yoloMode: opts?.yoloMode }, conv.model) as unknown as
    ReturnType<typeof agentFactory.create>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
agentFactory.register('gemini', createLokCliManager);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
agentFactory.register('acp', (conv, opts) => {
  const c = conv as any;
  return new AcpAgentManager({
    ...c.extra,
    conversation_id: c.id,
    yoloMode: opts?.yoloMode,
    // Only gemini ACP conversations use conversation.model as a backend-aligned model
    // fallback. Other ACP backends persist their own CLI model IDs in extra.currentModelId.
    currentModelId: c.extra?.currentModelId ?? (c.extra?.backend === 'gemini' ? c.model?.useModel : undefined),
  }) as unknown as ReturnType<typeof agentFactory.create>;
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
agentFactory.register('openclaw-gateway', (conv, opts) => {
  const c = conv as any;
  return new OpenClawAgentManager({
    ...c.extra,
    conversation_id: c.id,
    yoloMode: opts?.yoloMode,
  }) as unknown as ReturnType<typeof agentFactory.create>;
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
agentFactory.register('nanobot', (conv, opts) => {
  const c = conv as any;
  return new NanoBotAgentManager({
    ...c.extra,
    conversation_id: c.id,
    yoloMode: opts?.yoloMode,
  }) as unknown as ReturnType<typeof agentFactory.create>;
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
agentFactory.register('remote', (conv, opts) => {
  const c = conv as any;
  return new RemoteAgentManager({
    ...c.extra,
    conversation_id: c.id,
    yoloMode: opts?.yoloMode,
  }) as unknown as ReturnType<typeof agentFactory.create>;
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
agentFactory.register('aionrs', createLokCliManager);

const conversationRepo = new SqliteConversationRepository();
export const workerTaskManager = new WorkerTaskManager(agentFactory, conversationRepo);
