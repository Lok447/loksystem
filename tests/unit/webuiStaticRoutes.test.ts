import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

const tempDirs: string[] = [];

function createPackagedRendererRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loksystem-static-routes-'));
  const rendererDir = path.join(root, 'out', 'renderer');
  fs.mkdirSync(rendererDir, { recursive: true });
  fs.writeFileSync(path.join(rendererDir, 'index.html'), '<!doctype html><html><body>ok</body></html>', 'utf8');
  tempDirs.push(root);
  return root;
}

function getRegisteredGetRoutePaths(app: express.Express): Array<string | RegExp> {
  return app.router.stack
    .filter(
      (layer: { route?: { path: string | RegExp; methods?: Record<string, boolean> } }) => layer.route?.methods?.get
    )
    .map((layer: { route?: { path: string | RegExp } }) => layer.route?.path)
    .filter((value): value is string | RegExp => value !== undefined);
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();

  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('registerStaticRoutes', () => {
  it('does not register a dedicated /favicon.ico route in production static mode', async () => {
    const packagedRoot = createPackagedRendererRoot();

    vi.doMock('electron', () => ({
      app: {
        setName: vi.fn(),
        getAppPath: () => packagedRoot,
      },
    }));
    vi.doMock('@process/webserver/auth/middleware/TokenMiddleware', () => ({
      TokenMiddleware: {
        extractToken: () => null,
        isTokenValid: () => true,
      },
    }));
    vi.doMock('@process/webserver/middleware/security', () => ({
      createRateLimiter: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
    }));

    const { registerStaticRoutes } = await import('@process/webserver/routes/staticRoutes');
    const app = express();

    registerStaticRoutes(app);

    expect(getRegisteredGetRoutePaths(app)).not.toContain('/favicon.ico');
  });

  it('prefers the Vite dev proxy over stale built assets when electron-vite dev is active', async () => {
    const packagedRoot = createPackagedRendererRoot();
    const previousNodeEnv = process.env.NODE_ENV;
    const previousRendererUrl = process.env.ELECTRON_RENDERER_URL;
    try {
      process.env.NODE_ENV = 'development';
      process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173';

      vi.doMock('electron', () => ({
        app: {
          setName: vi.fn(),
          getAppPath: () => packagedRoot,
        },
      }));
      vi.doMock('@process/webserver/auth/middleware/TokenMiddleware', () => ({
        TokenMiddleware: {
          extractToken: () => null,
          isTokenValid: () => true,
        },
      }));
      vi.doMock('@process/webserver/middleware/security', () => ({
        createRateLimiter: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
      }));

      const { registerStaticRoutes } = await import('@process/webserver/routes/staticRoutes');
      const app = express();

      registerStaticRoutes(app);

      expect(getRegisteredGetRoutePaths(app)).toEqual([]);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      if (previousRendererUrl === undefined) {
        delete process.env.ELECTRON_RENDERER_URL;
      } else {
        process.env.ELECTRON_RENDERER_URL = previousRendererUrl;
      }
    }
  });
});
