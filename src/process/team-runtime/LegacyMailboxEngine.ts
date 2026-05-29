import { TeamSession } from '@process/team/TeamSession';
import type { CreateTeamExecutionSessionParams, ITeamOrchestrationEngine } from './ITeamOrchestrationEngine';
import { LegacyExecutionSession } from './legacy/LegacyExecutionSession';

type LegacyMailboxEngineParams = {
  createExecutionSession?: (
    params: CreateTeamExecutionSessionParams
  ) => LegacyExecutionSession | Promise<LegacyExecutionSession>;
};

export class LegacyMailboxEngine implements ITeamOrchestrationEngine {
  readonly kind = 'legacy_mailbox' as const;
  readonly orchestrationMode = 'legacy_mailbox' as const;
  readonly readiness = 'ready' as const;

  constructor(private readonly params: LegacyMailboxEngineParams = {}) {}

  createSession(params: CreateTeamExecutionSessionParams): LegacyExecutionSession | Promise<LegacyExecutionSession> {
    if (this.params.createExecutionSession) {
      return this.params.createExecutionSession(params);
    }

    const session = new TeamSession(params.team, params.repo, params.workerTaskManager, params.spawnAgent);
    return new LegacyExecutionSession(session, {
      executionKind: this.kind,
      orchestrationMode: this.orchestrationMode,
      context: params.executionMetadata?.context,
      diagnostics: params.executionMetadata?.diagnostics
        ? {
            summary: params.executionMetadata.diagnostics.summary ?? [],
            fallbackReason: params.executionMetadata.diagnostics.fallbackReason ?? params.executionMetadata.fallbackReason,
          }
        : undefined,
    });
  }
}
