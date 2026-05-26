/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreServiceError } from '@process/core/shared/CoreServiceError';

export class CoreUploadValidator {
  public static requireConversationId(conversationId: string): void {
    if (!conversationId) {
      throw new CoreServiceError('Missing conversation id', 400, 'invalid_request');
    }
  }

  public static requireUploadedFile(file: Express.Multer.File | undefined): Express.Multer.File {
    if (!file) {
      throw new CoreServiceError('Missing file', 400, 'missing_file');
    }
    return file;
  }

  public static requireFileName(fileName: string | undefined): string {
    if (!fileName || fileName.trim().length === 0) {
      throw new CoreServiceError('Missing file name', 400, 'missing_file_name');
    }
    return fileName;
  }
}
