/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { AuthUser } from '../repository/UserRepository';
import { UserRepository } from '../repository/UserRepository';
import { AUTH_CONFIG } from '../../config/constants';
import type { AuthSessionContext } from '../sessionContext';

interface TokenPayload {
  userId: string;
  username: string;
  tokenId: string;
  sessionId: string;
  authVersion: number;
  iat?: number;
  exp?: number;
}

type RawTokenPayload = Omit<TokenPayload, 'userId'> & {
  userId: string | number;
};

interface UserCredentials {
  username: string;
  password: string;
  createdAt: number;
}

interface SessionVerificationResult {
  payload: TokenPayload;
  sessionId: string;
}

const hashPasswordAsync = (password: string, saltRounds: number): Promise<string> =>
  new Promise((resolve, reject) => {
    bcrypt.hash(password, saltRounds, (error, hash) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(hash);
    });
  });

const comparePasswordAsync = (password: string, hash: string): Promise<boolean> =>
  new Promise((resolve, reject) => {
    bcrypt.compare(password, hash, (error, same) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(same);
    });
  });

const DUMMY_BCRYPT_PASSWORD = 'loksystem-auth-dummy-password';
const DUMMY_BCRYPT_HASH = '$2a$12$s5cKddFA1hp06nhAubmZa.eT3/xT9Bmve36cul7fZ6ch2mz9EITDu';

export class AuthService {
  private static readonly SALT_ROUNDS = 12;
  private static readonly AUTH_SCHEMA_VERSION = 2;
  private static readonly BLACKLIST_CLEANUP_INTERVAL = 60 * 60 * 1000;
  private static readonly TOKEN_EXPIRY = AUTH_CONFIG.TOKEN.SESSION_EXPIRY;

  private static jwtSecret: string | null = null;
  private static tokenBlacklist: Map<string, number> = new Map();
  private static blacklistCleanupTimer: ReturnType<typeof setInterval> | null = null;

  public static blacklistToken(token: string): void {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    try {
      const decoded = jwt.decode(token) as { exp?: number } | null;
      const expiry = decoded?.exp ? decoded.exp * 1000 : Date.now() + AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE;
      this.tokenBlacklist.set(tokenHash, expiry);
      this.startBlacklistCleanup();
    } catch {
      this.tokenBlacklist.set(tokenHash, Date.now() + AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE);
    }
  }

  public static isTokenBlacklisted(token: string): boolean {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiry = this.tokenBlacklist.get(tokenHash);
    if (!expiry) {
      return false;
    }
    if (Date.now() > expiry) {
      this.tokenBlacklist.delete(tokenHash);
      return false;
    }
    return true;
  }

  private static startBlacklistCleanup(): void {
    if (this.blacklistCleanupTimer) {
      return;
    }
    this.blacklistCleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [hash, expiry] of this.tokenBlacklist.entries()) {
        if (now > expiry) {
          this.tokenBlacklist.delete(hash);
        }
      }
      void this.cleanupExpiredSessions(now).catch((error) => {
        console.error('Failed to cleanup expired auth sessions:', error);
      });
    }, this.BLACKLIST_CLEANUP_INTERVAL);
    this.blacklistCleanupTimer.unref();
  }

  private static generateSecretKey(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  private static normalizeUserId(rawId: string | number): string {
    return String(rawId);
  }

  private static parseExpiryMs(): number {
    const expiry = this.TOKEN_EXPIRY;
    if (typeof expiry === 'number') {
      return expiry * 1000;
    }
    const match = /^(\d+)([smhd])$/.exec(expiry);
    if (!match) {
      return AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE;
    }
    const value = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return value * multipliers[unit];
  }

  private static async ensureUserAuthMetadata(user: Pick<AuthUser, 'id'> & Partial<AuthUser>): Promise<AuthUser> {
    const now = Date.now();
    const nextAuthVersion = Math.max(user.auth_version ?? 1, this.AUTH_SCHEMA_VERSION);
    const nextMigratedAt = user.auth_migrated_at ?? now;
    if (user.auth_version !== nextAuthVersion || user.auth_migrated_at == null) {
      await UserRepository.updateAuthState(user.id, {
        auth_version: nextAuthVersion,
        auth_migrated_at: nextMigratedAt,
      });
    }
    const refreshed = await UserRepository.findById(user.id);
    if (!refreshed) {
      throw new Error(`User not found after auth metadata update: ${user.id}`);
    }
    return refreshed;
  }

  private static async persistIssuedSession(
    user: Pick<AuthUser, 'id' | 'username'> & Partial<AuthUser>,
    payload: Pick<TokenPayload, 'tokenId' | 'sessionId'>,
    context?: AuthSessionContext
  ): Promise<void> {
    const now = Date.now();
    await UserRepository.createAuthSession({
      id: payload.sessionId,
      user_id: user.id,
      token_id: payload.tokenId,
      session_type: 'web',
      status: 'active',
      issued_at: now,
      expires_at: now + this.parseExpiryMs(),
      last_seen_at: now,
      device_id: context?.deviceId ?? null,
      device_name: context?.deviceName ?? null,
      metadata: JSON.stringify({
        username: user.username,
        authVersion: Math.max(user.auth_version ?? 1, this.AUTH_SCHEMA_VERSION),
      }),
    });
  }

  private static async markSessionExpiredIfNeeded(tokenPayload: TokenPayload): Promise<void> {
    const session = await UserRepository.findAuthSessionByTokenId(tokenPayload.tokenId);
    if (!session || session.status !== 'active') {
      return;
    }
    await UserRepository.updateAuthSession(session.id, {
      status: 'expired',
      revoked_at: Date.now(),
      revoke_reason: 'token_expired',
    });
  }

  private static async verifySessionTokenRecord(
    token: string,
    options?: { ignoreExpiration?: boolean; allowExpired?: boolean }
  ): Promise<SessionVerificationResult | null> {
    if (this.isTokenBlacklisted(token)) {
      return null;
    }

    try {
      const decoded = jwt.verify(token, await this.getJwtSecret(), {
        issuer: 'loksystem',
        audience: 'loksystem-webui',
        ignoreExpiration: options?.ignoreExpiration ?? false,
      }) as RawTokenPayload;

      const tokenPayload: TokenPayload = {
        ...decoded,
        userId: this.normalizeUserId(decoded.userId),
      };
      const user = await UserRepository.findById(tokenPayload.userId);
      if (!user) {
        return null;
      }
      if ((user.tokens_invalid_before ?? 0) > ((tokenPayload.iat ?? 0) * 1000)) {
        return null;
      }
      if ((user.auth_version ?? 1) > (tokenPayload.authVersion ?? 1)) {
        return null;
      }
      const session = await UserRepository.findAuthSessionByTokenId(tokenPayload.tokenId);
      if (!session) {
        return null;
      }
      if (session.status === 'expired') {
        return options?.allowExpired ? { payload: tokenPayload, sessionId: session.id } : null;
      }
      if (session.status !== 'active') {
        return null;
      }
      return {
        payload: tokenPayload,
        sessionId: session.id,
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        const decoded = jwt.decode(token) as RawTokenPayload | null;
        if (decoded?.tokenId && decoded?.sessionId) {
          await this.markSessionExpiredIfNeeded({
            ...decoded,
            userId: this.normalizeUserId(decoded.userId),
          });
        }
        return null;
      }
      if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.NotBeforeError) {
        return null;
      }
      console.error('Token verification failed:', error);
      return null;
    }
  }

  public static async getJwtSecret(): Promise<string> {
    if (this.jwtSecret) {
      return this.jwtSecret;
    }
    if (process.env.JWT_SECRET) {
      this.jwtSecret = process.env.JWT_SECRET;
      return this.jwtSecret;
    }

    try {
      const systemUser = await UserRepository.getPrimaryWebUIUser();
      if (systemUser && systemUser.jwt_secret) {
        this.jwtSecret = systemUser.jwt_secret;
        return this.jwtSecret;
      }

      if (systemUser) {
        const newSecret = this.generateSecretKey();
        await UserRepository.updateJwtSecret(systemUser.id, newSecret);
        this.jwtSecret = newSecret;
        return this.jwtSecret;
      }

      console.warn('[AuthService] System WebUI user not found, using temporary secret');
      this.jwtSecret = this.generateSecretKey();
      return this.jwtSecret;
    } catch (error) {
      console.error('Failed to get/save JWT secret:', error);
      this.jwtSecret = this.generateSecretKey();
      return this.jwtSecret;
    }
  }

  public static async invalidateAllTokens(): Promise<void> {
    try {
      const systemUser = await UserRepository.getPrimaryWebUIUser();
      if (!systemUser) {
        console.warn('[AuthService] System WebUI user not found, cannot invalidate tokens');
        return;
      }

      const revokedAt = Date.now();
      const newSecret = this.generateSecretKey();
      await UserRepository.updateAuthState(systemUser.id, {
        jwt_secret: newSecret,
        auth_version: Math.max(systemUser.auth_version ?? 1, this.AUTH_SCHEMA_VERSION),
        auth_migrated_at: systemUser.auth_migrated_at ?? revokedAt,
        tokens_invalid_before: revokedAt,
      });
      await UserRepository.revokeAuthSessionsForUser(systemUser.id, 'global_invalidation', { revokedAt });
      this.jwtSecret = newSecret;
    } catch (error) {
      console.error('Failed to invalidate tokens:', error);
    }
  }

  public static hashPassword(password: string): Promise<string> {
    return hashPasswordAsync(password, this.SALT_ROUNDS);
  }

  public static verifyPassword(password: string, hash: string): Promise<boolean> {
    return comparePasswordAsync(password, hash);
  }

  public static async generateToken(
    user: Pick<AuthUser, 'id' | 'username'> & Partial<AuthUser>,
    context?: AuthSessionContext
  ): Promise<string> {
    const normalizedUser = await this.ensureUserAuthMetadata(user);
    const payload: TokenPayload = {
      userId: normalizedUser.id,
      username: normalizedUser.username,
      tokenId: crypto.randomUUID(),
      sessionId: this.generateSessionId(),
      authVersion: Math.max(normalizedUser.auth_version ?? 1, this.AUTH_SCHEMA_VERSION),
    };

    const token = jwt.sign(payload, await this.getJwtSecret(), {
      expiresIn: this.TOKEN_EXPIRY,
      issuer: 'loksystem',
      audience: 'loksystem-webui',
    });
    this.startBlacklistCleanup();
    await this.persistIssuedSession(normalizedUser, payload, context);
    return token;
  }

  public static async verifyToken(token: string): Promise<TokenPayload | null> {
    const result = await this.verifySessionTokenRecord(token);
    if (!result) {
      return null;
    }
    await UserRepository.updateAuthSession(result.sessionId, { last_seen_at: Date.now() });
    return result.payload;
  }

  public static async verifyWebSocketToken(token: string): Promise<TokenPayload | null> {
    return this.verifyToken(token);
  }

  public static async refreshToken(token: string, context?: AuthSessionContext): Promise<string | null> {
    const verification = await this.verifySessionTokenRecord(token, {
      ignoreExpiration: true,
      allowExpired: true,
    });
    if (!verification) {
      return null;
    }

    const { payload, sessionId } = verification;
    const user = await UserRepository.findById(payload.userId);
    if (!user) {
      return null;
    }
    const sourceSession = await UserRepository.findAuthSessionByTokenId(payload.tokenId);
    if (!sourceSession || (sourceSession.status !== 'active' && sourceSession.status !== 'expired')) {
      return null;
    }

    const refreshedToken = await this.generateToken({
      id: payload.userId,
      username: payload.username,
      auth_version: user.auth_version,
      auth_migrated_at: user.auth_migrated_at,
    }, {
      deviceId: context?.deviceId ?? sourceSession.device_id ?? null,
      deviceName: context?.deviceName ?? sourceSession.device_name ?? null,
    });
    const nextDecoded = jwt.decode(refreshedToken) as TokenPayload | null;
    this.blacklistToken(token);
    await UserRepository.updateAuthSession(sessionId, {
      status: 'rotated',
      revoked_at: Date.now(),
      revoke_reason: 'refresh_rotated',
      replaced_by_session_id: nextDecoded?.sessionId ?? null,
    });
    return refreshedToken;
  }

  public static async revokeSessionToken(
    token: string,
    revokeReason = 'logout',
    options?: { revokeReplacedChain?: boolean }
  ): Promise<void> {
    this.blacklistToken(token);

    let decoded: RawTokenPayload | null = null;
    try {
      decoded = jwt.decode(token) as RawTokenPayload | null;
    } catch {
      decoded = null;
    }

    if (!decoded?.tokenId) {
      return;
    }

    const session = await UserRepository.findAuthSessionByTokenId(decoded.tokenId);
    if (!session) {
      return;
    }

    const revokedAt = Date.now();
    await UserRepository.updateAuthSession(session.id, {
      status: 'revoked',
      revoked_at: revokedAt,
      revoke_reason: revokeReason,
    });

    if (options?.revokeReplacedChain && session.replaced_by_session_id) {
      await UserRepository.updateAuthSession(session.replaced_by_session_id, {
        status: 'revoked',
        revoked_at: revokedAt,
        revoke_reason: `${revokeReason}_cascade`,
      });
    }
  }

  public static async cleanupExpiredSessions(now = Date.now()): Promise<number> {
    return UserRepository.deleteExpiredAuthSessions(now);
  }

  public static generateRandomPassword(): string {
    const baseLength = 12;
    const lengthVariance = 5;
    const passwordLength = baseLength + crypto.randomInt(0, lengthVariance);

    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    const special = '!@#$%^&*';
    const allChars = lowercase + uppercase + digits + special;

    const ensureCategory = (chars: string) => chars[crypto.randomInt(0, chars.length)];
    const passwordChars: string[] = [
      ensureCategory(lowercase),
      ensureCategory(uppercase),
      ensureCategory(digits),
      ensureCategory(special),
    ];

    const remainingLength = Math.max(passwordLength - passwordChars.length, 0);
    for (let i = 0; i < remainingLength; i++) {
      const index = crypto.randomInt(0, allChars.length);
      passwordChars.push(allChars[index]);
    }

    for (let i = passwordChars.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]];
    }

    return passwordChars.join('');
  }

  public static generateUserCredentials(): UserCredentials {
    const usernameLength = crypto.randomInt(6, 9);
    const usernameChars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let username = '';
    for (let i = 0; i < usernameLength; i++) {
      username += usernameChars[crypto.randomInt(0, usernameChars.length)];
    }

    return {
      username,
      password: this.generateRandomPassword(),
      createdAt: Date.now(),
    };
  }

  public static validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('PASSWORD_TOO_SHORT');
    }
    if (password.length > 128) {
      errors.push('PASSWORD_TOO_LONG');
    }
    const weakPasswords = ['password', '12345678', '123456789', 'qwertyui', 'abcdefgh'];
    if (weakPasswords.includes(password.toLowerCase())) {
      errors.push('PASSWORD_TOO_COMMON');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  public static validateUsername(username: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (username.length < 3) {
      errors.push('Username must be at least 3 characters long');
    }
    if (username.length > 32) {
      errors.push('Username must be less than 32 characters long');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      errors.push('Username can only contain letters, numbers, hyphens, and underscores');
    }
    if (/^[_-]|[_-]$/.test(username)) {
      errors.push('Username cannot start or end with hyphen or underscore');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  public static generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  public static async constantTimeVerify(provided: string, expected: string, hashProvided = false): Promise<boolean> {
    const start = process.hrtime.bigint();

    let result: boolean;
    if (hashProvided) {
      result = await comparePasswordAsync(provided, expected);
    } else {
      result = crypto.timingSafeEqual(
        Buffer.from(provided.padEnd(expected.length, '0')),
        Buffer.from(expected.padEnd(provided.length, '0'))
      );
    }

    const elapsed = process.hrtime.bigint() - start;
    const minDelay = BigInt(50_000_000);
    if (elapsed < minDelay) {
      const delayMs = Number((minDelay - elapsed) / BigInt(1_000_000));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    return result;
  }

  public static async constantTimeVerifyMissingUser(): Promise<boolean> {
    return this.constantTimeVerify(DUMMY_BCRYPT_PASSWORD, DUMMY_BCRYPT_HASH, true);
  }
}

export default AuthService;
