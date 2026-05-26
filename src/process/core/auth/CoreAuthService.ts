/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { coreEventBus } from '@process/core/shared/CoreEventBus';
import { AUTH_CONFIG } from '@process/webserver/config/constants';
import { CoreServiceError } from '@process/core/shared/CoreServiceError';
import { CoreAuthPolicy } from './CoreAuthPolicy';
import { CoreAuthRepository } from './CoreAuthRepository';
import { CoreAuthValidator } from './CoreAuthValidator';

type LoginResult = {
  token: string;
  user: {
    id: string;
    username: string;
  };
};

type AuthStatusResult = {
  needsSetup: boolean;
  userCount: number;
  isAuthenticated: false;
};

type WebSocketTokenResult = {
  wsToken: string;
  expiresIn: number;
};

type QrLoginResult = {
  user: {
    username: string;
  };
  token: string;
};

export class CoreAuthService {
  public static async login(username: string, password: string): Promise<LoginResult> {
    const user = await CoreAuthRepository.findByUsername(username);
    if (!user) {
      await CoreAuthPolicy.runMissingUserPasswordCheck();
      throw new CoreServiceError('Invalid username or password', 401, 'invalid_credentials');
    }

    const isValidPassword = await CoreAuthPolicy.verifyLoginPassword(password, user.password_hash);
    if (!isValidPassword) {
      throw new CoreServiceError('Invalid username or password', 401, 'invalid_credentials');
    }

    const token = await CoreAuthPolicy.issueSessionToken(user);
    await CoreAuthRepository.recordLogin(user.id);

    coreEventBus.emit('auth', 'auth.session.updated', {
      action: 'login',
      userId: user.id,
      username: user.username,
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
      },
    };
  }

  public static logout(token: string | null): void {
    if (token) {
      CoreAuthPolicy.blacklistSessionToken(token);
      coreEventBus.emit('auth', 'auth.session.updated', {
        action: 'logout',
      });
    }
  }

  public static async getStatus(): Promise<AuthStatusResult> {
    const { hasUsers, userCount } = await CoreAuthRepository.getStatus();
    return {
      needsSetup: !hasUsers,
      userCount,
      isAuthenticated: false,
    };
  }

  public static async changePassword(params: {
    userId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    const { userId, currentPassword, newPassword } = params;

    CoreAuthValidator.requirePasswordChangeInput(currentPassword, newPassword);

    const passwordValidation = CoreAuthPolicy.validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      CoreAuthValidator.rejectWeakPassword(passwordValidation.errors);
    }

    const user = await CoreAuthRepository.findById(userId);
    if (!user) {
      throw new CoreServiceError('User not found', 404, 'not_found');
    }

    const isValidPassword = await CoreAuthPolicy.verifyCurrentPassword(currentPassword, user.password_hash);
    if (!isValidPassword) {
      throw new CoreServiceError('Current password is incorrect', 401, 'invalid_credentials');
    }

    const newPasswordHash = await CoreAuthPolicy.hashPassword(newPassword);
    await CoreAuthRepository.updatePassword(user.id, newPasswordHash);
    await CoreAuthPolicy.invalidateAllSessions();
    coreEventBus.emit('auth', 'auth.session.updated', {
      action: 'password_changed',
      userId: user.id,
      username: user.username,
    });
  }

  public static async refreshToken(token: string): Promise<string> {
    const newToken = await CoreAuthPolicy.refreshSessionToken(token);
    if (!newToken) {
      throw new CoreServiceError('Invalid or expired token', 401, 'unauthorized');
    }
    coreEventBus.emit('auth', 'auth.session.updated', {
      action: 'token_refreshed',
    });
    return newToken;
  }

  public static async getWebSocketToken(sessionToken: string): Promise<WebSocketTokenResult> {
    const decoded = await CoreAuthPolicy.verifySessionToken(sessionToken);
    if (!decoded) {
      throw new CoreServiceError('Unauthorized: Invalid session token', 401, 'unauthorized');
    }

    const user = await CoreAuthRepository.findById(decoded.userId);
    if (!user) {
      throw new CoreServiceError('Unauthorized: User not found', 401, 'unauthorized');
    }

    return {
      wsToken: sessionToken,
      expiresIn: AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
    };
  }

  public static async loginWithQrToken(qrToken: string, clientIP: string): Promise<QrLoginResult> {
    CoreAuthValidator.requireQrToken(qrToken);

    const result = await CoreAuthPolicy.verifyQrLoginToken(qrToken, clientIP);
    if (!result.success || !result.data) {
      throw new CoreServiceError(result.msg || 'Invalid or expired QR token', 401, 'unauthorized');
    }

    return {
      user: { username: result.data.username },
      token: result.data.sessionToken,
    };
  }
}
