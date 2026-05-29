import type { CreateTeamExecutionSessionParams, ITeamOrchestrationEngine } from './ITeamOrchestrationEngine';
import type { HermesNativeSessionFactory } from './hermes';

type HermesNativeOrchestrationEngineParams = {
  sessionFactory: HermesNativeSessionFactory;
  readiness?: ITeamOrchestrationEngine['readiness'];
};

/**
 * Phase 2 skeleton for Hermes-native orchestration.
 *
 * The engine is intentionally marked as `stub` for now. The routing layer can
 * already evaluate and target this engine, but until the native bridge exists
 * we safely fall back to the compatibility session path.
 */
export class HermesNativeOrchestrationEngine implements ITeamOrchestrationEngine {
  readonly kind = 'hermes_native' as const;
  readonly orchestrationMode = 'native_orchestrator' as const;
  readonly readiness: ITeamOrchestrationEngine['readiness'];

  constructor(private readonly params: HermesNativeOrchestrationEngineParams) {
    this.readiness = params.readiness ?? 'stub';
  }

  createSession(params: CreateTeamExecutionSessionParams) {
    return this.params.sessionFactory.create(params);
  }
}
