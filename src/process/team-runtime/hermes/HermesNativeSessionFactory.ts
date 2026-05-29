import type { CreateTeamExecutionSessionParams, TeamExecutionSessionMetadata } from '../ITeamOrchestrationEngine';
import type { ITeamExecutionSession } from '../ITeamExecutionSession';
import { HermesNativeExecutionSession } from './HermesNativeExecutionSession';

type HermesNativeSessionFactoryParams = {
  createCompatibilitySession: (params: CreateTeamExecutionSessionParams) => ITeamExecutionSession | Promise<ITeamExecutionSession>;
};

export class HermesNativeSessionFactory {
  constructor(private readonly params: HermesNativeSessionFactoryParams) {}

  async create(params: CreateTeamExecutionSessionParams): Promise<HermesNativeExecutionSession> {
    const compatibilitySession = await this.params.createCompatibilitySession(params);
    const metadata = params.executionMetadata;

    return new HermesNativeExecutionSession(compatibilitySession, {
      context: this.buildContext(params, metadata),
      diagnostics: this.buildDiagnostics(metadata),
    });
  }

  private buildContext(
    params: CreateTeamExecutionSessionParams,
    metadata: TeamExecutionSessionMetadata | undefined
  ) {
    return {
      compatibilityMode: 'native_compatibility_bridge' as const,
      ...metadata?.context,
      leaderBackend:
        metadata?.context?.leaderBackend ?? params.team.agents.find((agent) => agent.role === 'leader')?.agentType,
      memberCount: metadata?.context?.memberCount ?? params.team.agents.length,
    };
  }

  private buildDiagnostics(metadata: TeamExecutionSessionMetadata | undefined) {
    if (!metadata?.diagnostics && !metadata?.fallbackReason) {
      return undefined;
    }

    return {
      summary: metadata.diagnostics?.summary ?? [],
      fallbackReason: metadata.diagnostics?.fallbackReason ?? metadata.fallbackReason,
    };
  }
}
