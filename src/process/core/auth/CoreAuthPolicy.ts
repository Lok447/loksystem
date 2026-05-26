/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { verifyQRTokenDirect } from '@process/bridge/webuiQR';
import { AuthService } from '@process/webserver/auth/service/AuthService';
import type { CoreAuthUser } from './CoreAuthRepository';

export interface CoreTokenPayload {
  userId: string;
  username: string;
  tokenId: string;
  iat?: number;
  exp?: number;
}

export interface CorePasswordStrengthResult {
  isValid: boolean;
  errors: string[];
}

export interface CoreQrLoginVerification {
  success: boolean;
  msg?: string;
  data?: {
    username: string;
    sessionToken: string;
  };
}

export class CoreAuthPolicy {
  public static runMissingUserPasswordCheck(): Promise<boolean> {
    return AuthService.constantTimeVerifyMissingUser();
  }

  public static verifyLoginPassword(password: string, passwordHash: string): Promise<boolean> {
    return AuthService.constantTimeVerify(password, passwordHash, true);
  }

  public static issueSessionToken(user: Pick<CoreAuthUser, 'id' | 'username'>): Promise<string> {
    return AuthService.generateToken(user);
  }

  public static blacklistSessionToken(token: string): void {
    AuthService.blacklistToken(token);
  }

  public static validatePasswordStrength(password: string): CorePasswordStrengthResult {
    return AuthService.validatePasswordStrength(password);
  }

  public static verifyCurrentPassword(password: string, passwordHash: string): Promise<boolean> {
    return AuthService.verifyPassword(password, passwordHash);
  }

  public static hashPassword(password: string): Promise<string> {
    return AuthService.hashPassword(password);
  }

  public static invalidateAllSessions(): Promise<void> {
    return AuthService.invalidateAllTokens();
  }

  public static refreshSessionToken(token: string): Promise<string | null> {
    return AuthService.refreshToken(token);
  }

  public static verifySessionToken(token: string): Promise<CoreTokenPayload | null> {
    return AuthService.verifyToken(token);
  }

  public static verifyQrLoginToken(qrToken: string, clientIP: string): Promise<CoreQrLoginVerification> {
    return verifyQRTokenDirect(qrToken, clientIP);
  }
}
