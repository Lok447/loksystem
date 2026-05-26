import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoreTeamService } from '@process/core/team';
import { coreEventBus } from '@process/core/shared/CoreEventBus';
import type { TeamSessionService } from '@process/team/TeamSessionService';

describe('CoreTeamService', () => {
  const session = {
    sendMessage: vi.fn(),
    sendMessageToAgent: vi.fn(),
  };
  const teamSessionService = {
    createTeam: vi.fn(),
    listTeams: vi.fn(),
    getTeam: vi.fn(),
    deleteTeam: vi.fn(),
    addAgent: vi.fn(),
    removeAgent: vi.fn(),
    renameAgent: vi.fn(),
    renameTeam: vi.fn(),
    setSessionMode: vi.fn(),
    updateWorkspace: vi.fn(),
    getOrStartSession: vi.fn(),
    stopSession: vi.fn(),
  } as unknown as TeamSessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(teamSessionService.getOrStartSession).mockResolvedValue(session as never);
    vi.mocked(teamSessionService.createTeam).mockResolvedValue({ id: 'team-1' } as never);
    vi.mocked(teamSessionService.listTeams).mockResolvedValue([{ id: 'team-1' }] as never);
    vi.mocked(teamSessionService.getTeam).mockResolvedValue({ id: 'team-1' } as never);
    vi.mocked(teamSessionService.addAgent).mockResolvedValue({ slotId: 'slot-1' } as never);
  });

  it('reports unavailable when no team service is provided', async () => {
    const service = new CoreTeamService();

    expect(service.isAvailable()).toBe(false);
    await expect(service.sendMessage({ teamId: 'team-1', content: 'hello' })).resolves.toMatchObject({
      success: false,
    });
  });

  it('delegates team messages and emits core runtime events', async () => {
    const listener = vi.fn();
    const unsubscribe = coreEventBus.on(listener);
    const service = new CoreTeamService(teamSessionService);

    await expect(
      service.sendMessage({ teamId: 'team-1', content: 'hello', files: ['a.txt'] })
    ).resolves.toMatchObject({ success: true });
    await expect(
      service.sendMessageToAgent({ teamId: 'team-1', slotId: 'slot-1', content: 'direct' })
    ).resolves.toMatchObject({ success: true });
    unsubscribe();

    expect(teamSessionService.getOrStartSession).toHaveBeenCalledWith('team-1');
    expect(session.sendMessage).toHaveBeenCalledWith('hello', ['a.txt']);
    expect(session.sendMessageToAgent).toHaveBeenCalledWith('slot-1', 'direct', { files: undefined });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'team',
        type: 'team.runtime.updated',
        data: expect.objectContaining({ action: 'message_sent', teamId: 'team-1', fileCount: 1 }),
      })
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'team',
        type: 'team.runtime.updated',
        data: expect.objectContaining({ action: 'message_sent_to_agent', teamId: 'team-1', slotId: 'slot-1' }),
      })
    );
  });

  it('delegates team management commands', async () => {
    const service = new CoreTeamService(teamSessionService);

    await expect(
      service.create({ userId: 'user-1', name: 'Team', workspace: '', workspaceMode: 'shared', agents: [] })
    ).resolves.toMatchObject({ success: true, data: { id: 'team-1' } });
    await expect(service.list('user-1')).resolves.toEqual([{ id: 'team-1' }]);
    await expect(service.get('team-1')).resolves.toEqual({ id: 'team-1' });
    await expect(service.remove('team-1')).resolves.toMatchObject({ success: true });
    await expect(service.addAgent({ teamId: 'team-1', agent: { agentName: 'A' } as never })).resolves.toMatchObject({
      success: true,
    });
    await expect(service.removeAgent('team-1', 'slot-1')).resolves.toMatchObject({ success: true });
    await expect(service.renameAgent({ teamId: 'team-1', slotId: 'slot-1', newName: 'New' })).resolves.toMatchObject({
      success: true,
    });
    await expect(service.renameTeam({ id: 'team-1', name: 'New Team' })).resolves.toMatchObject({ success: true });
    await expect(service.setSessionMode({ teamId: 'team-1', sessionMode: 'yolo' })).resolves.toMatchObject({
      success: true,
    });
    await expect(service.updateWorkspace({ teamId: 'team-1', workspace: '/workspace' })).resolves.toMatchObject({
      success: true,
    });

    expect(teamSessionService.createTeam).toHaveBeenCalledWith({
      userId: 'user-1',
      name: 'Team',
      workspace: '',
      workspaceMode: 'shared',
      agents: [],
    });
    expect(teamSessionService.listTeams).toHaveBeenCalledWith('user-1');
    expect(teamSessionService.getTeam).toHaveBeenCalledWith('team-1');
    expect(teamSessionService.deleteTeam).toHaveBeenCalledWith('team-1');
    expect(teamSessionService.addAgent).toHaveBeenCalledWith('team-1', { agentName: 'A' });
    expect(teamSessionService.removeAgent).toHaveBeenCalledWith('team-1', 'slot-1');
    expect(teamSessionService.renameAgent).toHaveBeenCalledWith('team-1', 'slot-1', 'New');
    expect(teamSessionService.renameTeam).toHaveBeenCalledWith('team-1', 'New Team');
    expect(teamSessionService.setSessionMode).toHaveBeenCalledWith('team-1', 'yolo');
    expect(teamSessionService.updateWorkspace).toHaveBeenCalledWith('team-1', '/workspace');
  });

  it('delegates stop and ensure session commands', async () => {
    const service = new CoreTeamService(teamSessionService);

    await expect(service.ensureSession('team-1')).resolves.toMatchObject({ success: true });
    await expect(service.stop('team-1')).resolves.toMatchObject({ success: true });

    expect(teamSessionService.getOrStartSession).toHaveBeenCalledWith('team-1');
    expect(teamSessionService.stopSession).toHaveBeenCalledWith('team-1');
  });
});
