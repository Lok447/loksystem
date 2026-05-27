/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserRepository, type AuthUser } from '@process/webserver/auth/repository/UserRepository';

export type CoreAuthUser = AuthUser;

export interface CoreAuthStatus {
  hasUsers: boolean;
  userCount: number;
}

export class CoreAuthRepository {
  public static findByUsername(username: string): Promise<CoreAuthUser | null> {
    return UserRepository.findByUsername(username);
  }

  public static findById(userId: string): Promise<CoreAuthUser | null> {
    return UserRepository.findById(userId);
  }

  public static async getStatus(): Promise<CoreAuthStatus> {
    const [hasUsers, userCount] = await Promise.all([UserRepository.hasUsers(), UserRepository.countUsers()]);
    return { hasUsers, userCount };
  }

  public static recordLogin(userId: string): Promise<void> {
    return UserRepository.updateLastLogin(userId);
  }

  public static updatePassword(userId: string, passwordHash: string): Promise<void> {
    return UserRepository.updatePassword(userId, passwordHash);
  }

  public static updateAuthState(
    userId: string,
    updates: {
      jwtSecret?: string | null;
      authVersion?: number | null;
      authMigratedAt?: number | null;
      tokensInvalidBefore?: number | null;
    }
  ): Promise<void> {
    return UserRepository.updateAuthState(userId, {
      jwt_secret: updates.jwtSecret,
      auth_version: updates.authVersion,
      auth_migrated_at: updates.authMigratedAt,
      tokens_invalid_before: updates.tokensInvalidBefore,
    });
  }
}
