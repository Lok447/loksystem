import { ipcBridge } from '@/common';
import { mirrorTeamMcpStatus } from '@process/core/team';
import type { IConversationService } from '@process/services/IConversationService';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { TTeam } from '@process/team/types';
import type { ITeamExecutionBootstrap } from '../ITeamExecutionBootstrap';
import type { ITeamExecutionSession } from '../ITeamExecutionSession';

type CompatibilityMailboxSessionBootstrapParams = {
  conversationService: IConversationService;
  workerTaskManager: IWorkerTaskManager;
};

/**
 * Shared MCP/bootstrap initialization for mailbox-compatible runtimes.
 *
 * Both legacy mailbox mode and Hermes native compatibility mode currently use
 * the same underlying session/new + MCP injection flow, so the transport work
 * lives here while engine-specific metadata persistence stays in dedicated
 * bootstraps.
 */
export class CompatibilityMailboxSessionBootstrap implements ITeamExecutionBootstrap {
  constructor(private readonly params: CompatibilityMailboxSessionBootstrapParams) {}

  async initialize(team: TTeam, session: ITeamExecutionSession): Promise<void> {
    await session.start();

    await Promise.all(
      team.agents.map(async (agent) => {
        if (!agent.conversationId) return;

        const agentStdioConfig = session.getStdioConfig(agent.slotId);
        try {
          await this.params.conversationService.updateConversation(
            agent.conversationId,
            { extra: { teamMcpStdioConfig: agentStdioConfig } } as any,
            true
          );
          await this.params.workerTaskManager.getOrBuildTask(agent.conversationId, { skipCache: true });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          console.error(
            `[CompatibilityMailboxSessionBootstrap] Failed to write MCP config for agent ${agent.slotId}:`,
            error
          );
          const mcpEvent = {
            teamId: team.id,
            slotId: agent.slotId,
            phase: 'config_write_failed' as const,
            error,
          };
          ipcBridge.team.mcpStatus.emit(mcpEvent);
          mirrorTeamMcpStatus(mcpEvent);
        }
      })
    );
  }
}
