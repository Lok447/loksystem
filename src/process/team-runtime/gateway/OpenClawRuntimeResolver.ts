import type { AgentStatus } from '@process/task/agentTypes';
import type { IAgentManager } from '@process/task/IAgentManager';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { TeamAgent } from '@process/team/types';

export type GatewayRuntimeStatus =
  | 'connecting'
  | 'connected'
  | 'session_active'
  | 'reconnecting'
  | 'disconnected'
  | 'idle';

export type GatewayLifecycleState =
  | 'connecting'
  | 'connected'
  | 'session_active'
  | 'reconnecting'
  | 'disconnected'
  | 'degraded'
  | 'recovering'
  | 'completed'
  | 'failed';

export type GatewayRuntimeSnapshot = {
  slotId: string;
  conversationId: string;
  workerBackend: string;
  gatewaySessionId?: string;
  cliPath?: string;
  managerStatus?: AgentStatus;
  isConnected: boolean;
  hasActiveSession: boolean;
  runtimeStatus: GatewayRuntimeStatus;
  lifecycleState: GatewayLifecycleState;
  statusReason: string;
};

type OpenClawTaskDiagnostics = {
  cliPath?: string | null;
  isConnected?: boolean;
  hasActiveSession?: boolean;
  sessionKey?: string | null;
};

function isGatewayAgent(agent: TeamAgent): boolean {
  return agent.agentType === 'openclaw-gateway' || agent.conversationType === 'openclaw-gateway';
}

function readTaskDiagnostics(task: IAgentManager | undefined): OpenClawTaskDiagnostics | null {
  if (!task || task.type !== 'openclaw-gateway') {
    return null;
  }

  if (!('getDiagnostics' in task) || typeof task.getDiagnostics !== 'function') {
    return null;
  }

  const diagnostics = task.getDiagnostics() as Record<string, unknown> | null | undefined;
  if (!diagnostics) {
    return null;
  }

  return {
    cliPath: typeof diagnostics.cliPath === 'string' ? diagnostics.cliPath : null,
    isConnected: diagnostics.isConnected === true,
    hasActiveSession: diagnostics.hasActiveSession === true,
    sessionKey: typeof diagnostics.sessionKey === 'string' ? diagnostics.sessionKey : null,
  };
}

function resolveRuntimeStatus(params: {
  managerStatus?: AgentStatus;
  isConnected: boolean;
  hasActiveSession: boolean;
  sessionKey?: string;
}): { runtimeStatus: GatewayRuntimeStatus; lifecycleState: GatewayLifecycleState; statusReason: string } {
  const { managerStatus, isConnected, hasActiveSession, sessionKey } = params;

  if (hasActiveSession && sessionKey) {
    return {
      runtimeStatus: 'session_active',
      lifecycleState: 'session_active',
      statusReason: 'gateway_session_active',
    };
  }

  if (isConnected) {
    return {
      runtimeStatus: 'connected',
      lifecycleState: 'connected',
      statusReason: 'gateway_connected_without_session',
    };
  }

  if (managerStatus === 'running' && sessionKey) {
    return {
      runtimeStatus: 'reconnecting',
      lifecycleState: 'reconnecting',
      statusReason: 'gateway_reconnecting_saved_session',
    };
  }

  if (managerStatus === 'finished' && sessionKey) {
    return {
      runtimeStatus: 'disconnected',
      lifecycleState: 'disconnected',
      statusReason: 'gateway_disconnected_saved_session',
    };
  }

  if (managerStatus === 'pending' || managerStatus === 'running') {
    return {
      runtimeStatus: 'connecting',
      lifecycleState: 'connecting',
      statusReason: 'gateway_connecting',
    };
  }

  return {
    runtimeStatus: 'idle',
    lifecycleState: 'disconnected',
    statusReason: 'gateway_runtime_idle',
  };
}

export function resolveGatewayRuntimeSnapshot(
  workerTaskManager: IWorkerTaskManager,
  agent: TeamAgent
): GatewayRuntimeSnapshot | null {
  if (!isGatewayAgent(agent) || !agent.conversationId) {
    return null;
  }

  const task = workerTaskManager.getTask(agent.conversationId);
  const diagnostics = readTaskDiagnostics(task);
  const managerStatus = task?.status;
  const sessionKey = diagnostics?.sessionKey ?? undefined;
  const isConnected = diagnostics?.isConnected === true;
  const hasActiveSession = diagnostics?.hasActiveSession === true;
  const state = resolveRuntimeStatus({
    managerStatus,
    isConnected,
    hasActiveSession,
    sessionKey,
  });

  return {
    slotId: agent.slotId,
    conversationId: agent.conversationId,
    workerBackend: agent.agentType,
    gatewaySessionId: sessionKey,
    cliPath: diagnostics?.cliPath ?? agent.cliPath,
    managerStatus,
    isConnected,
    hasActiveSession,
    runtimeStatus: state.runtimeStatus,
    lifecycleState: state.lifecycleState,
    statusReason: state.statusReason,
  };
}
