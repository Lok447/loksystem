import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AuthService refreshToken', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('refreshes an expired but otherwise valid token', async () => {
    vi.doMock('@process/webserver/auth/repository/UserRepository', () => ({
      UserRepository: {
        __sessions: new Map<string, any>(),
        getPrimaryWebUIUser: vi.fn(async () => ({
          id: 'system-user',
          username: 'admin',
          password_hash: 'hash',
          jwt_secret: 'db-secret',
          auth_version: 2,
          auth_migrated_at: 0,
          tokens_invalid_before: null,
          created_at: 0,
          updated_at: 0,
          last_login: null,
        })),
        createAuthSession: vi.fn(async function (session) {
          this.__sessions.set(session.token_id, session);
          return session;
        }),
        findAuthSessionByTokenId: vi.fn(async function (tokenId) {
          if (this.__sessions.has(tokenId)) {
            return this.__sessions.get(tokenId);
          }
          return {
            id: 'session-1',
            user_id: 'user-1',
            token_id: tokenId,
            session_type: 'web',
            status: 'active',
            issued_at: 0,
            expires_at: 0,
            last_seen_at: 0,
          };
        }),
        findById: vi.fn(async () => ({
          id: 'user-1',
          username: 'alice',
          password_hash: 'hash',
          jwt_secret: 'db-secret',
          auth_version: 2,
          auth_migrated_at: 0,
          tokens_invalid_before: null,
          created_at: 0,
          updated_at: 0,
          last_login: null,
        })),
        updateAuthSession: vi.fn(async function (sessionId, updates) {
          for (const [key, value] of this.__sessions.entries()) {
            if (value.id === sessionId) {
              this.__sessions.set(key, { ...value, ...updates });
            }
          }
        }),
        updateAuthState: vi.fn(async () => {}),
        updateJwtSecret: vi.fn(),
      },
    }));

    const { AuthService } = await import('@process/webserver/auth/service/AuthService');
    const expiredToken = jwt.sign(
      {
        userId: 'user-1',
        username: 'alice',
        tokenId: 'expired-token-id',
        sessionId: 'session-1',
        authVersion: 2,
      },
      'db-secret',
      {
        audience: 'loksystem-webui',
        expiresIn: -10,
        issuer: 'loksystem',
      }
    );

    const refreshedToken = await AuthService.refreshToken(expiredToken);

    expect(refreshedToken).toEqual(expect.any(String));
    expect(refreshedToken).not.toBe(expiredToken);
    await expect(AuthService.verifyToken(refreshedToken!)).resolves.toMatchObject({
      userId: 'user-1',
      username: 'alice',
    });
  });

  it('rotates to a distinct token before blacklisting the previous session', async () => {
    vi.doMock('@process/webserver/auth/repository/UserRepository', () => ({
      UserRepository: {
        __sessions: new Map<string, any>(),
        getPrimaryWebUIUser: vi.fn(async () => ({
          id: 'system-user',
          username: 'admin',
          password_hash: 'hash',
          jwt_secret: 'db-secret',
          auth_version: 2,
          auth_migrated_at: 0,
          tokens_invalid_before: null,
          created_at: 0,
          updated_at: 0,
          last_login: null,
        })),
        createAuthSession: vi.fn(async function (session) {
          this.__sessions.set(session.token_id, session);
          return session;
        }),
        findAuthSessionByTokenId: vi.fn(async function (tokenId) {
          if (this.__sessions.has(tokenId)) {
            return this.__sessions.get(tokenId);
          }
          return {
            id: 'session-1',
            user_id: 'user-1',
            token_id: tokenId,
            session_type: 'web',
            status: 'active',
            issued_at: 0,
            expires_at: Date.now() + 1000,
            last_seen_at: 0,
          };
        }),
        findById: vi.fn(async () => ({
          id: 'user-1',
          username: 'alice',
          password_hash: 'hash',
          jwt_secret: 'db-secret',
          auth_version: 2,
          auth_migrated_at: 0,
          tokens_invalid_before: null,
          created_at: 0,
          updated_at: 0,
          last_login: null,
        })),
        updateAuthSession: vi.fn(async function (sessionId, updates) {
          for (const [key, value] of this.__sessions.entries()) {
            if (value.id === sessionId) {
              this.__sessions.set(key, { ...value, ...updates });
            }
          }
        }),
        updateAuthState: vi.fn(async () => {}),
        updateJwtSecret: vi.fn(),
      },
    }));

    const { AuthService } = await import('@process/webserver/auth/service/AuthService');

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-18T19:10:00.000Z'));

    const originalToken = await AuthService.generateToken({
      id: 'user-1',
      username: 'alice',
    });

    const refreshedToken = await AuthService.refreshToken(originalToken);

    expect(refreshedToken).toEqual(expect.any(String));
    expect(refreshedToken).not.toBe(originalToken);
    await expect(AuthService.verifyToken(originalToken)).resolves.toBeNull();
    await expect(AuthService.verifyToken(refreshedToken!)).resolves.toMatchObject({
      userId: 'user-1',
      username: 'alice',
    });

    vi.useRealTimers();
  });
});
