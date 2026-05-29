import type { TeamExecutionInfo } from '../ITeamExecutionSession';

export type TeamRuntimeEventLevel = 'info' | 'warning' | 'error';

export type TeamRuntimeEvent = {
  id: string;
  teamId: string;
  at: number;
  type:
    | 'routing_selected'
    | 'session_started'
    | 'session_stopped'
    | 'session_failed'
    | 'snapshot_recovered'
    | 'recovery_plan_prepared'
    | 'recovery_plan_executed'
    | 'recovery_plan_failed'
    | 'agent_degraded'
    | 'protocol_dispatch'
    | 'protocol_progress'
    | 'protocol_completed'
    | 'protocol_failed'
    | 'protocol_reassigned'
    | 'gateway_dispatch'
    | 'gateway_progress'
    | 'gateway_completed'
    | 'gateway_failed'
    | 'gateway_degraded'
    | 'gateway_recovered'
    | 'task_snapshot_refreshed'
    | 'diagnostics_refreshed';
  level: TeamRuntimeEventLevel;
  message: string;
  details?: Record<string, unknown>;
};

export type TeamTaskDiagnostics = {
  pending: number;
  inProgress: number;
  completed: number;
  waiting: Array<{
    taskId: string;
    subject: string;
    blockedBy: string[];
    owner?: string;
  }>;
};

export type TeamProtocolOwnershipRecord = {
  taskId: string;
  subject: string;
  owner?: string;
  previousOwner?: string;
  ownershipStatus: 'assigned' | 'unassigned' | 'reassigned' | 'returned_to_leader' | 'blocked';
  taskStatus?: 'pending' | 'in_progress' | 'completed' | 'deleted' | 'failed';
  updatedAt: number;
  workerBackend?: string;
  leaderSummary?: string;
  recoveryHint?: string;
  recoveryAction?: string;
  recoveryMode?: string;
};

export type TeamProtocolRecoveryHint = {
  taskId?: string;
  slotId?: string;
  owner?: string;
  workerBackend?: string;
  recoveryAction?: string;
  recoveryMode?: string;
  leaderSummary: string;
  recoveryHint?: string;
  updatedAt: number;
  sourceEventType: TeamRuntimeEvent['type'];
};

export type TeamProtocolDiagnostics = {
  activeOwners: Array<{
    ownerId: string;
    taskCount: number;
    taskIds: string[];
  }>;
  ownership: TeamProtocolOwnershipRecord[];
  recentRecovery: TeamProtocolRecoveryHint[];
  leaderSummaries: Array<{
    eventId: string;
    at: number;
    slotId?: string;
    taskId?: string;
    summary: string;
  }>;
};

export type TeamGatewayLifecycleRecord = {
  slotId: string;
  agentName?: string;
  workerBackend?: string;
  gatewaySessionId?: string;
  lifecycleState:
    | 'connecting'
    | 'connected'
    | 'session_active'
    | 'reconnecting'
    | 'disconnected'
    | 'degraded'
    | 'recovering'
    | 'completed'
    | 'failed';
  runtimeStatus?: 'connecting' | 'connected' | 'session_active' | 'reconnecting' | 'disconnected' | 'idle';
  degradedReason?: string;
  recoveryHint?: string;
  recoveryAction?: string;
  recoveryMode?: string;
  updatedAt: number;
  sourceEventType: TeamRuntimeEvent['type'];
};

export type TeamGatewayTaskOwnershipRecord = {
  taskId: string;
  subject: string;
  owner?: string;
  workerBackend?: string;
  gatewaySessionId?: string;
  taskStatus?: 'pending' | 'in_progress' | 'completed' | 'deleted' | 'failed';
  updatedAt: number;
  lifecycleState?: TeamGatewayLifecycleRecord['lifecycleState'];
  degradedReason?: string;
  recoveryHint?: string;
  recoveryAction?: string;
  recoveryMode?: string;
};

export type TeamGatewayDiagnostics = {
  activeSessions: Array<{
    slotId: string;
    gatewaySessionId?: string;
    lifecycleState: TeamGatewayLifecycleRecord['lifecycleState'];
    taskCount: number;
  }>;
  lifecycle: TeamGatewayLifecycleRecord[];
  taskOwnership: TeamGatewayTaskOwnershipRecord[];
};

export type TeamRuntimeSnapshot = {
  teamId: string;
  capturedAt: number;
  executionInfo: TeamExecutionInfo;
  degradedMembers: Array<{
    slotId: string;
    agentName: string;
    reason: string;
  }>;
  taskDiagnostics: TeamTaskDiagnostics;
  protocolDiagnostics: TeamProtocolDiagnostics;
  gatewayDiagnostics?: TeamGatewayDiagnostics;
  timeline: TeamRuntimeEvent[];
};

export type TeamRuntimeDiagnostics = TeamRuntimeSnapshot & {
  summary: string[];
};

export type TeamRuntimeRecoveryStatus = 'none' | 'recovered_snapshot' | 'live_session';

export type TeamRecoveredRuntimeDiagnostics = TeamRuntimeDiagnostics & {
  recoveryStatus: TeamRuntimeRecoveryStatus;
  recoveredFromSnapshotAt?: number;
};
