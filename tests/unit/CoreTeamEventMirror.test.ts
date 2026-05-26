import { describe, expect, it, vi } from 'vitest';
import {
  mirrorTeamAgentRemoved,
  mirrorTeamAgentRenamed,
  mirrorTeamAgentSpawned,
  mirrorTeamAgentStatusChanged,
  mirrorTeamListChanged,
  mirrorTeamMcpStatus,
} from '@process/core/team';
import { coreEventBus } from '@process/core/shared/CoreEventBus';

describe('CoreTeamEventMirror', () => {
  it('mirrors team lifecycle events onto the core event bus', () => {
    const listener = vi.fn();
    const unsubscribe = coreEventBus.on(listener);

    mirrorTeamListChanged({ teamId: 'team-1', action: 'created' });
    mirrorTeamAgentStatusChanged({ teamId: 'team-1', slotId: 'slot-1', status: 'active', lastMessage: 'working' });
    mirrorTeamAgentSpawned({
      teamId: 'team-1',
      agent: {
        slotId: 'slot-2',
        conversationId: 'c2',
        role: 'teammate',
        agentType: 'codex',
        agentName: 'Helper',
        conversationType: 'acp',
        status: 'pending',
      },
    });
    mirrorTeamAgentRemoved({ teamId: 'team-1', slotId: 'slot-2' });
    mirrorTeamAgentRenamed({ teamId: 'team-1', slotId: 'slot-1', oldName: 'Old', newName: 'New' });
    mirrorTeamMcpStatus({ teamId: 'team-1', slotId: 'slot-1', phase: 'tcp_ready', port: 19001 });
    unsubscribe();

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'team',
        type: 'team.list.changed',
        data: { teamId: 'team-1', action: 'created' },
      })
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'team',
        type: 'team.agent.status.changed',
        data: { teamId: 'team-1', slotId: 'slot-1', status: 'active', lastMessage: 'working' },
      })
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'team',
        type: 'team.agent.spawned',
        data: expect.objectContaining({ teamId: 'team-1', agent: expect.objectContaining({ slotId: 'slot-2' }) }),
      })
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'team',
        type: 'team.agent.removed',
        data: { teamId: 'team-1', slotId: 'slot-2' },
      })
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'team',
        type: 'team.agent.renamed',
        data: { teamId: 'team-1', slotId: 'slot-1', oldName: 'Old', newName: 'New' },
      })
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'team',
        type: 'team.mcp.status',
        data: { teamId: 'team-1', slotId: 'slot-1', phase: 'tcp_ready', port: 19001 },
      })
    );
  });
});
