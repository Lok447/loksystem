import type { TeamAgent } from '@process/team/types';

export type OpenClawWorkerContract = {
  slotId: string;
  agentName: string;
  backend: string;
  conversationId: string;
  cliPath?: string;
  gatewaySessionId?: string;
  supportsInterrupt: boolean;
  supportsResume: boolean;
  supportsStructuredTasks: boolean;
  supportsGatewayLifecycle: boolean;
};

export class OpenClawMemberAdapter {
  supports(agent: TeamAgent): boolean {
    return agent.conversationType === 'openclaw-gateway' || agent.agentType === 'openclaw-gateway';
  }

  getWorkerContract(agent: TeamAgent): OpenClawWorkerContract | null {
    if (!this.supports(agent)) return null;

    return {
      slotId: agent.slotId,
      agentName: agent.agentName,
      backend: agent.agentType,
      conversationId: agent.conversationId,
      cliPath: agent.cliPath,
      gatewaySessionId: agent.conversationId || undefined,
      supportsInterrupt: true,
      supportsResume: true,
      supportsStructuredTasks: true,
      supportsGatewayLifecycle: true,
    };
  }
}
