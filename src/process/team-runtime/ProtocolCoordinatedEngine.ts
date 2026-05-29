import type { CreateTeamExecutionSessionParams, ITeamOrchestrationEngine } from './ITeamOrchestrationEngine';
import type { ProtocolSessionFactory } from './protocol/ProtocolSessionFactory';

type ProtocolCoordinatedEngineParams = {
  sessionFactory: ProtocolSessionFactory;
  readiness?: ITeamOrchestrationEngine['readiness'];
};

export class ProtocolCoordinatedEngine implements ITeamOrchestrationEngine {
  readonly kind = 'protocol' as const;
  readonly orchestrationMode = 'protocol_coordinated' as const;
  readonly readiness: ITeamOrchestrationEngine['readiness'];

  constructor(private readonly params: ProtocolCoordinatedEngineParams) {
    this.readiness = params.readiness ?? 'ready';
  }

  createSession(params: CreateTeamExecutionSessionParams) {
    return this.params.sessionFactory.create(params);
  }
}
