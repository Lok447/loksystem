/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAccess,
  mockEmit,
  mockGetDatabase,
  mockGetSystemDir,
  mockMkdir,
  mockProcessConfigGet,
  mockRename,
} = vi.hoisted(() => ({
  mockAccess: vi.fn(),
  mockEmit: vi.fn(),
  mockGetDatabase: vi.fn(),
  mockGetSystemDir: vi.fn(),
  mockMkdir: vi.fn(),
  mockProcessConfigGet: vi.fn(),
  mockRename: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: {
    access: mockAccess,
    mkdir: mockMkdir,
    rename: mockRename,
  },
  access: mockAccess,
  mkdir: mockMkdir,
  rename: mockRename,
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

vi.mock('@process/core/shared/CoreEventBus', () => ({
  coreEventBus: {
    emit: mockEmit,
  },
}));

import { CoreServiceError } from '@process/core/shared';
import { CoreUploadService } from '@process/core/uploads';

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'report.txt',
    encoding: '7bit',
    mimetype: 'text/plain',
    size: 42,
    destination: CoreUploadService.MULTER_TEMP_DIR,
    filename: 'multer-upload',
    path: path.join(CoreUploadService.MULTER_TEMP_DIR, 'multer-upload'),
    buffer: Buffer.alloc(0),
    stream: undefined as never,
    ...overrides,
  };
}

describe('CoreUploadService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccess.mockRejectedValue(new Error('not found'));
    mockGetSystemDir.mockReturnValue({ cacheDir: path.resolve('/cache-root') });
    mockMkdir.mockResolvedValue(undefined);
    mockProcessConfigGet.mockResolvedValue(false);
    mockRename.mockResolvedValue(undefined);
  });

  it('sanitizes uploaded file names and strips path traversal', () => {
    expect(CoreUploadService.sanitizeFileName('../secret<plan>.txt')).toBe('secret_plan_.txt');
    expect(CoreUploadService.sanitizeFileName('')).toMatch(/^file_\d+$/);
  });

  it('resolves a conversation workspace and rejects mismatched requested workspaces', async () => {
    const workspace = path.resolve('/workspace/project-a');
    mockGetDatabase.mockResolvedValue({
      getConversation: vi.fn(() => ({
        success: true,
        data: { extra: { workspace } },
      })),
    });

    await expect(CoreUploadService.resolveUploadWorkspace('conv-1', workspace)).resolves.toBe(workspace);
    await expect(CoreUploadService.resolveUploadWorkspace('conv-1', path.resolve('/workspace/other'))).rejects.toMatchObject(
      {
        statusCode: 403,
        code: 'workspace_mismatch',
      }
    );
  });

  it('stores uploads in the cache temp directory by default', async () => {
    const file = makeFile({
      originalname: 'notes?.txt',
      path: path.join('/unsafe', '..', 'multer-upload'),
    });

    const result = await CoreUploadService.storeUploadedFile({ file });

    const uploadDir = path.join(path.resolve('/cache-root'), 'temp');
    const targetPath = path.join(uploadDir, 'notes_.txt');
    expect(mockMkdir).toHaveBeenCalledWith(uploadDir, { recursive: true });
    expect(mockRename).toHaveBeenCalledWith(
      path.join(path.resolve(CoreUploadService.MULTER_TEMP_DIR), 'multer-upload'),
      targetPath
    );
    expect(mockEmit).toHaveBeenCalledWith('upload', 'upload.file.stored', {
      conversationId: null,
      workspace: null,
      file: result,
    });
    expect(result).toEqual({
      path: targetPath,
      name: 'notes_.txt',
      size: 42,
      type: 'text/plain',
    });
  });

  it('requires a conversation id before accepting requested workspace uploads', async () => {
    await expect(
      CoreUploadService.storeUploadedFile({
        file: makeFile(),
        requestedWorkspace: path.resolve('/workspace/project-a'),
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'workspace_requires_conversation',
    } satisfies Partial<CoreServiceError>);
  });

  it('stores workspace uploads under the conversation workspace when enabled', async () => {
    const workspace = path.resolve('/workspace/project-a');
    mockProcessConfigGet.mockResolvedValue(true);
    mockGetDatabase.mockResolvedValue({
      getConversation: vi.fn(() => ({
        success: true,
        data: { extra: { workspace } },
      })),
    });

    await CoreUploadService.storeUploadedFile({
      file: makeFile({ originalname: 'artifact.zip', mimetype: '' }),
      conversationId: 'conv-1',
      requestedWorkspace: workspace,
    });

    expect(mockRename).toHaveBeenCalledWith(
      path.join(path.resolve(CoreUploadService.MULTER_TEMP_DIR), 'multer-upload'),
      path.join(workspace, 'uploads', 'artifact.zip')
    );
    expect(mockEmit).toHaveBeenCalledWith(
      'upload',
      'upload.file.stored',
      expect.objectContaining({
        conversationId: 'conv-1',
        workspace: path.join(workspace, 'uploads'),
        file: expect.objectContaining({ type: 'application/octet-stream' }),
      })
    );
  });

  it('adds a timestamp suffix instead of overwriting an existing target file', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(123456);
    mockAccess.mockResolvedValue(undefined);

    const result = await CoreUploadService.storeUploadedFile({
      file: makeFile({ originalname: 'report.txt' }),
    });

    expect(result.name).toBe('report_loksystem_123456.txt');
  });

  it('throws a core error when the multipart file is missing', async () => {
    await expect(CoreUploadService.storeUploadedFile({ file: undefined })).rejects.toMatchObject({
      statusCode: 400,
      code: 'missing_file',
    });
  });
});
