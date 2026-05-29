import type { ITeamExecutionSession, TeamExecutionInfo, TeamExecutionRecoveryAction, TeamExecutionRecoveryPlan } from '../ITeamExecutionSession';
import type { TeamRuntimeDiagnostics } from '../diagnostics';
import type { TTeam } from '@process/team/types';
import {
  buildProtocolReplayContext,
  type ProtocolReplayContext,
  type ProtocolReplayExecutionPlan,
} from '../protocol';
import {
  GatewayRecoveryShell,
  GatewayReplayCoordinator,
  buildGatewayReplayContext,
  type GatewayReplayContext,
  type GatewayNativeResumeMode,
  type GatewayReplayExecutionPlan,
  type GatewayReplayExecutionResult,
} from '../gateway';

export type TeamRecoveryPreparation = {
  teamId: string;
  executionInfo: TeamExecutionInfo;
  recoveryPlan: TeamExecutionRecoveryPlan;
  diagnostics: TeamRuntimeDiagnostics | null;
  protocolReplayContext?: ProtocolReplayContext;
  protocolReplayExecutionPlan?: ProtocolReplayExecutionPlan;
  gatewayReplayContext?: GatewayReplayContext;
  gatewayReplayExecutionPlan?: GatewayReplayExecutionPlan;
};

export type TeamRecoveryExecutionResult = {
  teamId: string;
  status: 'not_available' | 'already_running' | 'executed';
  executionInfo: TeamExecutionInfo;
  recoveryPlan: TeamExecutionRecoveryPlan;
  diagnostics: TeamRuntimeDiagnostics | null;
  actionsApplied: TeamExecutionRecoveryAction[];
  replayMessage?: string;
  protocolReplayContext?: ProtocolReplayContext;
  protocolReplayExecutionPlan?: ProtocolReplayExecutionPlan;
  gatewayReplayContext?: GatewayReplayContext;
  gatewayReplayExecutionPlan?: GatewayReplayExecutionPlan;
  gatewayReplayExecution?: GatewayReplayExecutionResult;
};

type TeamRecoveryCoordinatorParams = {
  getLiveSession: (teamId: string) => ITeamExecutionSession | undefined;
  startSession: (teamId: string) => Promise<ITeamExecutionSession>;
  loadExecutionInfo: (teamId: string) => Promise<TeamExecutionInfo>;
  gatewayNativeResumeMode?: GatewayNativeResumeMode;
  getGatewayNativeResumeMode?: () => GatewayNativeResumeMode;
};

export class TeamRecoveryCoordinator {
  private readonly gatewayRecoveryShell = new GatewayRecoveryShell();

  constructor(private readonly params: TeamRecoveryCoordinatorParams) {}

  prepare(params: {
    team: TTeam;
    executionInfo: TeamExecutionInfo;
    diagnostics: TeamRuntimeDiagnostics | null;
  }): TeamRecoveryPreparation {
    const protocolReplayContext =
      params.executionInfo.executionKind === 'protocol'
        ? buildProtocolReplayContext({
            team: params.team,
            diagnostics: params.diagnostics,
          })
        : undefined;
    const gatewayReplayContext =
      params.executionInfo.executionKind === 'gateway'
        ? this.gatewayRecoveryShell.prepareReplay(params.team, params.diagnostics)
        : undefined;
    const gatewayReplayExecutionPlan =
      params.executionInfo.executionKind === 'gateway'
        ? this.gatewayRecoveryShell.buildExecutionContract(params.team, params.diagnostics).replayPlan
        : undefined;

    return {
      teamId: params.team.id,
      executionInfo: params.executionInfo,
      recoveryPlan: params.executionInfo.recoveryPlan ?? {
        status: 'not_available',
        mode: 'none',
        steps: [],
        blockers: ['missing_recovery_plan'],
        summary: ['recovery_plan:missing'],
      },
      diagnostics: params.diagnostics,
      protocolReplayContext,
      protocolReplayExecutionPlan: protocolReplayContext?.executionPlan,
      gatewayReplayContext,
      gatewayReplayExecutionPlan,
    };
  }

  async execute(params: {
    team: TTeam;
    executionInfo: TeamExecutionInfo;
    diagnostics: TeamRuntimeDiagnostics | null;
  }): Promise<TeamRecoveryExecutionResult> {
    const preparation = this.prepare(params);
    const liveSession = this.params.getLiveSession(params.team.id);
    if (liveSession) {
      const currentInfo = await this.params.loadExecutionInfo(params.team.id);
      return {
        ...preparation,
        status: 'already_running',
        executionInfo: currentInfo,
        recoveryPlan: currentInfo.recoveryPlan ?? preparation.recoveryPlan,
        actionsApplied: [],
      };
    }

    if (preparation.recoveryPlan.status === 'not_available') {
      return {
        ...preparation,
        status: 'not_available',
        actionsApplied: [],
      };
    }

    const session = await this.params.startSession(params.team.id);
    const actionsApplied: TeamExecutionRecoveryAction[] = [];
    let replayMessage: string | undefined;
    let gatewayReplayExecution: GatewayReplayExecutionResult | undefined;

    if (preparation.recoveryPlan.mode === 'mailbox_replay') {
      replayMessage = this.buildReplayMessage(params.team, preparation.diagnostics, 'legacy mailbox replay');
      actionsApplied.push('rebuild_mailbox_runtime');
      await this.sendReplayMessage(session, params.team, replayMessage);
      actionsApplied.push('replay_mailbox_messages');
    } else if (preparation.recoveryPlan.mode === 'native_replay') {
      replayMessage = this.buildReplayMessage(params.team, preparation.diagnostics, 'native replay shell');
      actionsApplied.push('rebuild_native_runtime');
      await this.sendReplayMessage(session, params.team, replayMessage);
      actionsApplied.push('replay_native_context');
    } else if (preparation.recoveryPlan.mode === 'protocol_replay') {
      replayMessage = this.buildProtocolReplayMessage(params.team, preparation);
      actionsApplied.push('rebuild_protocol_runtime');
      await this.sendReplayMessage(session, params.team, replayMessage);
      actionsApplied.push('replay_protocol_coordination');
    } else if (preparation.recoveryPlan.mode === 'gateway_replay') {
      const gatewayExecution = this.gatewayRecoveryShell.buildExecutionContract(params.team, preparation.diagnostics);
      const gatewayReplayCoordinator = new GatewayReplayCoordinator({
        nativeResumeMode: this.params.getGatewayNativeResumeMode?.() ?? this.params.gatewayNativeResumeMode ?? 'off',
      });
      replayMessage = gatewayExecution.replayMessage;
      actionsApplied.push(...gatewayExecution.actionsApplied.slice(0, 1));
      await this.sendReplayMessage(session, params.team, replayMessage);
      gatewayReplayExecution = await gatewayReplayCoordinator.execute(session, gatewayExecution);
      actionsApplied.push(...gatewayExecution.actionsApplied.slice(1));
    } else {
      actionsApplied.push('restart_runtime');
    }

    const executionInfo = await this.params.loadExecutionInfo(params.team.id);
    return {
      ...preparation,
      status: 'executed',
      executionInfo,
      recoveryPlan: executionInfo.recoveryPlan ?? preparation.recoveryPlan,
      actionsApplied,
      replayMessage,
      protocolReplayContext: preparation.protocolReplayContext,
      protocolReplayExecutionPlan: preparation.protocolReplayExecutionPlan,
      gatewayReplayContext: preparation.gatewayReplayContext,
      gatewayReplayExecutionPlan: preparation.gatewayReplayExecutionPlan,
      gatewayReplayExecution,
    };
  }

  private async sendReplayMessage(session: ITeamExecutionSession, team: TTeam, replayMessage: string): Promise<void> {
    const leader = team.agents.find((agent) => agent.role === 'leader');
    if (!leader) return;
    await session.sendMessageToAgent(leader.slotId, replayMessage, { silent: true });
  }

  private buildReplayMessage(team: TTeam, diagnostics: TeamRuntimeDiagnostics | null, modeLabel: string): string {
    if (!diagnostics) {
      return [
        `Recovered team "${team.name}" using ${modeLabel}.`,
        'A persisted recovery plan exists, but detailed diagnostics were unavailable.',
        'Rebuild coordination state, inspect team tasks, and continue execution carefully.',
      ].join('\n');
    }

    const waitingTasks = diagnostics.taskDiagnostics.waiting
      .slice(0, 5)
      .map((task) => `- ${task.subject} (${task.taskId}) waiting on ${task.blockedBy.join(', ')}`)
      .join('\n');
    const degradedMembers = diagnostics.degradedMembers
      .slice(0, 5)
      .map((member) => `- ${member.agentName} (${member.slotId}): ${member.reason}`)
      .join('\n');

    return [
      `Recovered team "${team.name}" using ${modeLabel}.`,
      `Last known execution kind: ${diagnostics.executionInfo.executionKind}`,
      `Last known orchestration mode: ${diagnostics.executionInfo.orchestrationMode}`,
      `Last known state: ${diagnostics.executionInfo.recovery?.lastKnownState ?? diagnostics.executionInfo.state}`,
      `Pending tasks: ${diagnostics.taskDiagnostics.pending}`,
      `Waiting tasks: ${diagnostics.taskDiagnostics.waiting.length}`,
      `Degraded members: ${diagnostics.degradedMembers.length}`,
      waitingTasks ? `Waiting task details:\n${waitingTasks}` : 'Waiting task details:\n- none',
      degradedMembers ? `Degraded member details:\n${degradedMembers}` : 'Degraded member details:\n- none',
      'Resume coordination from this recovered state. Verify task ownership, inspect blockers, then continue delegation.',
    ].join('\n');
  }

  private buildProtocolReplayMessage(team: TTeam, preparation: TeamRecoveryPreparation): string {
    const diagnostics = preparation.diagnostics;
    const replayContext =
      preparation.protocolReplayContext ??
      buildProtocolReplayContext({
        team,
        diagnostics,
      });

    const targetLines = replayContext.targets
      .slice(0, 8)
      .map((target) => {
        const taskSummary = target.taskSubjects.length > 0 ? target.taskSubjects.join(', ') : 'no captured task subjects';
        const actionSummary = target.recoveryActions.length > 0 ? target.recoveryActions.join(', ') : 'inspect ownership';
        const hint = target.latestRecoveryHint ? ` Hint: ${target.latestRecoveryHint}` : '';
        return `- ${target.role.toUpperCase()} ${target.agentName} (${target.slotId}) -> tasks: ${taskSummary}; actions: ${actionSummary}.${hint}`;
      })
      .join('\n');

    const stepLines = replayContext.replaySteps.slice(0, 10).map((step) => `- ${step}`).join('\n');
    const executionLines = replayContext.executionPlan.targets
      .slice(0, 8)
      .map((target) => {
        const actionSummary =
          target.replayActions.length > 0
            ? target.replayActions
                .map((action) => `${action.action}${action.mode ? ` (${action.mode})` : ''}: ${action.taskIds.join(', ')}`)
                .join('; ')
            : 'inspect_diagnostics';
        return `- ${target.agentName} (${target.slotId}) -> ${actionSummary}`;
      })
      .join('\n');

    return [
      `Recovered team "${team.name}" using protocol coordination replay.`,
      `Last known execution kind: ${diagnostics?.executionInfo.executionKind ?? 'protocol'}`,
      `Last known orchestration mode: ${diagnostics?.executionInfo.orchestrationMode ?? 'protocol_coordinated'}`,
      `Protocol recovery targets: ${replayContext.targets.length}`,
      targetLines ? `Protocol targets:\n${targetLines}` : 'Protocol targets:\n- none',
      executionLines ? `Protocol replay execution:\n${executionLines}` : 'Protocol replay execution:\n- inspect leader coordination context',
      stepLines ? `Replay steps:\n${stepLines}` : 'Replay steps:\n- inspect leader coordination context',
      'Resume protocol coordination by validating ownership, replaying reassignment context, and redispatching only the tasks that still need execution.',
    ].join('\n');
  }
}
