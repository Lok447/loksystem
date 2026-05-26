import { describe, expect, it, vi } from 'vitest';
import type { Express, Request, Response } from 'express';
import { registerCoreHttpClientAdapter } from '@process/adapters/http';
import type { CoreClientContract } from '@process/adapters/coreClient';

type RouteHandler = (req: Request, res: Response) => Promise<void> | void;

function makeApp() {
  const routes = {
    get: new Map<string, RouteHandler>(),
    post: new Map<string, RouteHandler>(),
  };
  const app = {
    get: vi.fn((path: string, handler: RouteHandler) => {
      routes.get.set(path, handler);
    }),
    post: vi.fn((path: string, handler: RouteHandler) => {
      routes.post.set(path, handler);
    }),
  } as unknown as Express;
  return { app, routes };
}

function makeResponse() {
  return {
    statusCode: 200,
    status: vi.fn(function status(this: { statusCode: number }, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(),
  } as unknown as Response & { statusCode: number; json: ReturnType<typeof vi.fn> };
}

describe('registerCoreHttpClientAdapter', () => {
  function makeClient(): CoreClientContract {
    return {
      sessions: {
        getRuntimeState: vi.fn(async (conversationId: string) => ({ conversationId }) as never),
        listRuntimeStates: vi.fn(async () => [{ conversationId: 'session-1' }] as never),
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
        listRuntimeOverviews: vi.fn(async () => [{ conversationId: 'task-1' }] as never),
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
        subscribe: vi.fn(() => vi.fn()),
      },
    };
  }

  it('registers core HTTP routes over the transport-neutral client', async () => {
    const { app, routes } = makeApp();
    const client = makeClient();
    registerCoreHttpClientAdapter(app, { client });

    const res = makeResponse();
    await routes.get.get('/api/core/sessions/runtime/:conversationId')?.(
      { params: { conversationId: 'c1' }, query: {} } as unknown as Request,
      res
    );

    expect(client.sessions.getRuntimeState).toHaveBeenCalledWith('c1');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { conversationId: 'c1' },
    });
  });

  it('maps workspace query parameters into the core workspace contract', async () => {
    const { app, routes } = makeApp();
    const client = makeClient();
    registerCoreHttpClientAdapter(app, { client });

    const res = makeResponse();
    await routes.get.get('/api/core/workspaces/tree')?.(
      {
        params: {},
        query: {
          conversationId: 'workspace-1',
          workspace: '/workspace',
          targetPath: '/workspace/src',
          search: 'core',
        },
      } as unknown as Request,
      res
    );

    expect(client.workspaces.getTree).toHaveBeenCalledWith({
      conversationId: 'workspace-1',
      workspace: '/workspace',
      targetPath: '/workspace/src',
      search: 'core',
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [{ conversationId: 'workspace-1' }],
    });
  });

  it('delegates conversation read HTTP routes to the core client', async () => {
    const { app, routes } = makeApp();
    const client = makeClient();
    registerCoreHttpClientAdapter(app, { client });

    await routes.get.get('/api/core/conversations/:id')?.(
      { params: { id: 'c1' }, query: {} } as unknown as Request,
      makeResponse()
    );
    await routes.get.get('/api/core/conversations/:id/associate')?.(
      { params: { id: 'c1' }, query: {} } as unknown as Request,
      makeResponse()
    );
    await routes.get.get('/api/core/conversations/cron/:cronJobId')?.(
      { params: { cronJobId: 'cron-1' }, query: {} } as unknown as Request,
      makeResponse()
    );
    await routes.get.get('/api/core/conversations/:id/slash-commands')?.(
      { params: { id: 'c1' }, query: {} } as unknown as Request,
      makeResponse()
    );
    const sendRes = makeResponse();
    await routes.post.get('/api/core/conversations/:id/messages')?.(
      {
        params: { id: 'c1' },
        body: { msg_id: 'm1', input: 'hello', conversation_id: 'body-id' },
      } as unknown as Request,
      sendRes
    );
    const stopRes = makeResponse();
    await routes.post.get('/api/core/conversations/:id/stop')?.(
      { params: { id: 'c1' }, body: {} } as unknown as Request,
      stopRes
    );

    expect(client.conversations.get).toHaveBeenCalledWith('c1');
    expect(client.conversations.getAssociate).toHaveBeenCalledWith('c1');
    expect(client.conversations.listByCronJob).toHaveBeenCalledWith('cron-1');
    expect(client.conversations.getSlashCommands).toHaveBeenCalledWith('c1');
    expect(client.conversations.sendMessage).toHaveBeenCalledWith({
      conversation_id: 'c1',
      msg_id: 'm1',
      input: 'hello',
    });
    expect(client.conversations.stop).toHaveBeenCalledWith('c1');
    expect(sendRes.json).toHaveBeenCalledWith({
      success: true,
      data: { success: true, data: { conversation_id: 'c1', msg_id: 'm1', input: 'hello' } },
    });
    expect(stopRes.json).toHaveBeenCalledWith({
      success: true,
      data: { success: true, data: { conversationId: 'c1' } },
    });
  });

  it('delegates ACP write HTTP routes to the core client', async () => {
    const { app, routes } = makeApp();
    const client = makeClient();
    registerCoreHttpClientAdapter(app, { client });

    const modelRes = makeResponse();
    await routes.post.get('/api/core/acp/sessions/:conversationId/model')?.(
      {
        params: { conversationId: 'acp-1' },
        body: { modelId: 'model-1' },
      } as unknown as Request,
      modelRes
    );

    const modeRes = makeResponse();
    await routes.post.get('/api/core/acp/sessions/:conversationId/mode')?.(
      {
        params: { conversationId: 'acp-1' },
        body: { mode: 'yolo' },
      } as unknown as Request,
      modeRes
    );

    const configRes = makeResponse();
    await routes.post.get('/api/core/acp/sessions/:conversationId/config')?.(
      {
        params: { conversationId: 'acp-1' },
        body: { configId: 'reasoning', value: 'high' },
      } as unknown as Request,
      configRes
    );

    expect(client.acp.setModel).toHaveBeenCalledWith('acp-1', 'model-1');
    expect(client.acp.setMode).toHaveBeenCalledWith('acp-1', 'yolo');
    expect(client.acp.setConfigOption).toHaveBeenCalledWith('acp-1', 'reasoning', 'high');
  });

  it('delegates ACP discovery and health HTTP routes to the core client', async () => {
    const { app, routes } = makeApp();
    const client = makeClient();
    registerCoreHttpClientAdapter(app, { client });

    const agentsRes = makeResponse();
    await routes.get.get('/api/core/acp/agents')?.({ params: {}, query: {} } as unknown as Request, agentsRes);

    const refreshRes = makeResponse();
    await routes.post.get('/api/core/acp/agents/refresh')?.({ params: {}, query: {} } as unknown as Request, refreshRes);

    const healthRes = makeResponse();
    await routes.get.get('/api/core/acp/agents/:backend/health')?.(
      { params: { backend: 'codex' }, query: {} } as unknown as Request,
      healthRes
    );

    expect(client.acp.getAvailableAgents).toHaveBeenCalledOnce();
    expect(client.acp.refreshCustomAgents).toHaveBeenCalledOnce();
    expect(client.acp.checkAgentHealth).toHaveBeenCalledWith('codex');
    expect(agentsRes.json).toHaveBeenCalledWith({
      success: true,
      data: { success: true, data: [{ backend: 'codex' }] },
    });
  });

  it('delegates team runtime HTTP routes to the core client', async () => {
    const { app, routes } = makeApp();
    const client = makeClient();
    registerCoreHttpClientAdapter(app, { client });

    await routes.post.get('/api/core/teams')?.(
      {
        params: {},
        body: { userId: 'user-1', name: 'Team', workspace: '', workspaceMode: 'shared', agents: [] },
      } as unknown as Request,
      makeResponse()
    );
    await routes.get.get('/api/core/teams')?.(
      { params: {}, query: { userId: 'user-1' } } as unknown as Request,
      makeResponse()
    );
    await routes.get.get('/api/core/teams/:teamId')?.(
      { params: { teamId: 'team-1' }, query: {} } as unknown as Request,
      makeResponse()
    );
    await routes.post.get('/api/core/teams/:teamId/delete')?.(
      { params: { teamId: 'team-1' }, body: {} } as unknown as Request,
      makeResponse()
    );
    await routes.post.get('/api/core/teams/:teamId/agents')?.(
      {
        params: { teamId: 'team-1' },
        body: { agent: { agentName: 'A' }, teamId: 'body-team' },
      } as unknown as Request,
      makeResponse()
    );
    await routes.post.get('/api/core/teams/:teamId/agents/:slotId/delete')?.(
      { params: { teamId: 'team-1', slotId: 'slot-1' }, body: {} } as unknown as Request,
      makeResponse()
    );
    await routes.post.get('/api/core/teams/:teamId/agents/:slotId/rename')?.(
      {
        params: { teamId: 'team-1', slotId: 'slot-1' },
        body: { teamId: 'body-team', slotId: 'body-slot', newName: 'New' },
      } as unknown as Request,
      makeResponse()
    );
    await routes.post.get('/api/core/teams/:teamId/rename')?.(
      { params: { teamId: 'team-1' }, body: { id: 'body-team', name: 'New Team' } } as unknown as Request,
      makeResponse()
    );
    await routes.post.get('/api/core/teams/:teamId/session-mode')?.(
      { params: { teamId: 'team-1' }, body: { sessionMode: 'yolo' } } as unknown as Request,
      makeResponse()
    );
    await routes.post.get('/api/core/teams/:teamId/workspace')?.(
      { params: { teamId: 'team-1' }, body: { workspace: '/workspace' } } as unknown as Request,
      makeResponse()
    );

    const sendRes = makeResponse();
    await routes.post.get('/api/core/teams/:teamId/messages')?.(
      {
        params: { teamId: 'team-1' },
        body: { content: 'hello', files: ['a.txt'], teamId: 'body-team' },
      } as unknown as Request,
      sendRes
    );

    const agentRes = makeResponse();
    await routes.post.get('/api/core/teams/:teamId/agents/:slotId/messages')?.(
      {
        params: { teamId: 'team-1', slotId: 'slot-1' },
        body: { content: 'hello', teamId: 'body-team', slotId: 'body-slot' },
      } as unknown as Request,
      agentRes
    );

    const stopRes = makeResponse();
    await routes.post.get('/api/core/teams/:teamId/stop')?.(
      { params: { teamId: 'team-1' }, body: {} } as unknown as Request,
      stopRes
    );

    const sessionRes = makeResponse();
    await routes.post.get('/api/core/teams/:teamId/session')?.(
      { params: { teamId: 'team-1' }, body: {} } as unknown as Request,
      sessionRes
    );

    expect(client.teams.create).toHaveBeenCalledWith({
      userId: 'user-1',
      name: 'Team',
      workspace: '',
      workspaceMode: 'shared',
      agents: [],
    });
    expect(client.teams.list).toHaveBeenCalledWith('user-1');
    expect(client.teams.get).toHaveBeenCalledWith('team-1');
    expect(client.teams.remove).toHaveBeenCalledWith('team-1');
    expect(client.teams.addAgent).toHaveBeenCalledWith({ teamId: 'team-1', agent: { agentName: 'A' } });
    expect(client.teams.removeAgent).toHaveBeenCalledWith('team-1', 'slot-1');
    expect(client.teams.renameAgent).toHaveBeenCalledWith({ teamId: 'team-1', slotId: 'slot-1', newName: 'New' });
    expect(client.teams.renameTeam).toHaveBeenCalledWith({ id: 'team-1', name: 'New Team' });
    expect(client.teams.setSessionMode).toHaveBeenCalledWith({ teamId: 'team-1', sessionMode: 'yolo' });
    expect(client.teams.updateWorkspace).toHaveBeenCalledWith({ teamId: 'team-1', workspace: '/workspace' });
    expect(client.teams.sendMessage).toHaveBeenCalledWith({
      teamId: 'team-1',
      content: 'hello',
      files: ['a.txt'],
    });
    expect(client.teams.sendMessageToAgent).toHaveBeenCalledWith({
      teamId: 'team-1',
      slotId: 'slot-1',
      content: 'hello',
    });
    expect(client.teams.stop).toHaveBeenCalledWith('team-1');
    expect(client.teams.ensureSession).toHaveBeenCalledWith('team-1');
    expect(sendRes.json).toHaveBeenCalledWith({
      success: true,
      data: { success: true, data: { teamId: 'team-1', content: 'hello', files: ['a.txt'] } },
    });
  });

  it('delegates upload file creation HTTP route to the core client', async () => {
    const { app, routes } = makeApp();
    const client = makeClient();
    registerCoreHttpClientAdapter(app, { client });

    const res = makeResponse();
    await routes.post.get('/api/core/uploads/files')?.(
      { params: { teamId: 'uploads' }, body: { fileName: 'file.txt', conversationId: 'c1' } } as unknown as Request,
      res
    );

    expect(client.uploads.createFile).toHaveBeenCalledWith({ fileName: 'file.txt', conversationId: 'c1' });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { success: true, data: { path: '/tmp/file.txt' } },
    });
  });
});
