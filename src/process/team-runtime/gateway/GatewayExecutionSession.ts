import type { TeamAgent } from '@process/team/types';
import type {
  ITeamExecutionSession,
  TeamExecutionContext,
  TeamExecutionDiagnostics,
  TeamExecutionInfo,
} from '../ITeamExecutionSession';
import type { TeamRuntimeDiagnostics } from '../diagnostics';
import type { OpenClawMemberAdapter, OpenClawWorkerContract } from './OpenClawMemberAdapter';
import type { OpenClawGatewayRuntimeAdapter } from './OpenClawGatewayRuntimeAdapter';
import { buildGatewayReplayContext, type GatewayReplayContext } from './GatewayReplayContext';
import { GatewayRuntimeShell } from './GatewayRuntimeShell';

type GatewayExecutionSessionParams = {
  context?: TeamExecutionContext;
  diagnostics?: TeamExecutionDiagnostics;
  gatewayAdapter: OpenClawMemberAdapter;
  gatewayRuntimeAdapter?: OpenClawGatewayRuntimeAdapter;
  team: {
    leaderAgentId: string;
    agents: TeamAgent[];
  };
};

export class GatewayExecutionSession extends GatewayRuntimeShell implements ITeamExecutionSession {
  constructor(
    private readonly inner: ITeamExecutionSession,
    private readonly params: GatewayExecutionSessionParams
  ) {
    const gatewayWorkerSummary = GatewayExecutionSession.buildGatewayWorkerSummary(params);
    super(inner, {
      context: params.context,
      diagnostics: params.diagnostics
        ? {
            ...params.diagnostics,
            summary: [...new Set([...(params.diagnostics.summary ?? []), ...gatewayWorkerSummary])],
          }
        : {
            summary: gatewayWorkerSummary,
          },
      gatewayRuntimeAdapter: params.gatewayRuntimeAdapter,
    });
  }

  getWorkerContracts(): OpenClawWorkerContract[] {
    return this.getAgents()
      .filter((agent) => agent.role !== 'leader')
      .map((agent) => this.params.gatewayAdapter.getWorkerContract(agent))
      .filter((worker): worker is OpenClawWorkerContract => Boolean(worker));
  }

  getWorkerRuntimeSnapshots() {
    return this.getAgents()
      .filter((agent) => agent.role !== 'leader')
      .map((agent) => this.params.gatewayRuntimeAdapter?.getWorkerRuntime(agent))
      .filter((runtime): runtime is NonNullable<typeof runtime> => Boolean(runtime));
  }

  buildReplayContext(diagnostics: TeamRuntimeDiagnostics | null): GatewayReplayContext {
    return buildGatewayReplayContext({
      team: this.params.team,
      diagnostics,
      workerContracts: this.getWorkerContracts(),
    });
  }

  private static buildGatewayWorkerSummary(params: GatewayExecutionSessionParams): string[] {
    const gatewayBackends = params.team.agents
      .filter((agent) => agent.role !== 'leader')
      .map((agent) => params.gatewayAdapter.getWorkerContract(agent))
      .filter((worker): worker is OpenClawWorkerContract => Boolean(worker))
      .map((worker) => worker.backend)
      .filter(Boolean)
      .join(',');

    return gatewayBackends ? [`gateway_workers:${gatewayBackends}`] : [];
  }
}
