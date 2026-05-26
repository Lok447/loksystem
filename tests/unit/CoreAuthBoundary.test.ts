/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCountUsers,
  mockFindById,
  mockFindByUsername,
  mockHasUsers,
  mockUpdateLastLogin,
  mockUpdatePassword,
} = vi.hoisted(() => ({
  mockCountUsers: vi.fn(),
  mockFindById: vi.fn(),
  mockFindByUsername: vi.fn(),
  mockHasUsers: vi.fn(),
  mockUpdateLastLogin: vi.fn(),
  mockUpdatePassword: vi.fn(),
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

import { CoreAuthRepository, CoreAuthValidator } from '@process/core/auth';

describe('CoreAuthRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns auth status through the core repository boundary', async () => {
    mockHasUsers.mockResolvedValue(true);
    mockCountUsers.mockResolvedValue(2);

    await expect(CoreAuthRepository.getStatus()).resolves.toEqual({
      hasUsers: true,
      userCount: 2,
    });
  });

  it('delegates user lookup and mutation without exposing web route code', async () => {
    const user = { id: 'user-1', username: 'lok', password_hash: 'hash' };
    mockFindByUsername.mockResolvedValue(user);
    mockFindById.mockResolvedValue(user);
    mockUpdateLastLogin.mockResolvedValue(undefined);
    mockUpdatePassword.mockResolvedValue(undefined);

    await expect(CoreAuthRepository.findByUsername('lok')).resolves.toBe(user);
    await expect(CoreAuthRepository.findById('user-1')).resolves.toBe(user);
    await CoreAuthRepository.recordLogin('user-1');
    await CoreAuthRepository.updatePassword('user-1', 'new-hash');

    expect(mockUpdateLastLogin).toHaveBeenCalledWith('user-1');
    expect(mockUpdatePassword).toHaveBeenCalledWith('user-1', 'new-hash');
  });
});

describe('CoreAuthValidator', () => {
  it('throws core errors for missing password change input', () => {
    expect(() => CoreAuthValidator.requirePasswordChangeInput('', 'new')).toThrow(
      'Current password and new password are required'
    );
  });

  it('preserves weak password validation details', () => {
    expect(() => CoreAuthValidator.rejectWeakPassword(['Use at least 8 characters'])).toThrow(
      'New password does not meet security requirements'
    );

    try {
      CoreAuthValidator.rejectWeakPassword(['Use at least 8 characters']);
    } catch (error) {
      expect(error).toMatchObject({
        statusCode: 400,
        code: 'weak_password',
        details: ['Use at least 8 characters'],
      });
    }
  });

  it('requires QR tokens at the core boundary', () => {
    expect(() => CoreAuthValidator.requireQrToken('')).toThrow('QR token is required');
    expect(() => CoreAuthValidator.requireQrToken('qr-token')).not.toThrow();
  });
});
