import type { ITeamRepository } from '@process/team/repository/ITeamRepository';
import type { TTeam } from '@process/team/types';
import type { ITeamExecutionBootstrap } from '../ITeamExecutionBootstrap';
import type { ITeamExecutionSession } from '../ITeamExecutionSession';
import type { GatewayEventSink } from './GatewayEventSink';
import type { GatewayNativeSessionBootstrapDriver } from './GatewayNativeSessionBootstrapDriver';

type GatewaySessionBootstrapParams = {
  repo: ITeamRepository;
  nativeDriver: GatewayNativeSessionBootstrapDriver;
  createGatewayEventSink?: (teamId: string) => GatewayEventSink;
};

export class GatewaySessionBootstrap implements ITeamExecutionBootstrap {
  constructor(private readonly params: GatewaySessionBootstrapParams) {}

  async initialize(team: TTeam, session: ITeamExecutionSession): Promise<void> {
    if (team.executionEngine !== 'gateway' || team.orchestrationMode !== 'gateway_coordinated') {
      await this.params.repo.update(team.id, {
        executionEngine: 'gateway',
        orchestrationMode: 'gateway_coordinated',
        updatedAt: Date.now(),
      });
    }

    await this.params.nativeDriver.startSession(session);
    const gatewayEventSink = this.params.createGatewayEventSink?.(team.id);
    await Promise.all(
      team.agents.map(async (agent) => {
        await this.params.nativeDriver.configureAgentMcp(team, session, agent);
        await this.params.nativeDriver.warmAgent(team, agent, gatewayEventSink);
      })
    );
  }
}
