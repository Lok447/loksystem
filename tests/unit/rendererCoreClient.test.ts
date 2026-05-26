// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { ipcBridgeMock } = vi.hoisted(() => ({
  ipcBridgeMock: {
    core: {
      sessions: {
        getRuntimeState: { invoke: vi.fn() },
        listRuntimeStates: { invoke: vi.fn() },
      },
      conversations: {
        get: { invoke: vi.fn() },
        getAssociate: { invoke: vi.fn() },
        listByCronJob: { invoke: vi.fn() },
        getSlashCommands: { invoke: vi.fn() },
        sendMessage: { invoke: vi.fn() },
        stop: { invoke: vi.fn() },
      },
      tasks: {
        getRuntimeOverview: { invoke: vi.fn() },
        listRuntimeOverviews: { invoke: vi.fn() },
      },
      acp: {
        getAvailableAgents: { invoke: vi.fn() },
        refreshCustomAgents: { invoke: vi.fn() },
        checkAgentHealth: { invoke: vi.fn() },
        getSessionSnapshot: { invoke: vi.fn() },
        setModel: { invoke: vi.fn() },
        setMode: { invoke: vi.fn() },
        setConfigOption: { invoke: vi.fn() },
      },
      workspaces: {
        getTree: { invoke: vi.fn() },
      },
      teams: {
        create: { invoke: vi.fn() },
        list: { invoke: vi.fn() },
        get: { invoke: vi.fn() },
        remove: { invoke: vi.fn() },
        addAgent: { invoke: vi.fn() },
        removeAgent: { invoke: vi.fn() },
        renameAgent: { invoke: vi.fn() },
        renameTeam: { invoke: vi.fn() },
        setSessionMode: { invoke: vi.fn() },
        updateWorkspace: { invoke: vi.fn() },
        sendMessage: { invoke: vi.fn() },
        sendMessageToAgent: { invoke: vi.fn() },
        stop: { invoke: vi.fn() },
        ensureSession: { invoke: vi.fn() },
      },
      uploads: {
        createFile: { invoke: vi.fn() },
      },
      events: {
        stream: { on: vi.fn() },
      },
    },
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: ipcBridgeMock,
}));

describe('getRendererCoreClient', () => {
  const originalFetch = globalThis.fetch;
  const originalElectronApi = (window as { electronAPI?: unknown }).electronAPI;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete (window as { electronAPI?: unknown }).electronAPI;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalElectronApi) {
      (window as { electronAPI?: unknown }).electronAPI = originalElectronApi;
    } else {
      delete (window as { electronAPI?: unknown }).electronAPI;
    }
  });

  it('uses HTTP core routes in Web runtime', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: [{ conversationId: 'c1' }],
      }),
    })) as never;

    const { getRendererCoreClient } = await import('@/common/coreClient');
    const result = await getRendererCoreClient().sessions.listRuntimeStates();

    expect(result).toEqual([{ conversationId: 'c1' }]);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/sessions/runtime', {
      credentials: 'include',
    });
  });

  it('uses Electron IPC core channels in desktop runtime', async () => {
    (window as { electronAPI?: unknown }).electronAPI = {};
    ipcBridgeMock.core.sessions.getRuntimeState.invoke.mockResolvedValue({ conversationId: 'desktop-1' });

    const { getRendererCoreClient } = await import('@/common/coreClient');
    const result = await getRendererCoreClient().sessions.getRuntimeState('desktop-1');

    expect(result).toEqual({ conversationId: 'desktop-1' });
    expect(ipcBridgeMock.core.sessions.getRuntimeState.invoke).toHaveBeenCalledWith({
      conversationId: 'desktop-1',
    });
  });

  it('uses Electron IPC core channels for conversation reads in desktop runtime', async () => {
    (window as { electronAPI?: unknown }).electronAPI = {};
    ipcBridgeMock.core.conversations.get.invoke.mockResolvedValue({ id: 'desktop-1' });
    ipcBridgeMock.core.conversations.getAssociate.invoke.mockResolvedValue([{ id: 'desktop-2' }]);
    ipcBridgeMock.core.conversations.listByCronJob.invoke.mockResolvedValue([{ id: 'cron-conv' }]);
    ipcBridgeMock.core.conversations.getSlashCommands.invoke.mockResolvedValue({
      success: true,
      data: { commands: [{ name: 'help' }] },
    });
    ipcBridgeMock.core.conversations.sendMessage.invoke.mockResolvedValue({ success: true });
    ipcBridgeMock.core.conversations.stop.invoke.mockResolvedValue({ success: true });

    const { getRendererCoreClient } = await import('@/common/coreClient');
    const client = getRendererCoreClient();

    await expect(client.conversations.get('desktop-1')).resolves.toMatchObject({ id: 'desktop-1' });
    await expect(client.conversations.getAssociate('desktop-1')).resolves.toEqual([{ id: 'desktop-2' }]);
    await expect(client.conversations.listByCronJob('cron-1')).resolves.toEqual([{ id: 'cron-conv' }]);
    await expect(client.conversations.getSlashCommands('desktop-1')).resolves.toMatchObject({
      success: true,
      data: { commands: [{ name: 'help' }] },
    });
    await expect(
      client.conversations.sendMessage({ conversation_id: 'desktop-1', msg_id: 'm1', input: 'hello' })
    ).resolves.toMatchObject({ success: true });
    await expect(client.conversations.stop('desktop-1')).resolves.toMatchObject({ success: true });
    expect(ipcBridgeMock.core.conversations.get.invoke).toHaveBeenCalledWith({ id: 'desktop-1' });
    expect(ipcBridgeMock.core.conversations.getAssociate.invoke).toHaveBeenCalledWith({
      conversationId: 'desktop-1',
    });
    expect(ipcBridgeMock.core.conversations.listByCronJob.invoke).toHaveBeenCalledWith({ cronJobId: 'cron-1' });
    expect(ipcBridgeMock.core.conversations.getSlashCommands.invoke).toHaveBeenCalledWith({
      conversationId: 'desktop-1',
    });
    expect(ipcBridgeMock.core.conversations.sendMessage.invoke).toHaveBeenCalledWith({
      conversation_id: 'desktop-1',
      msg_id: 'm1',
      input: 'hello',
    });
    expect(ipcBridgeMock.core.conversations.stop.invoke).toHaveBeenCalledWith({
      conversationId: 'desktop-1',
    });
  });

  it('uses Electron IPC core channels for team runtime commands in desktop runtime', async () => {
    (window as { electronAPI?: unknown }).electronAPI = {};
    ipcBridgeMock.core.teams.create.invoke.mockResolvedValue({ success: true, data: { id: 'team-1' } });
    ipcBridgeMock.core.teams.list.invoke.mockResolvedValue([{ id: 'team-1' }]);
    ipcBridgeMock.core.teams.get.invoke.mockResolvedValue({ id: 'team-1' });
    ipcBridgeMock.core.teams.remove.invoke.mockResolvedValue({ success: true });
    ipcBridgeMock.core.teams.addAgent.invoke.mockResolvedValue({ success: true, data: { slotId: 'slot-1' } });
    ipcBridgeMock.core.teams.removeAgent.invoke.mockResolvedValue({ success: true });
    ipcBridgeMock.core.teams.renameAgent.invoke.mockResolvedValue({ success: true });
    ipcBridgeMock.core.teams.renameTeam.invoke.mockResolvedValue({ success: true });
    ipcBridgeMock.core.teams.setSessionMode.invoke.mockResolvedValue({ success: true });
    ipcBridgeMock.core.teams.updateWorkspace.invoke.mockResolvedValue({ success: true });
    ipcBridgeMock.core.teams.sendMessage.invoke.mockResolvedValue({ success: true });
    ipcBridgeMock.core.teams.sendMessageToAgent.invoke.mockResolvedValue({ success: true });
    ipcBridgeMock.core.teams.stop.invoke.mockResolvedValue({ success: true });
    ipcBridgeMock.core.teams.ensureSession.invoke.mockResolvedValue({ success: true });
    ipcBridgeMock.core.uploads.createFile.invoke.mockResolvedValue({ success: true, data: { path: '/tmp/file.txt' } });

    const { getRendererCoreClient } = await import('@/common/coreClient');
    const client = getRendererCoreClient();

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
    await expect(client.uploads.createFile({ fileName: 'file.txt', conversationId: 'c1' })).resolves.toEqual({
      success: true,
      data: { path: '/tmp/file.txt' },
    });
    expect(ipcBridgeMock.core.teams.sendMessage.invoke).toHaveBeenCalledWith({
      teamId: 'team-1',
      content: 'hello',
      files: ['a.txt'],
    });
    expect(ipcBridgeMock.core.teams.sendMessageToAgent.invoke).toHaveBeenCalledWith({
      teamId: 'team-1',
      slotId: 'slot-1',
      content: 'hello',
    });
    expect(ipcBridgeMock.core.teams.stop.invoke).toHaveBeenCalledWith({ teamId: 'team-1' });
    expect(ipcBridgeMock.core.teams.ensureSession.invoke).toHaveBeenCalledWith({ teamId: 'team-1' });
    expect(ipcBridgeMock.core.uploads.createFile.invoke).toHaveBeenCalledWith({
      fileName: 'file.txt',
      conversationId: 'c1',
    });
  });

  it('uses Electron IPC core channels for ACP writes in desktop runtime', async () => {
    (window as { electronAPI?: unknown }).electronAPI = {};
    ipcBridgeMock.core.acp.setModel.invoke.mockResolvedValue({ success: true, data: { modelId: 'm1' } });
    ipcBridgeMock.core.acp.setMode.invoke.mockResolvedValue({ success: true, data: { mode: 'yolo' } });
    ipcBridgeMock.core.acp.setConfigOption.invoke.mockResolvedValue({
      success: true,
      data: { configOptions: [] },
    });

    const { getRendererCoreClient } = await import('@/common/coreClient');
    const client = getRendererCoreClient();

    await expect(client.acp.setModel('desktop-1', 'm1')).resolves.toMatchObject({ success: true });
    await expect(client.acp.setMode('desktop-1', 'yolo')).resolves.toMatchObject({ success: true });
    await expect(client.acp.setConfigOption('desktop-1', 'reasoning', 'high')).resolves.toMatchObject({
      success: true,
    });
    expect(ipcBridgeMock.core.acp.setModel.invoke).toHaveBeenCalledWith({
      conversationId: 'desktop-1',
      modelId: 'm1',
    });
    expect(ipcBridgeMock.core.acp.setMode.invoke).toHaveBeenCalledWith({
      conversationId: 'desktop-1',
      mode: 'yolo',
    });
    expect(ipcBridgeMock.core.acp.setConfigOption.invoke).toHaveBeenCalledWith({
      conversationId: 'desktop-1',
      configId: 'reasoning',
      value: 'high',
    });
  });

  it('uses Electron IPC core channels for ACP discovery in desktop runtime', async () => {
    (window as { electronAPI?: unknown }).electronAPI = {};
    ipcBridgeMock.core.acp.getAvailableAgents.invoke.mockResolvedValue({
      success: true,
      data: [{ backend: 'codex' }],
    });
    ipcBridgeMock.core.acp.refreshCustomAgents.invoke.mockResolvedValue(undefined);
    ipcBridgeMock.core.acp.checkAgentHealth.invoke.mockResolvedValue({
      success: true,
      data: { backend: 'codex', available: true },
    });

    const { getRendererCoreClient } = await import('@/common/coreClient');
    const client = getRendererCoreClient();

    await expect(client.acp.getAvailableAgents()).resolves.toMatchObject({ success: true });
    await expect(client.acp.refreshCustomAgents()).resolves.toBeUndefined();
    await expect(client.acp.checkAgentHealth('codex')).resolves.toMatchObject({
      success: true,
      data: { backend: 'codex' },
    });
    expect(ipcBridgeMock.core.acp.checkAgentHealth.invoke).toHaveBeenCalledWith({ backend: 'codex' });
  });

  it('uses HTTP core routes for ACP writes in Web runtime', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: { success: true },
      }),
    })) as never;

    const { getRendererCoreClient } = await import('@/common/coreClient');
    const client = getRendererCoreClient();

    await client.acp.setModel('web-1', 'm1');
    await client.acp.setMode('web-1', 'yolo');
    await client.acp.setConfigOption('web-1', 'reasoning', 'high');

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/acp/sessions/web-1/model', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ modelId: 'm1' }),
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/acp/sessions/web-1/mode', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode: 'yolo' }),
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/acp/sessions/web-1/config', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ configId: 'reasoning', value: 'high' }),
    });
  });

  it('uses HTTP core routes for conversation reads in Web runtime', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: { id: 'web-1' },
      }),
    })) as never;

    const { getRendererCoreClient } = await import('@/common/coreClient');
    const client = getRendererCoreClient();

    await client.conversations.get('web-1');
    await client.conversations.getAssociate('web-1');
    await client.conversations.listByCronJob('cron-1');
    await client.conversations.getSlashCommands('web-1');
    await client.conversations.sendMessage({ conversation_id: 'web-1', msg_id: 'm1', input: 'hello' });
    await client.conversations.stop('web-1');

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/conversations/web-1', {
      credentials: 'include',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/conversations/web-1/associate', {
      credentials: 'include',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/conversations/cron/cron-1', {
      credentials: 'include',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/conversations/web-1/slash-commands', {
      credentials: 'include',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/conversations/web-1/messages', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversation_id: 'web-1', msg_id: 'm1', input: 'hello' }),
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/conversations/web-1/stop', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
  });

  it('uses HTTP core routes for team runtime commands in Web runtime', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: { success: true },
      }),
    })) as never;

    const { getRendererCoreClient } = await import('@/common/coreClient');
    const client = getRendererCoreClient();

    await client.teams.create({ userId: 'user-1', name: 'Team', workspace: '', workspaceMode: 'shared', agents: [] });
    await client.teams.list('user-1');
    await client.teams.get('team-1');
    await client.teams.remove('team-1');
    await client.teams.addAgent({ teamId: 'team-1', agent: { agentName: 'A' } as never });
    await client.teams.removeAgent('team-1', 'slot-1');
    await client.teams.renameAgent({ teamId: 'team-1', slotId: 'slot-1', newName: 'New' });
    await client.teams.renameTeam({ id: 'team-1', name: 'New Team' });
    await client.teams.setSessionMode({ teamId: 'team-1', sessionMode: 'yolo' });
    await client.teams.updateWorkspace({ teamId: 'team-1', workspace: '/workspace' });
    await client.teams.sendMessage({ teamId: 'team-1', content: 'hello', files: ['a.txt'] });
    await client.teams.sendMessageToAgent({ teamId: 'team-1', slotId: 'slot-1', content: 'hello' });
    await client.teams.stop('team-1');
    await client.teams.ensureSession('team-1');
    await client.uploads.createFile({ fileName: 'file.txt', conversationId: 'c1' });

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/teams', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: 'user-1', name: 'Team', workspace: '', workspaceMode: 'shared', agents: [] }),
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/teams?userId=user-1', {
      credentials: 'include',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/teams/team-1', {
      credentials: 'include',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/teams/team-1/delete', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/teams/team-1/messages', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ teamId: 'team-1', content: 'hello', files: ['a.txt'] }),
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/teams/team-1/agents/slot-1/messages', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ teamId: 'team-1', slotId: 'slot-1', content: 'hello' }),
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/teams/team-1/stop', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/teams/team-1/session', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/uploads/files', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileName: 'file.txt', conversationId: 'c1' }),
    });
  });

  it('uses HTTP core routes for ACP discovery in Web runtime', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: { success: true, data: [{ backend: 'codex' }] },
      }),
    })) as never;

    const { getRendererCoreClient } = await import('@/common/coreClient');
    const client = getRendererCoreClient();

    await client.acp.getAvailableAgents();
    await client.acp.refreshCustomAgents();
    await client.acp.checkAgentHealth('codex');

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/acp/agents', {
      credentials: 'include',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/acp/agents/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/core/acp/agents/codex/health', {
      credentials: 'include',
    });
  });

  it('subscribes to core events through the shared bridge stream', async () => {
    const unsubscribe = vi.fn();
    ipcBridgeMock.core.events.stream.on.mockReturnValue(unsubscribe);

    const { getRendererCoreClient } = await import('@/common/coreClient');
    const listener = vi.fn();
    const result = getRendererCoreClient().events.subscribe(listener);

    expect(result).toBe(unsubscribe);
    expect(ipcBridgeMock.core.events.stream.on).toHaveBeenCalledWith(listener);
  });
});
