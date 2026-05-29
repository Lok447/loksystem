import type { TeamExecutionRecoveryAction, TeamExecutionRecoveryMode } from '../ITeamExecutionSession';
import type { GatewayWorkerEventType } from './GatewayEventSink';
import type { GatewayLifecycleState, GatewayRuntimeStatus } from './OpenClawRuntimeResolver';

export type GatewayBootstrapMode = 'native_driver' | 'compatibility_bridge';
export type GatewayWarmupStrategy = 'skip_cache' | 'reuse_cache';
export type GatewayReplayStrategy = 'rebuild_session_then_wait' | 'rebuild_session_then_resume_tasks';

export type GatewayNativeLifecycleContract = {
  slotId: string;
  role: 'leader' | 'worker';
  backend: string;
  conversationId?: string;
  gatewaySessionId?: string;
  bootstrapMode: GatewayBootstrapMode;
  warmupStrategy: GatewayWarmupStrategy;
  runtimeStatus?: GatewayRuntimeStatus;
  lifecycleState?: GatewayLifecycleState;
  statusReason?: string;
  supportsStructuredTasks: boolean;
  supportsResume: boolean;
  supportsGatewayLifecycle: boolean;
};

export type GatewayReplayPlanTarget = {
  slotId: string;
  role: 'worker';
  agentName: string;
  backend?: string;
  gatewaySessionId?: string;
  lifecycleState?: GatewayLifecycleState;
  replayStrategy: GatewayReplayStrategy;
  resumeSupported: boolean;
  structuredTasksSupported: boolean;
  requiresLeaderRedispatch: boolean;
  recoveryActions: TeamExecutionRecoveryAction[];
  recoveryModes: TeamExecutionRecoveryMode[];
  taskIds: string[];
  taskSubjects: string[];
  latestRecoveryHint?: string;
};

export type GatewayReplayExecutionPlan = {
  kind: 'gateway';
  generatedAt: number;
  summary: string[];
  targets: GatewayReplayPlanTarget[];
};

export type GatewayNativeResumeMode = 'off' | 'enabled';

export function selectGatewayBootstrapEventType(contract: GatewayNativeLifecycleContract): GatewayWorkerEventType {
  if (contract.lifecycleState === 'degraded' || contract.lifecycleState === 'failed') {
    return 'degrade';
  }
  if (contract.lifecycleState === 'reconnecting' || contract.lifecycleState === 'recovering') {
    return 'recover';
  }
  if (
    contract.lifecycleState === 'connected' ||
    contract.lifecycleState === 'session_active' ||
    contract.runtimeStatus === 'connected' ||
    contract.runtimeStatus === 'session_active'
  ) {
    return 'progress';
  }
  return 'dispatch';
}
