import type { TeamAgent } from '@process/team/types';

export type AcpWorkerContract = {
  slotId: string;
  agentName: string;
  backend: string;
  conversationId: string;
  supportsInterrupt: boolean;
  supportsResume: boolean;
  supportsStructuredTasks: boolean;
};

export class AcpMemberAdapter {
  supports(agent: TeamAgent): boolean {
    return agent.conversationType === 'acp' || agent.conversationType === 'codex';
  }

  getWorkerContract(agent: TeamAgent): AcpWorkerContract | null {
    if (!this.supports(agent)) return null;

    return {
      slotId: agent.slotId,
      agentName: agent.agentName,
      backend: agent.agentType,
      conversationId: agent.conversationId,
      supportsInterrupt: true,
      supportsResume: true,
      supportsStructuredTasks: true,
    };
  }
}
