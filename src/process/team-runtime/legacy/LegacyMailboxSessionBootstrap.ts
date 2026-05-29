import type { TeamExecutionEngineId, TeamOrchestrationMode } from '@/common/types/teamTypes';
import type { ITeamRepository } from '@process/team/repository/ITeamRepository';
import type { TTeam } from '@process/team/types';
import type { ITeamExecutionBootstrap } from '../ITeamExecutionBootstrap';
import type { ITeamExecutionSession } from '../ITeamExecutionSession';

type LegacyMailboxSessionBootstrapParams = {
  repo: ITeamRepository;
  compatibilityBootstrap: ITeamExecutionBootstrap;
  executionEngine: TeamExecutionEngineId;
  orchestrationMode: TeamOrchestrationMode;
};

export class LegacyMailboxSessionBootstrap {
  constructor(private readonly params: LegacyMailboxSessionBootstrapParams) {}

  async initialize(team: TTeam, session: ITeamExecutionSession): Promise<void> {
    if (
      team.executionEngine !== this.params.executionEngine ||
      team.orchestrationMode !== this.params.orchestrationMode
    ) {
      await this.params.repo.update(team.id, {
        executionEngine: this.params.executionEngine,
        orchestrationMode: this.params.orchestrationMode,
        updatedAt: Date.now(),
      });
    }
    await this.params.compatibilityBootstrap.initialize(team, session);
  }
}
