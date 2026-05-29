import { describe, expect, it, vi } from 'vitest';
import { GatewaySessionBootstrap } from '../../src/process/team-runtime/gateway';
import type { TTeam } from '../../src/process/team/types';

function makeTeam(overrides: Partial<TTeam> = {}): TTeam {
  return {
    id: 'team-gateway',
    userId: 'user-1',
    name: 'Gateway Team',
    workspace: '/workspace',
    workspaceMode: 'shared',
    leaderAgentId: 'slot-lead',
    agents: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('GatewaySessionBootstrap', () => {
  it('persists gateway execution metadata before delegating compatibility bootstrap', async () => {
    const repo = {
      update: vi.fn().mockResolvedValue(undefined),
    };
    const nativeDriver = {
      startSession: vi.fn().mockResolvedValue(undefined),
      configureAgentMcp: vi.fn().mockResolvedValue(undefined),
      warmAgent: vi.fn().mockResolvedValue(undefined),
    };
    const gatewayEventSink = {
      emit: vi.fn().mockResolvedValue(undefined),
    };
    const bootstrap = new GatewaySessionBootstrap({
      repo: repo as any,
      nativeDriver: nativeDriver as any,
      createGatewayEventSink: vi.fn().mockReturnValue(gatewayEventSink),
    });

    const team = makeTeam({
      executionEngine: 'legacy_mailbox',
      orchestrationMode: 'legacy_mailbox',
      agents: [
        {
          slotId: 'slot-worker',
          conversationId: 'conv-worker',
          role: 'teammate',
          agentType: 'openclaw-gateway',
          agentName: 'Gateway Worker',
          conversationType: 'openclaw-gateway',
          status: 'idle',
        },
      ],
    });
    const session = {} as any;

    await bootstrap.initialize(team, session);

    expect(repo.update).toHaveBeenCalledWith(
      'team-gateway',
      expect.objectContaining({
        executionEngine: 'gateway',
        orchestrationMode: 'gateway_coordinated',
      })
    );
    expect(nativeDriver.startSession).toHaveBeenCalledWith(session);
    expect(nativeDriver.configureAgentMcp).toHaveBeenCalledWith(team, session, team.agents[0]);
    expect(nativeDriver.warmAgent).toHaveBeenCalledWith(team, team.agents[0], gatewayEventSink);
  });
});
