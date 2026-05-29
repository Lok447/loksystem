import type { TeamAgent } from '@process/team/types';
import type {
  ITeamExecutionSession,
  TeamExecutionContext,
  TeamExecutionDiagnostics,
  TeamExecutionInfo,
} from '../ITeamExecutionSession';
import type { AcpMemberAdapter, AcpWorkerContract } from './AcpMemberAdapter';
import { buildProtocolReplayContext, type ProtocolReplayContext } from './ProtocolReplayContext';
import type { TeamRuntimeDiagnostics } from '../diagnostics';

type ProtocolExecutionSessionParams = {
  context?: TeamExecutionContext;
  diagnostics?: TeamExecutionDiagnostics;
  acpAdapter: AcpMemberAdapter;
  team: {
    leaderAgentId: string;
    agents: TeamAgent[];
  };
};

export class ProtocolExecutionSession implements ITeamExecutionSession {
  readonly teamId: string;
  readonly executionKind = 'protocol' as const;

  constructor(
    private readonly inner: ITeamExecutionSession,
    private readonly params: ProtocolExecutionSessionParams
  ) {
    this.teamId = inner.teamId;
  }

  async start(): Promise<void> {
    await this.inner.start();
  }

  getExecutionInfo(): TeamExecutionInfo {
    const innerInfo = this.inner.getExecutionInfo();
    const mergedContext: TeamExecutionContext | undefined =
      innerInfo.context || this.params.context
        ? {
            ...innerInfo.context,
            ...this.params.context,
          }
        : undefined;
    const workerBackends = this.getWorkerContracts()
      .map((worker) => worker.backend)
      .filter(Boolean)
      .join(',');
    const mergedSummary = [
      ...(innerInfo.diagnostics?.summary ?? []),
      ...(this.params.diagnostics?.summary ?? []),
      workerBackends ? `protocol_workers:${workerBackends}` : '',
    ].filter(Boolean);
    const mergedDiagnostics: TeamExecutionDiagnostics | undefined =
      mergedSummary.length > 0 || innerInfo.diagnostics?.fallbackReason || this.params.diagnostics?.fallbackReason
        ? {
            summary: [...new Set(mergedSummary)],
            fallbackReason: this.params.diagnostics?.fallbackReason ?? innerInfo.diagnostics?.fallbackReason,
          }
        : undefined;

    return {
      teamId: this.teamId,
      executionKind: this.executionKind,
      orchestrationMode: 'protocol_coordinated',
      state: innerInfo.state,
      context: mergedContext,
      diagnostics: mergedDiagnostics,
    };
  }

  getStdioConfig(agentSlotId?: string): unknown | null {
    return this.inner.getStdioConfig(agentSlotId);
  }

  async sendMessage(content: string, files?: string[]): Promise<void> {
    await this.inner.sendMessage(content, files);
  }

  async sendMessageToAgent(
    slotId: string,
    content: string,
    options?: { silent?: boolean; files?: string[] }
  ): Promise<void> {
    await this.inner.sendMessageToAgent(slotId, content, options);
  }

  renameAgent(slotId: string, newName: string): void {
    this.inner.renameAgent(slotId, newName);
  }

  addAgent(agent: TeamAgent): void {
    this.inner.addAgent(agent);
  }

  removeAgent(slotId: string): void {
    this.inner.removeAgent(slotId);
  }

  getAgents(): TeamAgent[] {
    return this.inner.getAgents();
  }

  async dispose(): Promise<void> {
    await this.inner.dispose();
  }

  getWorkerContracts(): AcpWorkerContract[] {
    return this.getAgents()
      .filter((agent) => agent.role !== 'leader')
      .map((agent) => this.params.acpAdapter.getWorkerContract(agent))
      .filter((worker): worker is AcpWorkerContract => Boolean(worker));
  }

  buildReplayContext(diagnostics: TeamRuntimeDiagnostics | null): ProtocolReplayContext {
    return buildProtocolReplayContext({
      team: this.params.team,
      diagnostics,
      workerContracts: this.getWorkerContracts(),
    });
  }
}
