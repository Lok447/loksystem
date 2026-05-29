import type { TTeam } from '@process/team/types';
import type { TeamRuntimeDiagnostics } from '../diagnostics';
import type { TeamExecutionRecoveryAction } from '../ITeamExecutionSession';
import { buildGatewayReplayContext, type GatewayReplayContext } from './GatewayReplayContext';
import { isTeamExecutionRecoveryAction, isTeamExecutionRecoveryMode } from './gatewayRecoveryTypes';
import type { GatewayReplayExecutionPlan, GatewayReplayPlanTarget } from './GatewayNativeContracts';
import type { GatewayLifecycleState } from './OpenClawRuntimeResolver';

export type GatewayWorkerReplayInstruction = {
  slotId: string;
  gatewaySessionId?: string;
  role: 'leader' | 'worker';
  payload: {
    session: {
      sessionKey?: string;
      lifecycleState?: string;
      recoveryActions: TeamExecutionRecoveryAction[];
      recoveryModes: string[];
    };
    tasks: Array<{
      taskId: string;
      subject: string;
    }>;
    hint?: string;
  };
  message: string;
};

export type GatewayRecoveryExecutionContract = {
  replayContext: GatewayReplayContext;
  replayPlan: GatewayReplayExecutionPlan;
  actionsApplied: TeamExecutionRecoveryAction[];
  replayMessage: string;
  workerReplayInstructions: GatewayWorkerReplayInstruction[];
};

export class GatewayRecoveryShell {
  prepareReplay(team: TTeam, diagnostics: TeamRuntimeDiagnostics | null): GatewayReplayContext {
    return buildGatewayReplayContext({
      team,
      diagnostics,
    });
  }

  buildExecutionContract(team: TTeam, diagnostics: TeamRuntimeDiagnostics | null): GatewayRecoveryExecutionContract {
    const replayContext = this.prepareReplay(team, diagnostics);
    const replayMessage = this.buildReplayMessage(team, diagnostics, replayContext);

    return {
      replayContext,
      replayPlan: this.buildReplayPlan(replayContext),
      actionsApplied: ['rebuild_gateway_runtime', 'replay_gateway_session'],
      replayMessage,
      workerReplayInstructions: this.buildWorkerReplayInstructions(replayContext, diagnostics),
    };
  }

  buildReplayMessage(team: TTeam, diagnostics: TeamRuntimeDiagnostics | null, replayContext?: GatewayReplayContext): string {
    const context =
      replayContext ??
      buildGatewayReplayContext({
        team,
        diagnostics,
      });

    const targetLines = context.targets
      .slice(0, 8)
      .map((target) => {
        const taskSummary = target.taskSubjects.length > 0 ? target.taskSubjects.join(', ') : 'no captured task subjects';
        const lifecycle = target.lifecycleState ?? 'unknown';
        const reason = target.degradedReason ? ` degraded: ${target.degradedReason}` : '';
        return `- ${target.role.toUpperCase()} ${target.agentName} (${target.slotId}) -> lifecycle: ${lifecycle}; tasks: ${taskSummary}.${reason}`;
      })
      .join('\n');

    const stepLines = context.replaySteps.slice(0, 10).map((step) => `- ${step}`).join('\n');

    return [
      `Recovered team "${team.name}" using gateway coordination replay.`,
      `Last known execution kind: ${diagnostics?.executionInfo.executionKind ?? 'gateway'}`,
      `Last known orchestration mode: ${diagnostics?.executionInfo.orchestrationMode ?? 'gateway_coordinated'}`,
      `Gateway recovery targets: ${context.targets.length}`,
      targetLines ? `Gateway targets:\n${targetLines}` : 'Gateway targets:\n- none',
      stepLines ? `Replay steps:\n${stepLines}` : 'Replay steps:\n- inspect leader gateway coordination context',
      'Resume gateway coordination by rebuilding worker session lifecycle, validating degraded members, and redispatching only the tasks that still require execution.',
    ].join('\n');
  }

  private buildWorkerReplayInstructions(
    replayContext: GatewayReplayContext,
    diagnostics: TeamRuntimeDiagnostics | null
  ): GatewayWorkerReplayInstruction[] {
    const replayTargets = replayContext.targets
      .filter((target) => target.role === 'worker')
      .map((target) => ({
        slotId: target.slotId,
        gatewaySessionId: target.gatewaySessionId,
        role: target.role,
        taskIds: target.taskIds,
        taskSubjects: target.taskSubjects,
        lifecycleState: target.lifecycleState,
        recoveryActions: target.recoveryActions,
        recoveryModes: target.recoveryModes,
        latestRecoveryHint: target.latestRecoveryHint,
        agentName: target.agentName,
      }));

    const fallbackTargets =
      replayTargets.length > 0
        ? []
        : (diagnostics?.gatewayDiagnostics?.taskOwnership ?? [])
            .filter((record) => record.owner)
            .map((record) => {
              const lifecycle = diagnostics?.gatewayDiagnostics?.lifecycle?.find((item) => item.slotId === record.owner);
              return {
                slotId: record.owner!,
                gatewaySessionId: record.gatewaySessionId ?? lifecycle?.gatewaySessionId,
                role: 'worker' as const,
                taskIds: [record.taskId],
                taskSubjects: [record.subject],
                lifecycleState: record.lifecycleState ?? lifecycle?.lifecycleState,
                recoveryActions: isTeamExecutionRecoveryAction(record.recoveryAction) ? [record.recoveryAction] : [],
                recoveryModes: isTeamExecutionRecoveryMode(record.recoveryMode) ? [record.recoveryMode] : [],
                latestRecoveryHint: record.recoveryHint ?? lifecycle?.recoveryHint,
                agentName: record.owner!,
              };
            });

    return [...replayTargets, ...fallbackTargets]
      .filter((target, index, list) => list.findIndex((item) => item.slotId === target.slotId) === index)
      .map((target) => {
        const taskSummary = target.taskSubjects.length > 0 ? target.taskSubjects.join(', ') : 'no task subjects captured';
        const lifecycle = target.lifecycleState ?? 'unknown';
        const recoveryActions = target.recoveryActions.length > 0 ? target.recoveryActions.join(', ') : 'inspect_diagnostics';
        const recoveryModes = target.recoveryModes.length > 0 ? target.recoveryModes.join(', ') : 'gateway_replay';
        const hint = target.latestRecoveryHint ? ` Hint: ${target.latestRecoveryHint}` : '';
        return {
          slotId: target.slotId,
          gatewaySessionId: target.gatewaySessionId,
          role: 'worker',
          payload: {
            session: {
              sessionKey: target.gatewaySessionId,
              lifecycleState: lifecycle,
              recoveryActions: [...target.recoveryActions.filter(Boolean)] as TeamExecutionRecoveryAction[],
              recoveryModes: [...target.recoveryModes.filter(Boolean)],
            },
            tasks: target.taskIds.map((taskId, index) => ({
              taskId,
              subject: target.taskSubjects[index] ?? taskId,
            })),
            ...(target.latestRecoveryHint ? { hint: target.latestRecoveryHint } : {}),
          },
          message: [
            `Restore gateway worker session context for ${target.agentName} (${target.slotId}).`,
            `Lifecycle: ${lifecycle}.`,
            `Session: ${target.gatewaySessionId ?? 'unknown'}.`,
            `Tasks: ${taskSummary}.`,
            `Recovery actions: ${recoveryActions}.`,
            `Recovery modes: ${recoveryModes}.${hint}`,
            'Rebuild your worker/session context first, then wait for redispatch or continue only the tasks that are still assigned to you.',
          ].join('\n'),
        };
      });
  }

  private buildReplayPlan(replayContext: GatewayReplayContext): GatewayReplayExecutionPlan {
    const targets: GatewayReplayPlanTarget[] = replayContext.targets
      .filter((target) => target.role === 'worker')
      .map((target) => ({
        slotId: target.slotId,
        role: 'worker',
        agentName: target.agentName,
        backend: target.backend,
        gatewaySessionId: target.gatewaySessionId,
        lifecycleState: target.lifecycleState as GatewayLifecycleState | undefined,
        replayStrategy: target.supportsResume ? 'rebuild_session_then_resume_tasks' : 'rebuild_session_then_wait',
        resumeSupported: target.supportsResume === true,
        structuredTasksSupported: target.supportsStructuredTasks === true,
        requiresLeaderRedispatch: target.supportsResume !== true,
        recoveryActions:
          target.recoveryActions.length > 0 ? target.recoveryActions : (['replay_gateway_session'] as TeamExecutionRecoveryAction[]),
        recoveryModes: target.recoveryModes.length > 0 ? target.recoveryModes : ['gateway_replay'],
        taskIds: [...target.taskIds],
        taskSubjects: [...target.taskSubjects],
        latestRecoveryHint: target.latestRecoveryHint,
      }));

    return {
      kind: 'gateway',
      generatedAt: Date.now(),
      summary: [
        `gateway_replay_targets:${targets.length}`,
        `gateway_resume_supported:${targets.filter((target) => target.resumeSupported).length}`,
        `gateway_requires_redispatch:${targets.filter((target) => target.requiresLeaderRedispatch).length}`,
      ],
      targets,
    };
  }
}
