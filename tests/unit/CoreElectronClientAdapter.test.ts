import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handlers, emitters } = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: never[]) => unknown>,
  emitters: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

function makeProvider(name: string) {
  return {
    provider: vi.fn((fn: (...args: never[]) => unknown) => {
      handlers[name] = fn;
    }),
  };
}

function makeEmitter(name: string) {
  const emit = vi.fn();
  emitters[name] = emit;
  return { emit };
}

vi.mock('@/common', () => ({
  ipcBridge: {
    core: {
      sessions: {
        getRuntimeState: makeProvider('sessions.getRuntimeState'),
        listRuntimeStates: makeProvider('sessions.listRuntimeStates'),
      },
      conversations: {
        get: makeProvider('conversations.get'),
        getAssociate: makeProvider('conversations.getAssociate'),
        listByCronJob: makeProvider('conversations.listByCronJob'),
        getSlashCommands: makeProvider('conversations.getSlashCommands'),
        sendMessage: makeProvider('conversations.sendMessage'),
        stop: makeProvider('conversations.stop'),
      },
      tasks: {
        getRuntimeOverview: makeProvider('tasks.getRuntimeOverview'),
        listRuntimeOverviews: makeProvider('tasks.listRuntimeOverviews'),
      },
      acp: {
        getAvailableAgents: makeProvider('acp.getAvailableAgents'),
        refreshCustomAgents: makeProvider('acp.refreshCustomAgents'),
        checkAgentHealth: makeProvider('acp.checkAgentHealth'),
        getSessionSnapshot: makeProvider('acp.getSessionSnapshot'),
        setModel: makeProvider('acp.setModel'),
        setMode: makeProvider('acp.setMode'),
        setConfigOption: makeProvider('acp.setConfigOption'),
      },
      workspaces: {
        getTree: makeProvider('workspaces.getTree'),
      },
      teams: {
        create: makeProvider('teams.create'),
        list: makeProvider('teams.list'),
        get: makeProvider('teams.get'),
        remove: makeProvider('teams.remove'),
        addAgent: makeProvider('teams.addAgent'),
        removeAgent: makeProvider('teams.removeAgent'),
        renameAgent: makeProvider('teams.renameAgent'),
        renameTeam: makeProvider('teams.renameTeam'),
        setSessionMode: makeProvider('teams.setSessionMode'),
        updateWorkspace: makeProvider('teams.updateWorkspace'),
        sendMessage: makeProvider('teams.sendMessage'),
        sendMessageToAgent: makeProvider('teams.sendMessageToAgent'),
        stop: makeProvider('teams.stop'),
        ensureSession: makeProvider('teams.ensureSession'),
      },
      uploads: {
        createFile: makeProvider('uploads.createFile'),
      },
      events: {
        stream: makeEmitter('events.stream'),
      },
    },
  },
}));

import { initCoreElectronClientAdapter } from '@process/adapters/electron';
import type { CoreClientContract } from '@process/adapters/coreClient';
import type { CoreEventEnvelope } from '@process/core/shared/CoreEvent';

describe('CoreElectronClientAdapter', () => {
  let eventListener: ((event: CoreEventEnvelope) => void) | null;
  let unsubscribe: ReturnType<typeof vi.fn>;
  let client: CoreClientContract;

  beforeEach(() => {
    vi.clearAllMocks();
    eventListener = null;
    unsubscribe = vi.fn();
    client = {
      sessions: {
        getRuntimeState: vi.fn(async (conversationId: string) => ({ conversationId }) as never),
        listRuntimeStates: vi.fn(async () => [{ conversationId: 'c1' }] as never),
      },
      conversations: {
        get: vi.fn(async (id: string) => ({ id }) as never),
        getAssociate: vi.fn(async (conversationId: string) => [{ id: `${conversationId}-associate` }] as never),
        listByCronJob: vi.fn(async (cronJobId: string) => [{ id: cronJobId }] as never),
        getSlashCommands: vi.fn(async (conversationId: string) => ({
          success: true,
          data: { commands: [{ name: conversationId }] },
        }) as never),
        sendMessage: vi.fn(async (params) => ({ success: true, data: params }) as never),
        stop: vi.fn(async (conversationId: string) => ({ success: true, data: { conversationId } }) as never),
      },
      tasks: {
        getRuntimeOverview: vi.fn(async (conversationId: string) => ({ conversationId }) as never),
        listRuntimeOverviews: vi.fn(async () => [{ conversationId: 't1' }] as never),
      },
      acp: {
        getAvailableAgents: vi.fn(async () => ({ success: true, data: [{ backend: 'codex' }] }) as never),
        refreshCustomAgents: vi.fn(async () => undefined),
        checkAgentHealth: vi.fn(async (backend: string) => ({ success: true, data: { backend } }) as never),
        getSessionSnapshot: vi.fn(async (conversationId: string) => ({ conversationId }) as never),
        setModel: vi.fn(async (conversationId: string, modelId: string) => ({ conversationId, modelId }) as never),
        setMode: vi.fn(async (conversationId: string, mode: string) => ({ conversationId, mode }) as never),
        setConfigOption: vi.fn(
          async (conversationId: string, configId: string, value: string) =>
            ({ conversationId, configId, value }) as never
        ),
      },
      workspaces: {
        getTree: vi.fn(async ({ conversationId }) => [{ conversationId }] as never),
      },
      teams: {
        create: vi.fn(async (params) => ({ success: true, data: { id: 'team-1', ...params } }) as never),
        list: vi.fn(async (userId: string) => [{ id: 'team-1', userId }] as never),
        get: vi.fn(async (id: string) => ({ id }) as never),
        remove: vi.fn(async (id: string) => ({ success: true, data: { id } }) as never),
        addAgent: vi.fn(async (params) => ({ success: true, data: params.agent }) as never),
        removeAgent: vi.fn(async (teamId: string, slotId: string) => ({ success: true, data: { teamId, slotId } }) as never),
        renameAgent: vi.fn(async (params) => ({ success: true, data: params }) as never),
        renameTeam: vi.fn(async (params) => ({ success: true, data: params }) as never),
        setSessionMode: vi.fn(async (params) => ({ success: true, data: params }) as never),
        updateWorkspace: vi.fn(async (params) => ({ success: true, data: params }) as never),
        sendMessage: vi.fn(async (params) => ({ success: true, data: params }) as never),
        sendMessageToAgent: vi.fn(async (params) => ({ success: true, data: params }) as never),
        stop: vi.fn(async (teamId: string) => ({ success: true, data: { teamId } }) as never),
        ensureSession: vi.fn(async (teamId: string) => ({ success: true, data: { teamId } }) as never),
      },
      uploads: {
        createFile: vi.fn(async (params) => ({ success: true, data: { path: `/tmp/${params.fileName}` } }) as never),
      },
      events: {
        subscribe: vi.fn((listener) => {
          eventListener = listener;
          return unsubscribe;
        }),
      },
    };
  });

  it('registers Electron providers over the transport-neutral client', async () => {
    initCoreElectronClientAdapter(client);

    await expect(handlers['sessions.getRuntimeState']({ conversationId: 'c1' } as never)).resolves.toMatchObject({
      conversationId: 'c1',
    });
    await expect(handlers['tasks.getRuntimeOverview']({ conversationId: 't1' } as never)).resolves.toMatchObject({
      conversationId: 't1',
    });
    await expect(handlers['conversations.get']({ id: 'c1' } as never)).resolves.toMatchObject({
      id: 'c1',
    });
    await expect(handlers['conversations.getAssociate']({ conversationId: 'c1' } as never)).resolves.toEqual([
      { id: 'c1-associate' },
    ]);
    await expect(handlers['conversations.listByCronJob']({ cronJobId: 'cron-1' } as never)).resolves.toEqual([
      { id: 'cron-1' },
    ]);
    await expect(handlers['conversations.getSlashCommands']({ conversationId: 'c1' } as never)).resolves.toMatchObject({
      success: true,
      data: { commands: [{ name: 'c1' }] },
    });
    await expect(
      handlers['conversations.sendMessage']({
        conversation_id: 'c1',
        msg_id: 'm1',
        input: 'hello',
      } as never)
    ).resolves.toMatchObject({
      success: true,
      data: { conversation_id: 'c1', msg_id: 'm1', input: 'hello' },
    });
    await expect(handlers['conversations.stop']({ conversationId: 'c1' } as never)).resolves.toMatchObject({
      success: true,
      data: { conversationId: 'c1' },
    });
    await expect(handlers['acp.getSessionSnapshot']({ conversationId: 'a1' } as never)).resolves.toMatchObject({
      conversationId: 'a1',
    });
    await expect(handlers['acp.getAvailableAgents']()).resolves.toMatchObject({
      success: true,
      data: [{ backend: 'codex' }],
    });
    await expect(handlers['acp.refreshCustomAgents']()).resolves.toBeUndefined();
    await expect(handlers['acp.checkAgentHealth']({ backend: 'codex' } as never)).resolves.toMatchObject({
      success: true,
      data: { backend: 'codex' },
    });
    await expect(handlers['acp.setModel']({ conversationId: 'a1', modelId: 'm1' } as never)).resolves.toMatchObject({
      conversationId: 'a1',
      modelId: 'm1',
    });
    await expect(handlers['acp.setMode']({ conversationId: 'a1', mode: 'yolo' } as never)).resolves.toMatchObject({
      conversationId: 'a1',
      mode: 'yolo',
    });
    await expect(
      handlers['acp.setConfigOption']({ conversationId: 'a1', configId: 'reasoning', value: 'high' } as never)
    ).resolves.toMatchObject({
      conversationId: 'a1',
      configId: 'reasoning',
      value: 'high',
    });
    await expect(
      handlers['workspaces.getTree']({
        conversationId: 'w1',
        workspace: '/workspace',
        targetPath: '/workspace',
      } as never)
    ).resolves.toEqual([{ conversationId: 'w1' }]);
    await expect(
      handlers['teams.create']({
        userId: 'user-1',
        name: 'Team',
        workspace: '',
        workspaceMode: 'shared',
        agents: [],
      } as never)
    ).resolves.toMatchObject({ success: true, data: { id: 'team-1' } });
    await expect(handlers['teams.list']({ userId: 'user-1' } as never)).resolves.toEqual([
      { id: 'team-1', userId: 'user-1' },
    ]);
    await expect(handlers['teams.get']({ id: 'team-1' } as never)).resolves.toMatchObject({ id: 'team-1' });
    await expect(handlers['teams.remove']({ id: 'team-1' } as never)).resolves.toMatchObject({ success: true });
    await expect(
      handlers['teams.addAgent']({ teamId: 'team-1', agent: { agentName: 'A' } } as never)
    ).resolves.toMatchObject({ success: true });
    await expect(handlers['teams.removeAgent']({ teamId: 'team-1', slotId: 'slot-1' } as never)).resolves.toMatchObject({
      success: true,
    });
    await expect(
      handlers['teams.renameAgent']({ teamId: 'team-1', slotId: 'slot-1', newName: 'New' } as never)
    ).resolves.toMatchObject({ success: true });
    await expect(handlers['teams.renameTeam']({ id: 'team-1', name: 'New Team' } as never)).resolves.toMatchObject({
      success: true,
    });
    await expect(handlers['teams.setSessionMode']({ teamId: 'team-1', sessionMode: 'yolo' } as never)).resolves.toMatchObject({
      success: true,
    });
    await expect(
      handlers['teams.updateWorkspace']({ teamId: 'team-1', workspace: '/workspace' } as never)
    ).resolves.toMatchObject({ success: true });
    await expect(
      handlers['teams.sendMessage']({ teamId: 'team-1', content: 'hello', files: ['a.txt'] } as never)
    ).resolves.toMatchObject({
      success: true,
      data: { teamId: 'team-1', content: 'hello', files: ['a.txt'] },
    });
    await expect(
      handlers['teams.sendMessageToAgent']({
        teamId: 'team-1',
        slotId: 'slot-1',
        content: 'hello',
      } as never)
    ).resolves.toMatchObject({
      success: true,
      data: { teamId: 'team-1', slotId: 'slot-1', content: 'hello' },
    });
    await expect(handlers['teams.stop']({ teamId: 'team-1' } as never)).resolves.toMatchObject({
      success: true,
      data: { teamId: 'team-1' },
    });
    await expect(handlers['teams.ensureSession']({ teamId: 'team-1' } as never)).resolves.toMatchObject({
      success: true,
      data: { teamId: 'team-1' },
    });
    await expect(
      handlers['uploads.createFile']({ fileName: 'file.txt', conversationId: 'c1' } as never)
    ).resolves.toEqual({
      success: true,
      data: { path: '/tmp/file.txt' },
    });
  });

  it('forwards core events to the Electron core event stream', () => {
    const dispose = initCoreElectronClientAdapter(client);
    const event = {
      scope: 'session',
      type: 'session.created',
      timestamp: 1,
      data: { conversationId: 'c1' },
    } as CoreEventEnvelope;

    eventListener?.(event);
    dispose();

    expect(emitters['events.stream']).toHaveBeenCalledWith(event);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
