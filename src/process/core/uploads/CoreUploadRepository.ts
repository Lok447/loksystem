/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/services/database';
import { getSystemDir, ProcessConfig } from '@process/utils/initStorage';

export class CoreUploadRepository {
  public static async getConversationWorkspace(conversationId: string): Promise<string | null> {
    const db = await getDatabase();
    const result = db.getConversation(conversationId);
    if (!result.success || !result.data?.extra?.workspace) {
      return null;
    }
    return result.data.extra.workspace;
  }

  public static async shouldSaveToWorkspace(): Promise<boolean> {
    return ProcessConfig.get('upload.saveToWorkspace').catch(() => false);
  }

  public static getCacheDir(): string {
    return getSystemDir().cacheDir;
  }
}
