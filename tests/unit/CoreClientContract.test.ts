import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInProcessCoreClient, getRegisteredCoreClient, registerCoreClient } from '@process/adapters/coreClient';
import { coreEventBus } from '@process/core/shared/CoreEventBus';
import type { CoreBackendServices } from '@process/core';

describe('createInProcessCoreClient', () => {
  const services = {
    sessions: {
      getSessionRuntimeState: vi.fn(),
      listSessionRuntimeStates: vi.fn(),
      getConversationWithRuntimeStatus: vi.fn(),
      getAssociateConversations: vi.fn(),
      listConversationsByCronJob: vi.fn(),
      getSlashCommands: vi.fn(),
    },
    taskRuntime: {
      getRuntimeOverview: vi.fn(),
      listRuntimeOverviews: vi.fn(),
      sendMessage: vi.fn(),
      stopTask: vi.fn(),
    },
    acpGateway: {
      getAvailableAgents: vi.fn(),
      refreshCustomAgents: vi.fn(),
      checkAgentHealth: vi.fn(),
      getSessionSnapshot: vi.fn(),
      setModel: vi.fn(),
      setMode: vi.fn(),
      setConfigOption: vi.fn(),
    },
    workspaces: {
      getWorkspaceTree: vi.fn(),
    },
    teams: {
      create: vi.fn(),
      list: vi.fn(),
      get: vi.fn(),
      remove: vi.fn(),
      addAgent: vi.fn(),
      removeAgent: vi.fn(),
      renameAgent: vi.fn(),
      renameTeam: vi.fn(),
      setSessionMode: vi.fn(),
      updateWorkspace: vi.fn(),
      sendMessage: vi.fn(),
      sendMessageToAgent: vi.fn(),
      stop: vi.fn(),
      ensureSession: vi.fn(),
    },
    uploads: {
      createUploadFile: vi.fn(),
    },
  } as unknown as CoreBackendServices;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates session runtime reads to core services', async () => {
    vi.mocked(services.sessions.getSessionRuntimeState).mockResolvedValue({ conversationId: 'c1' } as never);
    vi.mocked(services.sessions.listSessionRuntimeStates).mockResolvedValue([{ conversationId: 'c1' }] as never);

    const client = createInProcessCoreClient(services);

    await expect(client.sessions.getRuntimeState('c1')).resolves.toMatchObject({ conversationId: 'c1' });
    await expect(client.sessions.listRuntimeStates()).resolves.toHaveLength(1);
    expect(services.sessions.getSessionRuntimeState).toHaveBeenCalledWith('c1');
  });

  it('delegates conversation read APIs to core services', async () => {
    vi.mocked(services.sessions.getConversationWithRuntimeStatus).mockResolvedValue({ id: 'c1' } as never);
    vi.mocked(services.sessions.getAssociateConversations).mockResolvedValue([{ id: 'c2' }] as never);
    vi.mocked(services.sessions.listConversationsByCronJob).mockResolvedValue([{ id: 'c3' }] as never);
    vi.mocked(services.sessions.getSlashCommands).mockResolvedValue({
      success: true,
      data: { commands: [{ name: 'help' }] },
    } as never);
    vi.mocked(services.taskRuntime.sendMessage).mockResolvedValue({ success: true } as never);
    vi.mocked(services.taskRuntime.stopTask).mockResolvedValue({ success: true } as never);

    const client = createInProcessCoreClient(services);

    await expect(client.conversations.get('c1')).resolves.toMatchObject({ id: 'c1' });
    await expect(client.conversations.getAssociate('c1')).resolves.toEqual([{ id: 'c2' }]);
    await expect(client.conversations.listByCronJob('cron-1')).resolves.toEqual([{ id: 'c3' }]);
    await expect(client.conversations.getSlashCommands('c1')).resolves.toMatchObject({
      success: true,
      data: { commands: [{ name: 'help' }] },
    });
    await expect(
      client.conversations.sendMessage({ conversation_id: 'c1', msg_id: 'm1', input: 'hello' })
    ).resolves.toMatchObject({ success: true });
    await expect(client.conversations.stop('c1')).resolves.toMatchObject({ success: true });
    expect(services.sessions.getConversationWithRuntimeStatus).toHaveBeenCalledWith('c1');
    expect(services.sessions.getAssociateConversations).toHaveBeenCalledWith('c1');
    expect(services.sessions.listConversationsByCronJob).toHaveBeenCalledWith('cron-1');
    expect(services.sessions.getSlashCommands).toHaveBeenCalledWith('c1');
    expect(services.taskRuntime.sendMessage).toHaveBeenCalledWith({
      conversation_id: 'c1',
      msg_id: 'm1',
      input: 'hello',
    });
    expect(services.taskRuntime.stopTask).toHaveBeenCalledWith('c1');
  });

  it('delegates task runtime reads to core services', async () => {
    vi.mocked(services.taskRuntime.getRuntimeOverview).mockResolvedValue({ conversationId: 'task-1' } as never);
    vi.mocked(services.taskRuntime.listRuntimeOverviews).mockResolvedValue([{ conversationId: 'task-1' }] as never);

    const client = createInProcessCoreClient(services);

    await expect(client.tasks.getRuntimeOverview('task-1')).resolves.toMatchObject({ conversationId: 'task-1' });
    await expect(client.tasks.listRuntimeOverviews()).resolves.toHaveLength(1);
    expect(services.taskRuntime.getRuntimeOverview).toHaveBeenCalledWith('task-1');
  });

  it('delegates ACP snapshots to core services', async () => {
    vi.mocked(services.acpGateway.getSessionSnapshot).mockResolvedValue({ conversationId: 'acp-1' } as never);

    const client = createInProcessCoreClient(services);

    await expect(client.acp.getSessionSnapshot('acp-1')).resolves.toMatchObject({ conversationId: 'acp-1' });
    expect(services.acpGateway.getSessionSnapshot).toHaveBeenCalledWith('acp-1');
  });

  it('delegates ACP discovery and health reads to core services', async () => {
    vi.mocked(services.acpGateway.getAvailableAgents).mockReturnValue({
      success: true,
      data: [{ backend: 'codex', name: 'Codex' }],
    } as never);
    vi.mocked(services.acpGateway.refreshCustomAgents).mockResolvedValue(undefined as never);
    vi.mocked(services.acpGateway.checkAgentHealth).mockResolvedValue({
      success: true,
      data: { available: true },
    } as never);

    const client = createInProcessCoreClient(services);

    await expect(client.acp.getAvailableAgents()).resolves.toMatchObject({
      success: true,
      data: [{ backend: 'codex' }],
    });
    await expect(client.acp.refreshCustomAgents()).resolves.toBeUndefined();
    await expect(client.acp.checkAgentHealth('codex')).resolves.toMatchObject({
      success: true,
      data: { backend: 'codex', available: true },
    });
    expect(services.acpGateway.getAvailableAgents).toHaveBeenCalledOnce();
    expect(services.acpGateway.refreshCustomAgents).toHaveBeenCalledOnce();
    expect(services.acpGateway.checkAgentHealth).toHaveBeenCalledWith('codex');
  });

  it('delegates ACP writes to core services', async () => {
    vi.mocked(services.acpGateway.setModel).mockResolvedValue({ success: true } as never);
    vi.mocked(services.acpGateway.setMode).mockResolvedValue({ success: true, data: { mode: 'yolo' } } as never);
    vi.mocked(services.acpGateway.setConfigOption).mockResolvedValue({
      success: true,
      data: { configOptions: [] },
    } as never);

    const client = createInProcessCoreClient(services);

    await expect(client.acp.setModel('acp-1', 'model-1')).resolves.toMatchObject({ success: true });
    await expect(client.acp.setMode('acp-1', 'yolo')).resolves.toMatchObject({ success: true });
    await expect(client.acp.setConfigOption('acp-1', 'reasoning', 'high')).resolves.toMatchObject({ success: true });
    expect(services.acpGateway.setModel).toHaveBeenCalledWith('acp-1', 'model-1');
    expect(services.acpGateway.setMode).toHaveBeenCalledWith('acp-1', 'yolo');
    expect(services.acpGateway.setConfigOption).toHaveBeenCalledWith('acp-1', 'reasoning', 'high');
  });

  it('delegates workspace tree reads to core services', async () => {
    vi.mocked(services.workspaces.getWorkspaceTree).mockResolvedValue([{ name: 'root' }] as never);

    const client = createInProcessCoreClient(services);
    const query = {
      conversationId: 'workspace-1',
      workspace: '/workspace',
      targetPath: '/workspace',
    };

    await expect(client.workspaces.getTree(query)).resolves.toEqual([{ name: 'root' }]);
    expect(services.workspaces.getWorkspaceTree).toHaveBeenCalledWith(query);
  });

  it('delegates team runtime commands to core services', async () => {
    vi.mocked(services.teams.create).mockResolvedValue({ success: true, data: { id: 'team-1' } } as never);
    vi.mocked(services.teams.list).mockResolvedValue([{ id: 'team-1' }] as never);
    vi.mocked(services.teams.get).mockResolvedValue({ id: 'team-1' } as never);
    vi.mocked(services.teams.remove).mockResolvedValue({ success: true } as never);
    vi.mocked(services.teams.addAgent).mockResolvedValue({ success: true, data: { slotId: 'slot-1' } } as never);
    vi.mocked(services.teams.removeAgent).mockResolvedValue({ success: true } as never);
    vi.mocked(services.teams.renameAgent).mockResolvedValue({ success: true } as never);
    vi.mocked(services.teams.renameTeam).mockResolvedValue({ success: true } as never);
    vi.mocked(services.teams.setSessionMode).mockResolvedValue({ success: true } as never);
    vi.mocked(services.teams.updateWorkspace).mockResolvedValue({ success: true } as never);
    vi.mocked(services.teams.sendMessage).mockResolvedValue({ success: true } as never);
    vi.mocked(services.teams.sendMessageToAgent).mockResolvedValue({ success: true } as never);
    vi.mocked(services.teams.stop).mockResolvedValue({ success: true } as never);
    vi.mocked(services.teams.ensureSession).mockResolvedValue({ success: true } as never);

    const client = createInProcessCoreClient(services);

    await expect(
      client.teams.create({
        userId: 'user-1',
        name: 'Team',
        workspace: '',
        workspaceMode: 'shared',
        agents: [],
      })
    ).resolves.toMatchObject({ success: true });
    await expect(client.teams.list('user-1')).resolves.toEqual([{ id: 'team-1' }]);
    await expect(client.teams.get('team-1')).resolves.toMatchObject({ id: 'team-1' });
    await expect(client.teams.remove('team-1')).resolves.toMatchObject({ success: true });
    await expect(client.teams.addAgent({ teamId: 'team-1', agent: { agentName: 'A' } as never })).resolves.toMatchObject({
      success: true,
    });
    await expect(client.teams.removeAgent('team-1', 'slot-1')).resolves.toMatchObject({ success: true });
    await expect(client.teams.renameAgent({ teamId: 'team-1', slotId: 'slot-1', newName: 'New' })).resolves.toMatchObject({
      success: true,
    });
    await expect(client.teams.renameTeam({ id: 'team-1', name: 'New Team' })).resolves.toMatchObject({ success: true });
    await expect(client.teams.setSessionMode({ teamId: 'team-1', sessionMode: 'yolo' })).resolves.toMatchObject({
      success: true,
    });
    await expect(client.teams.updateWorkspace({ teamId: 'team-1', workspace: '/workspace' })).resolves.toMatchObject({
      success: true,
    });
    await expect(client.teams.sendMessage({ teamId: 'team-1', content: 'hello', files: ['a.txt'] })).resolves.toMatchObject({
      success: true,
    });
    await expect(
      client.teams.sendMessageToAgent({ teamId: 'team-1', slotId: 'slot-1', content: 'hello' })
    ).resolves.toMatchObject({ success: true });
    await expect(client.teams.stop('team-1')).resolves.toMatchObject({ success: true });
    await expect(client.teams.ensureSession('team-1')).resolves.toMatchObject({ success: true });
    expect(services.teams.sendMessage).toHaveBeenCalledWith({ teamId: 'team-1', content: 'hello', files: ['a.txt'] });
    expect(services.teams.sendMessageToAgent).toHaveBeenCalledWith({
      teamId: 'team-1',
      slotId: 'slot-1',
      content: 'hello',
    });
    expect(services.teams.stop).toHaveBeenCalledWith('team-1');
    expect(services.teams.ensureSession).toHaveBeenCalledWith('team-1');
  });

  it('delegates upload file creation to core services', async () => {
    vi.mocked(services.uploads.createUploadFile).mockResolvedValue({ path: '/tmp/file.txt' } as never);

    const client = createInProcessCoreClient(services);

    await expect(client.uploads.createFile({ fileName: 'file.txt', conversationId: 'c1' })).resolves.toEqual({
      success: true,
      data: { path: '/tmp/file.txt' },
    });
    expect(services.uploads.createUploadFile).toHaveBeenCalledWith({ fileName: 'file.txt', conversationId: 'c1' });
  });

  it('registers the active core client for late-bound transports', () => {
    const client = createInProcessCoreClient(services);

    expect(registerCoreClient(client)).toBe(client);
    expect(getRegisteredCoreClient()).toBe(client);
  });

  it('subscribes to core events without binding to a transport', () => {
    const client = createInProcessCoreClient(services);
    const listener = vi.fn();
    const unsubscribe = client.events.subscribe(listener);

    coreEventBus.emit('session', 'session.created', { conversationId: 'event-1' });
    unsubscribe();
    coreEventBus.emit('session', 'session.created', { conversationId: 'event-2' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'session',
        type: 'session.created',
        data: { conversationId: 'event-1' },
      })
    );
  });
});
