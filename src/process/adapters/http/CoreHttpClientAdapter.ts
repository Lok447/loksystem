/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Express, type Request, type Response } from 'express';
import type { CoreClientContract } from '@process/adapters/coreClient';
import { sendCoreHttpErrorResponse } from './CoreHttpResponse';

export type CoreHttpClientAdapterOptions = {
  client: CoreClientContract;
};

function getStringQuery(req: Request, key: string): string {
  const value = req.query[key];
  return typeof value === 'string' ? value : '';
}

function getStringParam(req: Request, key: string): string {
  const value = req.params[key];
  return typeof value === 'string' ? value : '';
}

function sendSuccess<T>(res: Response, data: T): void {
  res.json({
    success: true,
    data,
  });
}

export function registerCoreHttpClientAdapter(app: Express, options: CoreHttpClientAdapterOptions): void {
  const { client } = options;

  app.get('/api/core/sessions/runtime/:conversationId', async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.sessions.getRuntimeState(getStringParam(req, 'conversationId')));
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.get('/api/core/sessions/runtime', async (_req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.sessions.listRuntimeStates());
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.get('/api/core/conversations/cron/:cronJobId', async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.conversations.listByCronJob(getStringParam(req, 'cronJobId')));
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.get('/api/core/conversations/:id', async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.conversations.get(getStringParam(req, 'id')));
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.get('/api/core/conversations/:id/associate', async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.conversations.getAssociate(getStringParam(req, 'id')));
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.get('/api/core/conversations/:id/slash-commands', async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.conversations.getSlashCommands(getStringParam(req, 'id')));
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.post('/api/core/conversations/:id/messages', async (req: Request, res: Response) => {
    try {
      sendSuccess(
        res,
        await client.conversations.sendMessage({
          ...(req.body || {}),
          conversation_id: getStringParam(req, 'id'),
        })
      );
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.post('/api/core/conversations/:id/stop', async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.conversations.stop(getStringParam(req, 'id')));
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.get('/api/core/tasks/runtime/:conversationId', async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.tasks.getRuntimeOverview(getStringParam(req, 'conversationId')));
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.get('/api/core/tasks/runtime', async (_req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.tasks.listRuntimeOverviews());
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.get('/api/core/acp/sessions/:conversationId', async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.acp.getSessionSnapshot(getStringParam(req, 'conversationId')));
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.get('/api/core/acp/agents', async (_req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.acp.getAvailableAgents());
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.post('/api/core/acp/agents/refresh', async (_req: Request, res: Response) => {
    try {
      await client.acp.refreshCustomAgents();
      sendSuccess(res, undefined);
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.get('/api/core/acp/agents/:backend/health', async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.acp.checkAgentHealth(getStringParam(req, 'backend')));
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.post('/api/core/acp/sessions/:conversationId/model', async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.acp.setModel(getStringParam(req, 'conversationId'), String(req.body?.modelId ?? '')));
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.post('/api/core/acp/sessions/:conversationId/mode', async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.acp.setMode(getStringParam(req, 'conversationId'), String(req.body?.mode ?? '')));
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.post('/api/core/acp/sessions/:conversationId/config', async (req: Request, res: Response) => {
    try {
      sendSuccess(
        res,
        await client.acp.setConfigOption(
          getStringParam(req, 'conversationId'),
          String(req.body?.configId ?? ''),
          String(req.body?.value ?? '')
        )
      );
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.get('/api/core/workspaces/tree', async (req: Request, res: Response) => {
    try {
      sendSuccess(
        res,
        await client.workspaces.getTree({
          conversationId: getStringQuery(req, 'conversationId'),
          workspace: getStringQuery(req, 'workspace'),
          targetPath: getStringQuery(req, 'targetPath'),
          search: getStringQuery(req, 'search') || undefined,
        })
      );
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.post('/api/core/uploads/files', async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.uploads.createFile(req.body));
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.post('/api/core/teams', async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.teams.create(req.body));
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.get('/api/core/teams', async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.teams.list(getStringQuery(req, 'userId')));
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.get('/api/core/teams/:teamId', async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.teams.get(getStringParam(req, 'teamId')));
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.post('/api/core/teams/:teamId/delete', async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.teams.remove(getStringParam(req, 'teamId')));
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.post('/api/core/teams/:teamId/agents', async (req: Request, res: Response) => {
    try {
      sendSuccess(
        res,
        await client.teams.addAgent({
          ...(req.body || {}),
          teamId: getStringParam(req, 'teamId'),
        })
      );
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.post('/api/core/teams/:teamId/agents/:slotId/delete', async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.teams.removeAgent(getStringParam(req, 'teamId'), getStringParam(req, 'slotId')));
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.post('/api/core/teams/:teamId/agents/:slotId/rename', async (req: Request, res: Response) => {
    try {
      sendSuccess(
        res,
        await client.teams.renameAgent({
          ...(req.body || {}),
          teamId: getStringParam(req, 'teamId'),
          slotId: getStringParam(req, 'slotId'),
        })
      );
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.post('/api/core/teams/:teamId/rename', async (req: Request, res: Response) => {
    try {
      sendSuccess(
        res,
        await client.teams.renameTeam({
          ...(req.body || {}),
          id: getStringParam(req, 'teamId'),
        })
      );
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.post('/api/core/teams/:teamId/session-mode', async (req: Request, res: Response) => {
    try {
      sendSuccess(
        res,
        await client.teams.setSessionMode({
          ...(req.body || {}),
          teamId: getStringParam(req, 'teamId'),
        })
      );
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.post('/api/core/teams/:teamId/workspace', async (req: Request, res: Response) => {
    try {
      sendSuccess(
        res,
        await client.teams.updateWorkspace({
          ...(req.body || {}),
          teamId: getStringParam(req, 'teamId'),
        })
      );
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.post('/api/core/teams/:teamId/messages', async (req: Request, res: Response) => {
    try {
      sendSuccess(
        res,
        await client.teams.sendMessage({
          ...(req.body || {}),
          teamId: getStringParam(req, 'teamId'),
        })
      );
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.post('/api/core/teams/:teamId/agents/:slotId/messages', async (req: Request, res: Response) => {
    try {
      sendSuccess(
        res,
        await client.teams.sendMessageToAgent({
          ...(req.body || {}),
          teamId: getStringParam(req, 'teamId'),
          slotId: getStringParam(req, 'slotId'),
        })
      );
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.post('/api/core/teams/:teamId/stop', async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.teams.stop(getStringParam(req, 'teamId')));
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });

  app.post('/api/core/teams/:teamId/session', async (req: Request, res: Response) => {
    try {
      sendSuccess(res, await client.teams.ensureSession(getStringParam(req, 'teamId')));
    } catch (error) {
      sendCoreHttpErrorResponse(res, error);
    }
  });
}
