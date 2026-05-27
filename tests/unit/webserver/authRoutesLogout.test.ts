import type { RequestHandler } from 'express';
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExtractFromRequest, mockLogout } = vi.hoisted(() => ({
  mockExtractFromRequest: vi.fn<(req: express.Request) => string | null>(),
  mockLogout: vi.fn<(token: string | null) => Promise<void>>(),
}));

vi.mock('@process/webserver/auth/middleware/AuthMiddleware', () => ({
  AuthMiddleware: {
    validateLoginInput: ((_req, _res, next) => next()) as RequestHandler,
    authenticateToken: ((_req, _res, next) => next()) as RequestHandler,
  },
}));

vi.mock('@process/webserver/auth/middleware/TokenMiddleware', () => ({
  TokenUtils: {
    extractFromRequest: mockExtractFromRequest,
  },
}));

vi.mock('@process/core/auth', () => ({
  CoreAuthService: {
    logout: mockLogout,
    login: vi.fn(),
    getStatus: vi.fn(),
    changePassword: vi.fn(),
    refreshToken: vi.fn(),
    getWebSocketToken: vi.fn(),
    loginWithQrToken: vi.fn(),
  },
}));

vi.mock('@process/webserver/config/constants', () => ({
  AUTH_CONFIG: {
    COOKIE: {
      NAME: 'auth-token',
    },
    TOKEN: {
      COOKIE_MAX_AGE: 0,
    },
  },
  getCookieOptions: vi.fn(() => ({ httpOnly: true })),
}));

vi.mock('@process/webserver/auth/sessionContext', () => ({
  AUTH_DEVICE_COOKIE_NAME: 'loksystem-device',
  resolveRequestAuthSessionContext: vi.fn(),
}));

vi.mock('@process/webserver/middleware/errorHandler', () => ({
  createAppError: vi.fn(),
}));

vi.mock('@process/webserver/middleware/security', () => ({
  authRateLimiter: ((_req, _res, next) => next()) as RequestHandler,
  authenticatedActionLimiter: ((_req, _res, next) => next()) as RequestHandler,
  apiRateLimiter: ((_req, _res, next) => next()) as RequestHandler,
}));

vi.mock('@process/bridge/webuiQR', () => ({
  verifyQRTokenDirect: vi.fn(),
}));

function getLogoutHandler(app: express.Express): RequestHandler {
  const layer = app.router.stack.find(
    (entry: { route?: { path?: string; stack?: Array<{ handle: RequestHandler }> } }) => entry.route?.path === '/logout'
  );

  return layer?.route?.stack?.at(-1)?.handle as RequestHandler;
}

function createResponseMock() {
  return {
    clearCookie: vi.fn(),
    json: vi.fn(),
  };
}

describe('registerAuthRoutes logout endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogout.mockResolvedValue(undefined);
    mockExtractFromRequest.mockReturnValue('session-token');
  });

  it('revokes the session and clears both session cookies', async () => {
    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getLogoutHandler(app);
    const req = {} as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect(mockLogout).toHaveBeenCalledWith('session-token');
    expect((res as unknown as { clearCookie: ReturnType<typeof vi.fn> }).clearCookie).toHaveBeenNthCalledWith(
      1,
      'auth-token'
    );
    expect((res as unknown as { clearCookie: ReturnType<typeof vi.fn> }).clearCookie).toHaveBeenNthCalledWith(
      2,
      'loksystem-device'
    );
    expect((res as unknown as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith({
      success: true,
      message: 'Logged out successfully',
    });
  });
});
