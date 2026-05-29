import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { ITeamRepository } from '@process/team/repository/ITeamRepository';
import type { TeamAgent, TTeam } from '@process/team/types';
import type { TeamExecutionEngineId, TeamOrchestrationMode } from '@/common/types/teamTypes';
import type { ITeamExecutionSession, TeamExecutionContext, TeamExecutionDiagnostics } from './ITeamExecutionSession';

export type TeamExecutionEngineKind = TeamExecutionEngineId;

export type TeamExecutionSessionMetadata = {
  routingMode?: 'off' | 'shadow' | 'enabled';
  requestedExecutionKind?: TeamExecutionEngineKind;
  fallbackReason?: string;
  context?: Partial<TeamExecutionContext>;
  diagnostics?: Partial<TeamExecutionDiagnostics>;
};

export type TeamExecutionSpawnAgentFn = (
  agentName: string,
  agentType?: string,
  model?: string,
  customAgentId?: string
) => Promise<TeamAgent>;

export type CreateTeamExecutionSessionParams = {
  team: TTeam;
  repo: ITeamRepository;
  workerTaskManager: IWorkerTaskManager;
  spawnAgent?: TeamExecutionSpawnAgentFn;
  executionMetadata?: TeamExecutionSessionMetadata;
};

export interface ITeamOrchestrationEngine {
  readonly kind: TeamExecutionEngineKind;
  readonly orchestrationMode: TeamOrchestrationMode;
  readonly readiness: 'ready' | 'stub';
  createSession(params: CreateTeamExecutionSessionParams): ITeamExecutionSession | Promise<ITeamExecutionSession>;
}
