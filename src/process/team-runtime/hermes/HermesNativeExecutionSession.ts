import type { TeamAgent } from '@process/team/types';
import type {
  ITeamExecutionSession,
  TeamExecutionContext,
  TeamExecutionDiagnostics,
  TeamExecutionInfo,
} from '../ITeamExecutionSession';

type HermesNativeExecutionSessionParams = {
  context?: TeamExecutionContext;
  diagnostics?: TeamExecutionDiagnostics;
};

export class HermesNativeExecutionSession implements ITeamExecutionSession {
  readonly teamId: string;
  readonly executionKind = 'hermes_native' as const;

  constructor(
    private readonly inner: ITeamExecutionSession,
    private readonly params: HermesNativeExecutionSessionParams = {}
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
    const mergedSummary = [...(innerInfo.diagnostics?.summary ?? []), ...(this.params.diagnostics?.summary ?? [])];
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
      orchestrationMode: 'native_orchestrator',
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
}
