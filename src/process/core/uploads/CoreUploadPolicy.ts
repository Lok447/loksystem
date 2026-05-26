/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { LOKSYSTEM_TIMESTAMP_SEPARATOR } from '@/common/config/constants';
import { CoreServiceError } from '@process/core/shared/CoreServiceError';

export class CoreUploadPolicy {
  public static sanitizeFileName(fileName: string): string {
    const decoded = this.decodeMulterFileName(fileName);
    const basename = path.basename(decoded);
    const safe = basename.replace(/[<>:"/\\|?*]/g, '_');
    if (!safe || safe === '.' || safe === '..') return `file_${Date.now()}`;
    return safe;
  }

  public static resolveConversationWorkspace(
    conversationWorkspace: string | null,
    requestedWorkspace?: string
  ): string {
    if (!conversationWorkspace) {
      throw new CoreServiceError('Conversation workspace not found', 400, 'workspace_not_found');
    }

    const resolvedConversationWorkspace = path.resolve(conversationWorkspace);
    if (requestedWorkspace && path.resolve(requestedWorkspace) !== resolvedConversationWorkspace) {
      throw new CoreServiceError('Workspace mismatch', 403, 'workspace_mismatch');
    }

    return resolvedConversationWorkspace;
  }

  public static selectUploadDir(params: {
    cacheDir: string;
    conversationId: string;
    requestedWorkspace: string;
    saveToWorkspace: boolean;
    workspace?: string;
  }): string {
    const { cacheDir, conversationId, requestedWorkspace, saveToWorkspace, workspace } = params;

    if (conversationId && saveToWorkspace) {
      if (!workspace) {
        throw new CoreServiceError('Conversation workspace not found', 400, 'workspace_not_found');
      }
      return path.join(workspace, 'uploads');
    }

    if (requestedWorkspace) {
      throw new CoreServiceError('Workspace uploads require conversation id', 403, 'workspace_requires_conversation');
    }

    return path.join(cacheDir, 'temp');
  }

  public static buildDuplicateSafePath(uploadDir: string, safeFileName: string, exists: boolean): string {
    if (!exists) {
      return path.join(uploadDir, safeFileName);
    }

    const ext = path.extname(safeFileName);
    const name = path.basename(safeFileName, ext);
    return path.join(uploadDir, `${name}${LOKSYSTEM_TIMESTAMP_SEPARATOR}${Date.now()}${ext}`);
  }

  public static assertPathInsideUploadDir(targetPath: string, uploadDir: string): void {
    const resolvedTarget = path.resolve(targetPath);
    const resolvedUploadDir = path.resolve(uploadDir);
    if (!resolvedTarget.startsWith(`${resolvedUploadDir}${path.sep}`) && resolvedTarget !== resolvedUploadDir) {
      throw new CoreServiceError('Invalid file name', 400, 'invalid_file_name');
    }
  }

  public static buildSafeTempPath(multerTempDir: string, filePath: string): string {
    return path.join(path.resolve(multerTempDir), path.basename(filePath));
  }

  private static decodeMulterFileName(raw: string): string {
    try {
      const bytes = Buffer.from(raw, 'latin1');
      return bytes.toString('utf8');
    } catch {
      return raw;
    }
  }
}
