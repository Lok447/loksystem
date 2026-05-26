/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetDatabase, mockGetSystemDir, mockProcessConfigGet } = vi.hoisted(() => ({
  mockGetDatabase: vi.fn(),
  mockGetSystemDir: vi.fn(),
  mockProcessConfigGet: vi.fn(),
}));

vi.mock('@process/services/database', () => ({
  getDatabase: mockGetDatabase,
}));

vi.mock('@process/utils/initStorage', () => ({
  getSystemDir: mockGetSystemDir,
  ProcessConfig: {
    get: mockProcessConfigGet,
  },
}));

import { CoreUploadPolicy, CoreUploadRepository, CoreUploadValidator } from '@process/core/uploads';

describe('CoreUploadPolicy', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sanitizes dangerous filenames and preserves fallback behavior', () => {
    vi.spyOn(Date, 'now').mockReturnValue(99);

    expect(CoreUploadPolicy.sanitizeFileName('../../secret?.txt')).toBe('secret_.txt');
    expect(CoreUploadPolicy.sanitizeFileName('')).toBe('file_99');
  });

  it('enforces requested workspace equality with the conversation workspace', () => {
    const workspace = path.resolve('/workspace/project-a');

    expect(CoreUploadPolicy.resolveConversationWorkspace(workspace, workspace)).toBe(workspace);
    expect(() => CoreUploadPolicy.resolveConversationWorkspace(workspace, path.resolve('/workspace/other'))).toThrow(
      'Workspace mismatch'
    );
    expect(() => CoreUploadPolicy.resolveConversationWorkspace(null)).toThrow('Conversation workspace not found');
  });

  it('selects upload directories without letting workspace requests bypass conversations', () => {
    expect(
      CoreUploadPolicy.selectUploadDir({
        cacheDir: path.resolve('/cache'),
        conversationId: '',
        requestedWorkspace: '',
        saveToWorkspace: false,
      })
    ).toBe(path.join(path.resolve('/cache'), 'temp'));

    expect(() =>
      CoreUploadPolicy.selectUploadDir({
        cacheDir: path.resolve('/cache'),
        conversationId: '',
        requestedWorkspace: path.resolve('/workspace'),
        saveToWorkspace: false,
      })
    ).toThrow('Workspace uploads require conversation id');
  });

  it('builds duplicate-safe target paths and safe temp paths', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123);

    expect(CoreUploadPolicy.buildDuplicateSafePath('/uploads', 'report.txt', false)).toBe(
      path.join('/uploads', 'report.txt')
    );
    expect(CoreUploadPolicy.buildDuplicateSafePath('/uploads', 'report.txt', true)).toBe(
      path.join('/uploads', 'report_loksystem_123.txt')
    );
    expect(CoreUploadPolicy.buildSafeTempPath('/tmp', '../../evil.tmp')).toBe(path.join(path.resolve('/tmp'), 'evil.tmp'));
  });
});

describe('CoreUploadRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSystemDir.mockReturnValue({ cacheDir: path.resolve('/cache') });
  });

  it('returns the conversation workspace when the database record has one', async () => {
    mockGetDatabase.mockResolvedValue({
      getConversation: vi.fn(() => ({
        success: true,
        data: { extra: { workspace: '/workspace/project-a' } },
      })),
    });

    await expect(CoreUploadRepository.getConversationWorkspace('conv-1')).resolves.toBe('/workspace/project-a');
  });

  it('returns null when the conversation workspace is unavailable', async () => {
    mockGetDatabase.mockResolvedValue({
      getConversation: vi.fn(() => ({ success: false, data: null })),
    });

    await expect(CoreUploadRepository.getConversationWorkspace('conv-1')).resolves.toBeNull();
  });

  it('falls back to false when the upload preference cannot be read', async () => {
    mockProcessConfigGet.mockRejectedValue(new Error('storage unavailable'));

    await expect(CoreUploadRepository.shouldSaveToWorkspace()).resolves.toBe(false);
  });
});

describe('CoreUploadValidator', () => {
  it('throws core errors for missing conversation id and missing file', () => {
    expect(() => CoreUploadValidator.requireConversationId('')).toThrow('Missing conversation id');
    expect(() => CoreUploadValidator.requireUploadedFile(undefined)).toThrow('Missing file');
  });
});
