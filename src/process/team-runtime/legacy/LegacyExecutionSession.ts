import type { TeamOrchestrationMode } from '@/common/types/teamTypes';
import type { TeamAgent } from '@process/team/types';
import type {
  ITeamExecutionSession,
  TeamExecutionContext,
  TeamExecutionDiagnostics,
  TeamExecutionInfo,
  TeamExecutionSessionState,
} from '@process/team-runtime/ITeamExecutionSession';
import type { TeamExecutionEngineKind } from '@process/team-runtime/ITeamOrchestrationEngine';
import type { TeamSession } from '@process/team/TeamSession';

type LegacyExecutionSessionParams = {
  executionKind?: TeamExecutionEngineKind;
  orchestrationMode?: TeamOrchestrationMode;
  context?: TeamExecutionContext;
  diagnostics?: TeamExecutionDiagnostics;
};

export class LegacyExecutionSession implements ITeamExecutionSession {
  readonly teamId: string;
  readonly executionKind: TeamExecutionEngineKind;
  private readonly orchestrationMode: TeamOrchestrationMode;
  private readonly context?: TeamExecutionContext;
  private readonly diagnostics?: TeamExecutionDiagnostics;
  private state: TeamExecutionSessionState = 'created';

  constructor(private readonly session: TeamSession, params: LegacyExecutionSessionParams = {}) {
    this.teamId = session.teamId;
    this.executionKind = params.executionKind ?? 'legacy_mailbox';
    this.orchestrationMode = params.orchestrationMode ?? 'legacy_mailbox';
    this.context = params.context;
    this.diagnostics = params.diagnostics;
  }

  async start(): Promise<void> {
    this.state = 'starting';
    try {
      await this.session.start();
      this.state = 'running';
    } catch (error) {
      this.state = 'failed';
      throw error;
    }
  }

  getExecutionInfo(): TeamExecutionInfo {
    return {
      teamId: this.teamId,
      executionKind: this.executionKind,
      orchestrationMode: this.orchestrationMode,
      state: this.state,
      context: this.context,
      diagnostics: this.diagnostics,
    };
  }

  getStdioConfig(agentSlotId?: string): unknown | null {
    return this.session.getStdioConfig(agentSlotId);
  }

  async sendMessage(content: string, files?: string[]): Promise<void> {
    await this.session.sendMessage(content, files);
  }

  async sendMessageToAgent(
    slotId: string,
    content: string,
    options?: { silent?: boolean; files?: string[] }
  ): Promise<void> {
    await this.session.sendMessageToAgent(slotId, content, options);
  }

  renameAgent(slotId: string, newName: string): void {
    this.session.renameAgent(slotId, newName);
  }

  addAgent(agent: TeamAgent): void {
    this.session.addAgent(agent);
  }

  removeAgent(slotId: string): void {
    this.session.removeAgent(slotId);
  }

  getAgents(): TeamAgent[] {
    return this.session.getAgents();
  }

  async dispose(): Promise<void> {
    this.state = 'stopping';
    try {
      await this.session.dispose();
      this.state = 'stopped';
    } catch (error) {
      this.state = 'failed';
      throw error;
    }
  }

  getInnerSession(): TeamSession {
    return this.session;
  }
}
