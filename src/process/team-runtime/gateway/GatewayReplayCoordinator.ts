import type { ITeamExecutionSession } from '../ITeamExecutionSession';
import type { GatewayRecoveryExecutionContract } from './GatewayRecoveryShell';
import type {
  GatewayNativeResumeMode,
  GatewayReplayExecutionPlan,
  GatewayReplayPlanTarget,
} from './GatewayNativeContracts';

export type GatewayReplayExecutionTargetResult = {
  slotId: string;
  gatewaySessionId?: string;
  replayStrategy: 'rebuild_session_then_wait' | 'rebuild_session_then_resume_tasks';
  taskIds: string[];
  status: 'queued_for_redispatch' | 'resume_requested';
};

export type GatewayReplayExecutionResult = {
  replayPlan: GatewayReplayExecutionPlan;
  workerResults: GatewayReplayExecutionTargetResult[];
};

type GatewayReplayCoordinatorParams = {
  nativeResumeMode?: GatewayNativeResumeMode;
};

export class GatewayReplayCoordinator {
  constructor(private readonly params: GatewayReplayCoordinatorParams = {}) {}

  async execute(
    session: ITeamExecutionSession,
    contract: GatewayRecoveryExecutionContract
  ): Promise<GatewayReplayExecutionResult> {
    const workerResults: GatewayReplayExecutionTargetResult[] = [];
    const executedPlanTargets: GatewayReplayPlanTarget[] = [];

    await Promise.all(
      contract.workerReplayInstructions.map(async (instruction) => {
        const planTarget = contract.replayPlan.targets.find((target) => target.slotId === instruction.slotId);
        const replayStrategy = this.resolveReplayStrategy(
          planTarget?.replayStrategy,
          planTarget?.resumeSupported,
          instruction.payload?.session?.recoveryModes
        );
        const payload =
          replayStrategy === 'rebuild_session_then_resume_tasks'
            ? {
                ...(instruction.payload ?? {}),
                resume: {
                  enabled: true,
                  taskIds: instruction.payload?.tasks?.map((task) => task.taskId) ?? [],
                },
              }
            : instruction.payload;
        const executionMessage =
          replayStrategy === 'rebuild_session_then_resume_tasks'
            ? `${instruction.message}\nResume directly once the gateway session is rebuilt and the listed tasks are restored.`
            : instruction.message;
        await session.sendMessageToAgent(
          instruction.slotId,
          `${executionMessage}\n\n[Gateway Replay Payload]\n${JSON.stringify(payload ?? {}, null, 2)}`,
          { silent: true }
        );
        if (planTarget) {
          executedPlanTargets.push({
            ...planTarget,
            replayStrategy,
            resumeSupported: replayStrategy === 'rebuild_session_then_resume_tasks' ? true : planTarget.resumeSupported,
            structuredTasksSupported:
              replayStrategy === 'rebuild_session_then_resume_tasks' ? true : planTarget.structuredTasksSupported,
            requiresLeaderRedispatch: replayStrategy !== 'rebuild_session_then_resume_tasks',
          });
        }
        workerResults.push({
          slotId: instruction.slotId,
          gatewaySessionId: instruction.gatewaySessionId,
          replayStrategy,
          taskIds: instruction.payload?.tasks?.map((task) => task.taskId) ?? [],
          status: replayStrategy === 'rebuild_session_then_resume_tasks' ? 'resume_requested' : 'queued_for_redispatch',
        });
      })
    );

    return {
      replayPlan: {
        ...contract.replayPlan,
        targets:
          executedPlanTargets.length > 0
            ? executedPlanTargets.sort((left, right) => left.slotId.localeCompare(right.slotId))
            : contract.replayPlan.targets,
        summary: this.buildReplayPlanSummary(
          executedPlanTargets.length > 0 ? executedPlanTargets : contract.replayPlan.targets
        ),
      },
      workerResults: workerResults.sort((left, right) => left.slotId.localeCompare(right.slotId)),
    };
  }

  private resolveReplayStrategy(
    strategy: GatewayReplayExecutionTargetResult['replayStrategy'] | undefined,
    resumeSupported: boolean | undefined,
    recoveryModes?: string[]
  ): GatewayReplayExecutionTargetResult['replayStrategy'] {
    if (this.params.nativeResumeMode !== 'enabled') {
      return 'rebuild_session_then_wait';
    }
    const resumeRequestedByPayload =
      Array.isArray(recoveryModes) && recoveryModes.some((mode) => mode === 'native_resume' || mode === 'gateway_replay');
    if (resumeSupported || resumeRequestedByPayload || strategy === 'rebuild_session_then_resume_tasks') {
      return 'rebuild_session_then_resume_tasks';
    }
    return 'rebuild_session_then_wait';
  }

  private buildReplayPlanSummary(targets: GatewayReplayPlanTarget[]): string[] {
    return [
      `gateway_replay_targets:${targets.length}`,
      `gateway_resume_supported:${targets.filter((target) => target.resumeSupported).length}`,
      `gateway_requires_redispatch:${targets.filter((target) => target.requiresLeaderRedispatch).length}`,
    ];
  }
}
