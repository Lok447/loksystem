import type { TeamAgent } from '@process/team/types';
import type {
  ITeamExecutionSession,
  TeamExecutionContext,
  TeamExecutionDiagnostics,
  TeamExecutionInfo,
} from '../ITeamExecutionSession';
import type { OpenClawGatewayRuntimeAdapter } from './OpenClawGatewayRuntimeAdapter';

type GatewayRuntimeShellParams = {
  context?: TeamExecutionContext;
  diagnostics?: TeamExecutionDiagnostics;
  gatewayRuntimeAdapter?: OpenClawGatewayRuntimeAdapter;
};

export class GatewayRuntimeShell implements ITeamExecutionSession {
  readonly teamId: string;
  readonly executionKind = 'gateway' as const;

  constructor(
    private readonly shellInner: ITeamExecutionSession,
    private readonly shellParams: GatewayRuntimeShellParams
  ) {
    this.teamId = shellInner.teamId;
  }

  async start(): Promise<void> {
    await this.shellInner.start();
  }

  getExecutionInfo(): TeamExecutionInfo {
    const innerInfo = this.shellInner.getExecutionInfo();
    const runtimeSnapshots = this.getAgents()
      .filter((agent) => agent.role !== 'leader')
      .map((agent) => this.shellParams.gatewayRuntimeAdapter?.getWorkerRuntime(agent))
      .filter((runtime): runtime is NonNullable<typeof runtime> => Boolean(runtime));
    const activeSessions = runtimeSnapshots.filter((snapshot) => snapshot.runtimeStatus === 'session_active').length;
    const reconnectingWorkers = runtimeSnapshots.filter((snapshot) => snapshot.runtimeStatus === 'reconnecting').length;
    const mergedSummary = [
      ...(innerInfo.diagnostics?.summary ?? []),
      ...(this.shellParams.diagnostics?.summary ?? []),
      runtimeSnapshots.length > 0 ? `gateway_runtime_workers:${runtimeSnapshots.length}` : '',
      activeSessions > 0 ? `gateway_active_runtime_sessions:${activeSessions}` : '',
      reconnectingWorkers > 0 ? `gateway_reconnecting_workers:${reconnectingWorkers}` : '',
    ].filter(Boolean);

    return {
      ...innerInfo,
      executionKind: this.executionKind,
      orchestrationMode: 'gateway_coordinated',
      context:
        innerInfo.context || this.shellParams.context
          ? {
              ...innerInfo.context,
              ...this.shellParams.context,
            }
          : undefined,
      diagnostics:
        mergedSummary.length > 0 || innerInfo.diagnostics?.fallbackReason || this.shellParams.diagnostics?.fallbackReason
          ? {
              summary: [...new Set(mergedSummary)],
              fallbackReason: this.shellParams.diagnostics?.fallbackReason ?? innerInfo.diagnostics?.fallbackReason,
            }
          : undefined,
    };
  }

  getStdioConfig(agentSlotId?: string): unknown | null {
    return this.shellInner.getStdioConfig(agentSlotId);
  }

  async sendMessage(content: string, files?: string[]): Promise<void> {
    await this.shellInner.sendMessage(content, files);
  }

  async sendMessageToAgent(
    slotId: string,
    content: string,
    options?: { silent?: boolean; files?: string[] }
  ): Promise<void> {
    await this.shellInner.sendMessageToAgent(slotId, content, options);
  }

  renameAgent(slotId: string, newName: string): void {
    this.shellInner.renameAgent(slotId, newName);
  }

  addAgent(agent: TeamAgent): void {
    this.shellInner.addAgent(agent);
  }

  removeAgent(slotId: string): void {
    this.shellInner.removeAgent(slotId);
  }

  getAgents(): TeamAgent[] {
    return this.shellInner.getAgents();
  }

  async dispose(): Promise<void> {
    await this.shellInner.dispose();
  }
}
