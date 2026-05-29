import type { TeamAgent, TTeam } from '@process/team/types';
import type { TeamRuntimeDiagnostics } from '../diagnostics';
import type { TeamExecutionRecoveryAction, TeamExecutionRecoveryMode } from '../ITeamExecutionSession';
import type { AcpWorkerContract } from './AcpMemberAdapter';
import { isTeamExecutionRecoveryAction, isTeamExecutionRecoveryMode } from '../gateway/gatewayRecoveryTypes';

export type ProtocolReplayTask = {
  taskId: string;
  subject: string;
  ownershipStatus?: string;
  taskStatus?: string;
  recoveryAction?: TeamExecutionRecoveryAction;
  recoveryMode?: TeamExecutionRecoveryMode;
  leaderSummary?: string;
  recoveryHint?: string;
};

export type ProtocolReplayTarget = {
  slotId: string;
  role: 'leader' | 'worker';
  agentName: string;
  backend?: string;
  conversationId?: string;
  taskIds: string[];
  taskSubjects: string[];
  tasks: ProtocolReplayTask[];
  recoveryActions: TeamExecutionRecoveryAction[];
  recoveryModes: TeamExecutionRecoveryMode[];
  latestLeaderSummary?: string;
  latestRecoveryHint?: string;
  supportsResume?: boolean;
  supportsStructuredTasks?: boolean;
};

export type ProtocolReplayExecutionAction = {
  action: TeamExecutionRecoveryAction;
  mode?: TeamExecutionRecoveryMode;
  taskIds: string[];
};

export type ProtocolReplayExecutionTarget = {
  slotId: string;
  role: 'leader' | 'worker';
  agentName: string;
  backend?: string;
  conversationId?: string;
  supportsResume?: boolean;
  supportsStructuredTasks?: boolean;
  replayTaskCount: number;
  replayTasks: ProtocolReplayTask[];
  replayActions: ProtocolReplayExecutionAction[];
  replayInstructions: string[];
};

export type ProtocolReplayExecutionPlan = {
  kind: 'protocol_replay_execution';
  leaderSlotId?: string;
  generatedAt: number;
  targetCount: number;
  replayTaskCount: number;
  targets: ProtocolReplayExecutionTarget[];
  summary: string[];
  steps: string[];
};

export type ProtocolReplayContext = {
  kind: 'protocol';
  leaderSlotId?: string;
  generatedAt: number;
  summary: string[];
  replaySteps: string[];
  targets: ProtocolReplayTarget[];
  executionPlan: ProtocolReplayExecutionPlan;
};

type BuildProtocolReplayContextParams = {
  team: Pick<TTeam, 'agents' | 'leaderAgentId'>;
  diagnostics: TeamRuntimeDiagnostics | null;
  workerContracts?: AcpWorkerContract[];
};

export function buildProtocolReplayContext(params: BuildProtocolReplayContextParams): ProtocolReplayContext {
  const agents = params.team.agents ?? [];
  const diagnostics = params.diagnostics;
  const leader = agents.find((agent) => agent.role === 'leader');
  const workerContractsBySlotId = new Map((params.workerContracts ?? []).map((worker) => [worker.slotId, worker]));
  const targetMap = new Map<string, ProtocolReplayTarget>();

  for (const agent of agents) {
    const workerContract = workerContractsBySlotId.get(agent.slotId);
    targetMap.set(agent.slotId, {
      slotId: agent.slotId,
      role: agent.role === 'leader' ? 'leader' : 'worker',
      agentName: agent.agentName,
      backend: workerContract?.backend ?? agent.agentType,
      conversationId: workerContract?.conversationId ?? agent.conversationId,
      taskIds: [],
      taskSubjects: [],
      tasks: [],
      recoveryActions: [],
      recoveryModes: [],
      supportsResume: workerContract?.supportsResume,
      supportsStructuredTasks: workerContract?.supportsStructuredTasks,
    });
  }

  const ownership = diagnostics?.protocolDiagnostics?.ownership ?? [];
  for (const record of ownership) {
    if (!record.owner) {
      continue;
    }

    const target = targetMap.get(record.owner);
    if (!target) {
      continue;
    }

    if (!target.taskIds.includes(record.taskId)) {
      target.taskIds.push(record.taskId);
    }
    if (!target.taskSubjects.includes(record.subject)) {
      target.taskSubjects.push(record.subject);
    }
    const existingTask = target.tasks.find((task) => task.taskId === record.taskId);
    if (existingTask) {
      existingTask.subject = record.subject;
      existingTask.ownershipStatus = record.ownershipStatus ?? existingTask.ownershipStatus;
      existingTask.taskStatus = record.taskStatus ?? existingTask.taskStatus;
      existingTask.recoveryAction = isTeamExecutionRecoveryAction(record.recoveryAction)
        ? record.recoveryAction
        : existingTask.recoveryAction;
      existingTask.recoveryMode = isTeamExecutionRecoveryMode(record.recoveryMode)
        ? record.recoveryMode
        : existingTask.recoveryMode;
      existingTask.leaderSummary = record.leaderSummary ?? existingTask.leaderSummary;
      existingTask.recoveryHint = record.recoveryHint ?? existingTask.recoveryHint;
    } else {
      target.tasks.push({
        taskId: record.taskId,
        subject: record.subject,
        ownershipStatus: record.ownershipStatus,
        taskStatus: record.taskStatus,
        recoveryAction: isTeamExecutionRecoveryAction(record.recoveryAction) ? record.recoveryAction : undefined,
        recoveryMode: isTeamExecutionRecoveryMode(record.recoveryMode) ? record.recoveryMode : undefined,
        leaderSummary: record.leaderSummary,
        recoveryHint: record.recoveryHint,
      });
    }
    if (isTeamExecutionRecoveryAction(record.recoveryAction) && !target.recoveryActions.includes(record.recoveryAction)) {
      target.recoveryActions.push(record.recoveryAction);
    }
    if (isTeamExecutionRecoveryMode(record.recoveryMode) && !target.recoveryModes.includes(record.recoveryMode)) {
      target.recoveryModes.push(record.recoveryMode);
    }
    if (record.leaderSummary) {
      target.latestLeaderSummary = record.leaderSummary;
    }
    if (record.recoveryHint) {
      target.latestRecoveryHint = record.recoveryHint;
    }
  }

  const recentRecovery = diagnostics?.protocolDiagnostics?.recentRecovery ?? [];
  for (const record of recentRecovery) {
    const targetSlotId = record.owner ?? record.slotId ?? leader?.slotId;
    if (!targetSlotId) {
      continue;
    }
    const target = targetMap.get(targetSlotId);
    if (!target) {
      continue;
    }

    if (record.taskId && !target.taskIds.includes(record.taskId)) {
      target.taskIds.push(record.taskId);
    }
    const existingTask = record.taskId ? target.tasks.find((task) => task.taskId === record.taskId) : undefined;
    if (record.taskId) {
      if (existingTask) {
        existingTask.recoveryAction = isTeamExecutionRecoveryAction(record.recoveryAction)
          ? record.recoveryAction
          : existingTask.recoveryAction;
        existingTask.recoveryMode = isTeamExecutionRecoveryMode(record.recoveryMode)
          ? record.recoveryMode
          : existingTask.recoveryMode;
        existingTask.leaderSummary = record.leaderSummary ?? existingTask.leaderSummary;
        existingTask.recoveryHint = record.recoveryHint ?? existingTask.recoveryHint;
      } else {
        target.tasks.push({
          taskId: record.taskId,
          subject: record.taskId,
          recoveryAction: isTeamExecutionRecoveryAction(record.recoveryAction) ? record.recoveryAction : undefined,
          recoveryMode: isTeamExecutionRecoveryMode(record.recoveryMode) ? record.recoveryMode : undefined,
          leaderSummary: record.leaderSummary,
          recoveryHint: record.recoveryHint,
        });
      }
    }
    if (isTeamExecutionRecoveryAction(record.recoveryAction) && !target.recoveryActions.includes(record.recoveryAction)) {
      target.recoveryActions.push(record.recoveryAction);
    }
    if (isTeamExecutionRecoveryMode(record.recoveryMode) && !target.recoveryModes.includes(record.recoveryMode)) {
      target.recoveryModes.push(record.recoveryMode);
    }
    if (record.leaderSummary) {
      target.latestLeaderSummary = record.leaderSummary;
    }
    if (record.recoveryHint) {
      target.latestRecoveryHint = record.recoveryHint;
    }
  }

  const targets = [...targetMap.values()]
    .filter((target) => target.taskIds.length > 0 || target.recoveryActions.length > 0 || target.role === 'leader')
    .sort((left, right) => {
      if (left.role === right.role) {
        return right.taskIds.length - left.taskIds.length;
      }
      return left.role === 'leader' ? -1 : 1;
    });

  for (const target of targets) {
    for (const task of target.tasks) {
      if (task.subject === task.taskId) {
        const subject = target.taskSubjects.find((_subject, index) => target.taskIds[index] === task.taskId);
        if (subject) {
          task.subject = subject;
        }
      }
    }
  }

  const summary = [
    `protocol_targets:${targets.length}`,
    `protocol_workers:${targets.filter((target) => target.role === 'worker').length}`,
    `protocol_tasks:${targets.reduce((count, target) => count + target.taskIds.length, 0)}`,
  ];

  const replaySteps = targets.flatMap((target) => {
    const targetLabel = `${target.agentName} (${target.slotId})`;
    const taskSummary = target.taskSubjects.length > 0 ? target.taskSubjects.join(', ') : 'no owned tasks captured';
    const actionSummary = target.recoveryActions.length > 0 ? target.recoveryActions.join(', ') : 'inspect ownership';
    return [
      `Review ${targetLabel}: ${taskSummary}.`,
      `Apply ${actionSummary}${target.latestRecoveryHint ? `; ${target.latestRecoveryHint}` : '.'}`,
    ];
  });

  const executionTargets: ProtocolReplayExecutionTarget[] = targets.map((target) => {
    const actionMap = new Map<string, ProtocolReplayExecutionAction>();
    for (const task of target.tasks) {
      const action = task.recoveryAction ?? target.recoveryActions[0] ?? 'inspect_diagnostics';
      const mode = task.recoveryMode ?? target.recoveryModes[0];
      const key = `${action}:${mode ?? 'none'}`;
      const entry = actionMap.get(key) ?? {
        action,
        mode,
        taskIds: [],
      };
      if (!entry.taskIds.includes(task.taskId)) {
        entry.taskIds.push(task.taskId);
      }
      actionMap.set(key, entry);
    }

    const replayInstructions = target.tasks.length > 0
      ? target.tasks.map((task) => {
          const action = task.recoveryAction ?? target.recoveryActions[0] ?? 'inspect_diagnostics';
          const hint = task.recoveryHint ?? target.latestRecoveryHint;
          return `${task.subject} (${task.taskId}) -> ${action}${hint ? `; ${hint}` : ''}`;
        })
      : [`Inspect ${target.agentName} (${target.slotId}) ownership state before replay.`];

    return {
      slotId: target.slotId,
      role: target.role,
      agentName: target.agentName,
      backend: target.backend,
      conversationId: target.conversationId,
      supportsResume: target.supportsResume,
      supportsStructuredTasks: target.supportsStructuredTasks,
      replayTaskCount: target.tasks.length,
      replayTasks: [...target.tasks],
      replayActions: [...actionMap.values()],
      replayInstructions,
    };
  });

  const executionPlan: ProtocolReplayExecutionPlan = {
    kind: 'protocol_replay_execution',
    leaderSlotId: leader?.slotId,
    generatedAt: Date.now(),
    targetCount: executionTargets.length,
    replayTaskCount: executionTargets.reduce((count, target) => count + target.replayTaskCount, 0),
    targets: executionTargets,
    summary: [
      `protocol_replay_targets:${executionTargets.length}`,
      `protocol_replay_tasks:${executionTargets.reduce((count, target) => count + target.replayTaskCount, 0)}`,
    ],
    steps: executionTargets.flatMap((target) => target.replayInstructions.map((instruction) => `${target.slotId}: ${instruction}`)),
  };

  return {
    kind: 'protocol',
    leaderSlotId: leader?.slotId,
    generatedAt: Date.now(),
    summary,
    replaySteps,
    targets,
    executionPlan,
  };
}
