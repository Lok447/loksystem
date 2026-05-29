import type { TeamAgent, TTeam } from '@process/team/types';
import type { TeamRuntimeDiagnostics } from '../diagnostics';
import type { TeamExecutionRecoveryAction, TeamExecutionRecoveryMode } from '../ITeamExecutionSession';
import type { OpenClawWorkerContract } from './OpenClawMemberAdapter';
import { isTeamExecutionRecoveryAction, isTeamExecutionRecoveryMode } from './gatewayRecoveryTypes';

export type GatewayReplayTarget = {
  slotId: string;
  role: 'leader' | 'worker';
  agentName: string;
  backend?: string;
  conversationId?: string;
  gatewaySessionId?: string;
  lifecycleState?: string;
  degradedReason?: string;
  taskIds: string[];
  taskSubjects: string[];
  recoveryActions: TeamExecutionRecoveryAction[];
  recoveryModes: TeamExecutionRecoveryMode[];
  latestRecoveryHint?: string;
  supportsResume?: boolean;
  supportsStructuredTasks?: boolean;
};

export type GatewayReplayContext = {
  kind: 'gateway';
  leaderSlotId?: string;
  generatedAt: number;
  summary: string[];
  replaySteps: string[];
  targets: GatewayReplayTarget[];
};

type BuildGatewayReplayContextParams = {
  team: Pick<TTeam, 'agents' | 'leaderAgentId'>;
  diagnostics: TeamRuntimeDiagnostics | null;
  workerContracts?: OpenClawWorkerContract[];
};

export function buildGatewayReplayContext(params: BuildGatewayReplayContextParams): GatewayReplayContext {
  const agents = params.team.agents ?? [];
  const diagnostics = params.diagnostics;
  const leader = agents.find((agent) => agent.role === 'leader');
  const workerContractsBySlotId = new Map((params.workerContracts ?? []).map((worker) => [worker.slotId, worker]));
  const targetMap = new Map<string, GatewayReplayTarget>();

  for (const agent of agents) {
    const workerContract = workerContractsBySlotId.get(agent.slotId);
    targetMap.set(agent.slotId, {
      slotId: agent.slotId,
      role: agent.role === 'leader' ? 'leader' : 'worker',
      agentName: agent.agentName,
      backend: workerContract?.backend ?? agent.agentType,
      conversationId: workerContract?.conversationId ?? agent.conversationId,
      gatewaySessionId: workerContract?.gatewaySessionId,
      taskIds: [],
      taskSubjects: [],
      recoveryActions: [],
      recoveryModes: [],
      supportsResume: workerContract?.supportsResume,
      supportsStructuredTasks: workerContract?.supportsStructuredTasks,
    });
  }

  const gatewayLifecycle = diagnostics?.gatewayDiagnostics?.lifecycle ?? [];
  for (const record of gatewayLifecycle) {
    const target = record.slotId ? targetMap.get(record.slotId) : undefined;
    if (!target) continue;
    target.lifecycleState = record.lifecycleState;
    target.degradedReason = record.degradedReason ?? target.degradedReason;
    target.latestRecoveryHint = record.recoveryHint ?? target.latestRecoveryHint;
    if (isTeamExecutionRecoveryAction(record.recoveryAction) && !target.recoveryActions.includes(record.recoveryAction)) {
      target.recoveryActions.push(record.recoveryAction);
    }
    if (isTeamExecutionRecoveryMode(record.recoveryMode) && !target.recoveryModes.includes(record.recoveryMode)) {
      target.recoveryModes.push(record.recoveryMode);
    }
  }

  const taskOwnership = diagnostics?.gatewayDiagnostics?.taskOwnership ?? [];
  for (const record of taskOwnership) {
    const target = record.owner ? targetMap.get(record.owner) : undefined;
    if (!target) continue;
    if (!target.taskIds.includes(record.taskId)) {
      target.taskIds.push(record.taskId);
    }
    if (!target.taskSubjects.includes(record.subject)) {
      target.taskSubjects.push(record.subject);
    }
    if (isTeamExecutionRecoveryAction(record.recoveryAction) && !target.recoveryActions.includes(record.recoveryAction)) {
      target.recoveryActions.push(record.recoveryAction);
    }
    if (isTeamExecutionRecoveryMode(record.recoveryMode) && !target.recoveryModes.includes(record.recoveryMode)) {
      target.recoveryModes.push(record.recoveryMode);
    }
    if (record.recoveryHint) {
      target.latestRecoveryHint = record.recoveryHint;
    }
  }

  const targets = [...targetMap.values()]
    .filter((target) => target.taskIds.length > 0 || target.lifecycleState || target.role === 'leader')
    .sort((left, right) => {
      if (left.role === right.role) {
        return right.taskIds.length - left.taskIds.length;
      }
      return left.role === 'leader' ? -1 : 1;
    });

  return {
    kind: 'gateway',
    leaderSlotId: leader?.slotId,
    generatedAt: Date.now(),
    summary: [
      `gateway_targets:${targets.length}`,
      `gateway_workers:${targets.filter((target) => target.role === 'worker').length}`,
      `gateway_tasks:${targets.reduce((count, target) => count + target.taskIds.length, 0)}`,
    ],
    replaySteps: targets.flatMap((target) => {
      const label = `${target.agentName} (${target.slotId})`;
      const tasks = target.taskSubjects.length > 0 ? target.taskSubjects.join(', ') : 'no captured task subjects';
      const lifecycle = target.lifecycleState ? `state=${target.lifecycleState}` : 'state=unknown';
      return [
        `Review ${label}: ${tasks}; ${lifecycle}.`,
        `Recover gateway flow${target.latestRecoveryHint ? `; ${target.latestRecoveryHint}` : '.'}`,
      ];
    }),
    targets,
  };
}
