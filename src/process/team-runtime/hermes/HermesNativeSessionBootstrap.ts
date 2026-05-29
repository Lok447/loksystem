import type { ITeamRepository } from '@process/team/repository/ITeamRepository';
import type { TTeam } from '@process/team/types';
import type { ITeamExecutionBootstrap } from '../ITeamExecutionBootstrap';
import type { ITeamExecutionSession } from '../ITeamExecutionSession';

type HermesNativeSessionBootstrapParams = {
  repo: ITeamRepository;
  compatibilityBootstrap: ITeamExecutionBootstrap;
};

export class HermesNativeSessionBootstrap implements ITeamExecutionBootstrap {
  constructor(private readonly params: HermesNativeSessionBootstrapParams) {}

  async initialize(team: TTeam, session: ITeamExecutionSession): Promise<void> {
    if (team.executionEngine !== 'hermes_native' || team.orchestrationMode !== 'native_orchestrator') {
      await this.params.repo.update(team.id, {
        executionEngine: 'hermes_native',
        orchestrationMode: 'native_orchestrator',
        updatedAt: Date.now(),
      });
    }

    await this.params.compatibilityBootstrap.initialize(team, session);
  }
}
