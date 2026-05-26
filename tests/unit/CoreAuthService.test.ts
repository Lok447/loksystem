/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockBlacklistToken,
  mockConstantTimeVerify,
  mockConstantTimeVerifyMissingUser,
  mockCountUsers,
  mockEmit,
  mockFindById,
  mockFindByUsername,
  mockGenerateToken,
  mockHashPassword,
  mockHasUsers,
  mockInvalidateAllTokens,
  mockRefreshToken,
  mockUpdateLastLogin,
  mockUpdatePassword,
  mockValidatePasswordStrength,
  mockVerifyPassword,
  mockVerifyQrTokenDirect,
  mockVerifyToken,
} = vi.hoisted(() => ({
  mockBlacklistToken: vi.fn(),
  mockConstantTimeVerify: vi.fn(),
  mockConstantTimeVerifyMissingUser: vi.fn(),
  mockCountUsers: vi.fn(),
  mockEmit: vi.fn(),
  mockFindById: vi.fn(),
  mockFindByUsername: vi.fn(),
  mockGenerateToken: vi.fn(),
  mockHashPassword: vi.fn(),
  mockHasUsers: vi.fn(),
  mockInvalidateAllTokens: vi.fn(),
  mockRefreshToken: vi.fn(),
  mockUpdateLastLogin: vi.fn(),
  mockUpdatePassword: vi.fn(),
  mockValidatePasswordStrength: vi.fn(),
  mockVerifyPassword: vi.fn(),
  mockVerifyQrTokenDirect: vi.fn(),
  mockVerifyToken: vi.fn(),
}));

vi.mock('@process/webserver/auth/repository/UserRepository', () => ({
  UserRepository: {
    countUsers: mockCountUsers,
    findById: mockFindById,
    findByUsername: mockFindByUsername,
    hasUsers: mockHasUsers,
    updateLastLogin: mockUpdateLastLogin,
    updatePassword: mockUpdatePassword,
  },
}));

vi.mock('@process/webserver/auth/service/AuthService', () => ({
  AuthService: {
    blacklistToken: mockBlacklistToken,
    constantTimeVerify: mockConstantTimeVerify,
    constantTimeVerifyMissingUser: mockConstantTimeVerifyMissingUser,
    generateToken: mockGenerateToken,
    hashPassword: mockHashPassword,
    invalidateAllTokens: mockInvalidateAllTokens,
    refreshToken: mockRefreshToken,
    validatePasswordStrength: mockValidatePasswordStrength,
    verifyPassword: mockVerifyPassword,
    verifyToken: mockVerifyToken,
  },
}));

vi.mock('@process/bridge/webuiQR', () => ({
  verifyQRTokenDirect: mockVerifyQrTokenDirect,
}));

vi.mock('@process/core/shared/CoreEventBus', () => ({
  coreEventBus: {
    emit: mockEmit,
  },
}));

vi.mock('@process/webserver/config/constants', () => ({
  AUTH_CONFIG: {
    TOKEN: {
      COOKIE_MAX_AGE: 3600000,
    },
  },
}));

import { CoreAuthService } from '@process/core/auth';

describe('CoreAuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCountUsers.mockResolvedValue(1);
    mockHasUsers.mockResolvedValue(true);
    mockValidatePasswordStrength.mockReturnValue({ isValid: true, errors: [] });
  });

  it('uses the constant-time missing-user path and throws invalid credentials', async () => {
    mockFindByUsername.mockResolvedValue(null);
    mockConstantTimeVerifyMissingUser.mockResolvedValue(false);

    await expect(CoreAuthService.login('missing', 'bad-password')).rejects.toMatchObject({
      statusCode: 401,
      code: 'invalid_credentials',
    });
    expect(mockConstantTimeVerifyMissingUser).toHaveBeenCalledOnce();
    expect(mockGenerateToken).not.toHaveBeenCalled();
  });

  it('logs in a valid user and emits a core auth event', async () => {
    const user = {
      id: 'user-1',
      username: 'lok',
      password_hash: 'hash',
    };
    mockFindByUsername.mockResolvedValue(user);
    mockConstantTimeVerify.mockResolvedValue(true);
    mockGenerateToken.mockResolvedValue('session-token');

    await expect(CoreAuthService.login('lok', 'correct-password')).resolves.toEqual({
      token: 'session-token',
      user: {
        id: 'user-1',
        username: 'lok',
      },
    });
    expect(mockUpdateLastLogin).toHaveBeenCalledWith('user-1');
    expect(mockEmit).toHaveBeenCalledWith('auth', 'auth.session.updated', {
      action: 'login',
      userId: 'user-1',
      username: 'lok',
    });
  });

  it('rejects weak password changes with validation details', async () => {
    mockValidatePasswordStrength.mockReturnValue({
      isValid: false,
      errors: ['Use at least 8 characters'],
    });

    await expect(
      CoreAuthService.changePassword({
        userId: 'user-1',
        currentPassword: 'old',
        newPassword: 'short',
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'weak_password',
      details: ['Use at least 8 characters'],
    });
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('changes a valid password, invalidates tokens, and emits an auth event', async () => {
    mockFindById.mockResolvedValue({
      id: 'user-1',
      username: 'lok',
      password_hash: 'old-hash',
    });
    mockVerifyPassword.mockResolvedValue(true);
    mockHashPassword.mockResolvedValue('new-hash');
    mockUpdatePassword.mockResolvedValue(undefined);
    mockInvalidateAllTokens.mockResolvedValue(undefined);

    await CoreAuthService.changePassword({
      userId: 'user-1',
      currentPassword: 'old-password',
      newPassword: 'New-password-123',
    });

    expect(mockUpdatePassword).toHaveBeenCalledWith('user-1', 'new-hash');
    expect(mockInvalidateAllTokens).toHaveBeenCalledOnce();
    expect(mockEmit).toHaveBeenCalledWith('auth', 'auth.session.updated', {
      action: 'password_changed',
      userId: 'user-1',
      username: 'lok',
    });
  });

  it('wraps failed token refreshes as core unauthorized errors', async () => {
    mockRefreshToken.mockResolvedValue(null);

    await expect(CoreAuthService.refreshToken('expired-token')).rejects.toMatchObject({
      statusCode: 401,
      code: 'unauthorized',
    });
  });

  it('returns a WebSocket token only when both token and user are valid', async () => {
    mockVerifyToken.mockResolvedValue({ userId: 'user-1' });
    mockFindById.mockResolvedValue({ id: 'user-1', username: 'lok' });

    await expect(CoreAuthService.getWebSocketToken('session-token')).resolves.toEqual({
      wsToken: 'session-token',
      expiresIn: 3600000,
    });
  });

  it('logs in with a QR token through the core service boundary', async () => {
    mockVerifyQrTokenDirect.mockResolvedValue({
      success: true,
      data: {
        username: 'lok',
        sessionToken: 'qr-session',
      },
    });

    await expect(CoreAuthService.loginWithQrToken('qr-token', '127.0.0.1')).resolves.toEqual({
      user: { username: 'lok' },
      token: 'qr-session',
    });
  });

  it('blacklists tokens and emits logout events through core logout', () => {
    CoreAuthService.logout('session-token');

    expect(mockBlacklistToken).toHaveBeenCalledWith('session-token');
    expect(mockEmit).toHaveBeenCalledWith('auth', 'auth.session.updated', {
      action: 'logout',
    });
  });
});
