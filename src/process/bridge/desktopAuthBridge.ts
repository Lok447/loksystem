/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { ipcMain } from 'electron';
import { getPlatformServices } from '@/common/platform';
import { AUTH_CONFIG } from '@process/webserver/config/constants';
import { UserRepository } from '@process/webserver/auth/repository/UserRepository';
import { AuthService } from '@process/webserver/auth/service/AuthService';

type DesktopAuthUser = {
  id: string;
  username: string;
};

type DesktopAuthSession = {
  user: DesktopAuthUser;
  token: string;
  expiresAt: number;
};

type PersistedDesktopAuthSession = {
  token: string;
};

const DESKTOP_AUTH_CHANNELS = {
  currentUser: 'desktop-auth:get-current-user',
  login: 'desktop-auth:login',
  logout: 'desktop-auth:logout',
} as const;

let desktopSession: DesktopAuthSession | null = null;

const getDesktopSessionFilePath = (): string =>
  path.join(getPlatformServices().paths.getDataDir(), 'config', 'desktop-auth-session.json');

const clearPersistedDesktopSession = (): void => {
  try {
    fs.rmSync(getDesktopSessionFilePath(), { force: true });
  } catch {
    // Best-effort cleanup. A stale file only means the user may need to log in again.
  }
};

const persistDesktopSession = (session: DesktopAuthSession): void => {
  try {
    const filePath = getDesktopSessionFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const payload: PersistedDesktopAuthSession = {
      token: session.token,
    };
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // Best-effort hardening on platforms that support chmod.
    }
  } catch (error) {
    console.warn('[DesktopAuth] Failed to persist desktop session:', error);
  }
};

const getSessionExpiry = async (token: string): Promise<number> => {
  const payload = await AuthService.verifyToken(token);
  if (payload?.exp) {
    return payload.exp * 1000;
  }
  return Date.now() + AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE;
};

const ensurePrimaryUser = async (): Promise<void> => {
  const existing = await UserRepository.getPrimaryWebUIUser();
  if (existing?.password_hash?.trim()) {
    return;
  }

  const username = AUTH_CONFIG.DEFAULT_USER.USERNAME;
  const password = AUTH_CONFIG.DEFAULT_USER.PASSWORD;
  const passwordHash = await AuthService.hashPassword(password);
  const systemUser = await UserRepository.getSystemUser();

  if (systemUser) {
    const nextUsername = systemUser.username && systemUser.username !== systemUser.id ? systemUser.username : username;
    await UserRepository.setSystemUserCredentials(nextUsername, passwordHash);
    console.warn(`[DesktopAuth] Initialized desktop credentials for user "${nextUsername}"`);
    console.warn(`[DesktopAuth] Temporary password: ${password}`);
    return;
  }

  const existingAdmin = await UserRepository.findByUsername(username);
  if (existingAdmin) {
    await UserRepository.updatePassword(existingAdmin.id, passwordHash);
    console.warn(`[DesktopAuth] Reinitialized desktop credentials for user "${username}"`);
    console.warn(`[DesktopAuth] Temporary password: ${password}`);
    return;
  }

  await UserRepository.createUser(username, passwordHash);
  console.warn(`[DesktopAuth] Created desktop credentials for user "${username}"`);
  console.warn(`[DesktopAuth] Temporary password: ${password}`);
};

const loadPersistedDesktopSession = async (): Promise<DesktopAuthSession | null> => {
  try {
    const filePath = getDesktopSessionFilePath();
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const stored = JSON.parse(raw) as PersistedDesktopAuthSession | null;
    if (!stored?.token) {
      clearPersistedDesktopSession();
      return null;
    }

    const payload = await AuthService.verifyToken(stored.token);
    if (!payload) {
      clearPersistedDesktopSession();
      return null;
    }

    const user = await UserRepository.findById(payload.userId);
    if (!user) {
      clearPersistedDesktopSession();
      return null;
    }

    return {
      user: {
        id: user.id,
        username: user.username,
      },
      token: stored.token,
      expiresAt: payload.exp ? payload.exp * 1000 : Date.now() + AUTH_CONFIG.TOKEN.COOKIE_MAX_AGE,
    };
  } catch (error) {
    console.warn('[DesktopAuth] Failed to restore desktop session:', error);
    clearPersistedDesktopSession();
    return null;
  }
};

const getValidDesktopSessionUser = async (): Promise<DesktopAuthUser | null> => {
  if (!desktopSession) {
    desktopSession = await loadPersistedDesktopSession();
    if (!desktopSession) {
      return null;
    }
  }

  if (desktopSession.expiresAt <= Date.now()) {
    desktopSession = null;
    clearPersistedDesktopSession();
    return null;
  }

  const payload = await AuthService.verifyToken(desktopSession.token);
  if (!payload) {
    desktopSession = null;
    clearPersistedDesktopSession();
    return null;
  }

  return desktopSession.user;
};

export function initDesktopAuthBridge(): void {
  ipcMain.handle(DESKTOP_AUTH_CHANNELS.currentUser, async () => {
    try {
      const user = await getValidDesktopSessionUser();
      return {
        success: true,
        user,
      };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown desktop auth error',
      };
    }
  });

  ipcMain.handle(
    DESKTOP_AUTH_CHANNELS.login,
    async (_event, params: { username: string; password: string; remember?: boolean }) => {
      try {
        await ensurePrimaryUser();

        const username = params.username.trim();
        const password = params.password;
        const user = await UserRepository.findByUsername(username);

        if (!user) {
          await AuthService.constantTimeVerifyMissingUser();
          return {
            success: false,
            code: 'invalidCredentials',
            msg: 'Invalid username or password',
          };
        }

        const isValidPassword = await AuthService.constantTimeVerify(password, user.password_hash, true);
        if (!isValidPassword) {
          return {
            success: false,
            code: 'invalidCredentials',
            msg: 'Invalid username or password',
          };
        }

        const authUser: DesktopAuthUser = {
          id: user.id,
          username: user.username,
        };
        const token = await AuthService.generateToken(authUser);
        const expiresAt = await getSessionExpiry(token);
        desktopSession = {
          user: authUser,
          token,
          expiresAt,
        };
        persistDesktopSession(desktopSession);

        await UserRepository.updateLastLogin(user.id);

        return {
          success: true,
          user: authUser,
        };
      } catch (error) {
        console.error('[DesktopAuth] Login failed:', error);
        return {
          success: false,
          code: 'serverError',
          msg: error instanceof Error ? error.message : 'Internal desktop auth error',
        };
      }
    }
  );

  ipcMain.handle(DESKTOP_AUTH_CHANNELS.logout, async () => {
    try {
      if (desktopSession?.token) {
        AuthService.blacklistToken(desktopSession.token);
      }
      desktopSession = null;
      clearPersistedDesktopSession();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown desktop auth error',
      };
    }
  });
}
