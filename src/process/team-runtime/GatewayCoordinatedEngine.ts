import type { CreateTeamExecutionSessionParams, ITeamOrchestrationEngine } from './ITeamOrchestrationEngine';
import type { GatewaySessionFactory } from './gateway/GatewaySessionFactory';

type GatewayCoordinatedEngineParams = {
  sessionFactory: GatewaySessionFactory;
  readiness?: ITeamOrchestrationEngine['readiness'];
};

export class GatewayCoordinatedEngine implements ITeamOrchestrationEngine {
  readonly kind = 'gateway' as const;
  readonly orchestrationMode = 'gateway_coordinated' as const;
  readonly readiness: ITeamOrchestrationEngine['readiness'];

  constructor(private readonly params: GatewayCoordinatedEngineParams) {
    this.readiness = params.readiness ?? 'ready';
  }

  createSession(params: CreateTeamExecutionSessionParams) {
    return this.params.sessionFactory.create(params);
  }
}
