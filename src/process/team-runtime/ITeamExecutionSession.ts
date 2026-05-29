import type { TeamExecutionEngineId, TeamOrchestrationMode } from '@/common/types/teamTypes';
import type { TeamAgent } from '@process/team/types';

export type TeamExecutionSessionState = 'created' | 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';

export type TeamExecutionContext = {
  runtimeVersion?: string;
  leaderBackend?: string;
  memberCount?: number;
  compatibilityMode?: 'legacy_mailbox' | 'native_compatibility_bridge';
  engineReadiness?: 'ready' | 'stub';
  routingMode?: 'off' | 'shadow' | 'enabled';
  requestedExecutionKind?: TeamExecutionEngineId;
};

export type TeamExecutionDiagnostics = {
  summary: string[];
  fallbackReason?: string;
};

export type TeamExecutionRecoverySource = 'fresh' | 'live_session' | 'persisted_snapshot';

export type TeamExecutionRecoveryMode =
  | 'none'
  | 'restart'
  | 'mailbox_replay'
  | 'native_replay'
  | 'protocol_replay'
  | 'gateway_replay'
  | 'native_resume';

export type TeamExecutionRecoveryInfo = {
  source: TeamExecutionRecoverySource;
  snapshotAvailable: boolean;
  replayReady: boolean;
  resumeReady: boolean;
  preferredMode: TeamExecutionRecoveryMode;
  snapshotCapturedAt?: number;
  lastEventAt?: number;
  lastKnownState?: TeamExecutionSessionState;
  notes?: string[];
};

export type TeamExecutionRecoveryAction =
  | 'restart_runtime'
  | 'rebuild_mailbox_runtime'
  | 'replay_mailbox_messages'
  | 'rebuild_native_runtime'
  | 'replay_native_context'
  | 'rebuild_protocol_runtime'
  | 'replay_protocol_coordination'
  | 'rebuild_gateway_runtime'
  | 'replay_gateway_session'
  | 'resume_native_session'
  | 'inspect_diagnostics';

export type TeamExecutionRecoveryPlanStep = {
  id: string;
  title: string;
  action: TeamExecutionRecoveryAction;
  status: 'pending' | 'ready' | 'blocked';
  detail?: string;
};

export type TeamExecutionRecoveryPlan = {
  status: 'not_available' | 'planned' | 'ready_for_replay' | 'ready_for_resume';
  mode: TeamExecutionRecoveryMode;
  steps: TeamExecutionRecoveryPlanStep[];
  blockers: string[];
  summary: string[];
};

export type TeamExecutionInfo = {
  teamId: string;
  executionKind: TeamExecutionEngineId;
  orchestrationMode: TeamOrchestrationMode;
  state: TeamExecutionSessionState;
  context?: TeamExecutionContext;
  diagnostics?: TeamExecutionDiagnostics;
  recovery?: TeamExecutionRecoveryInfo;
  recoveryPlan?: TeamExecutionRecoveryPlan;
};

export interface ITeamExecutionSession {
  readonly teamId: string;
  readonly executionKind: TeamExecutionEngineId;

  start(): Promise<void>;
  getExecutionInfo(): TeamExecutionInfo;
  getStdioConfig(agentSlotId?: string): unknown | null;
  sendMessage(content: string, files?: string[]): Promise<void>;
  sendMessageToAgent(slotId: string, content: string, options?: { silent?: boolean; files?: string[] }): Promise<void>;
  renameAgent(slotId: string, newName: string): void;
  addAgent(agent: TeamAgent): void;
  removeAgent(slotId: string): void;
  getAgents(): TeamAgent[];
  dispose(): Promise<void>;
}
