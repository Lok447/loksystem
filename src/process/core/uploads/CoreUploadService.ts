/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import { coreEventBus } from '@process/core/shared/CoreEventBus';
import { CoreUploadPolicy } from './CoreUploadPolicy';
import { CoreUploadRepository } from './CoreUploadRepository';
import { CoreUploadValidator } from './CoreUploadValidator';

export interface StoredUploadFile {
  path: string;
  name: string;
  size: number;
  type: string;
}

export class CoreUploadService {
  public static readonly MULTER_TEMP_DIR = os.tmpdir();

  public static sanitizeFileName(fileName: string): string {
    return CoreUploadPolicy.sanitizeFileName(fileName);
  }

  public static async resolveUploadWorkspace(conversationId: string, requestedWorkspace?: string): Promise<string> {
    CoreUploadValidator.requireConversationId(conversationId);
    const conversationWorkspace = await CoreUploadRepository.getConversationWorkspace(conversationId);
    return CoreUploadPolicy.resolveConversationWorkspace(conversationWorkspace, requestedWorkspace);
  }

  public static async storeUploadedFile(params: {
    file: Express.Multer.File | undefined;
    conversationId?: string;
    requestedWorkspace?: string;
  }): Promise<StoredUploadFile> {
    const { conversationId = '', requestedWorkspace = '' } = params;
    const file = CoreUploadValidator.requireUploadedFile(params.file);
    const saveToWorkspace = await CoreUploadRepository.shouldSaveToWorkspace();
    const workspace = conversationId && saveToWorkspace
      ? await this.resolveUploadWorkspace(conversationId, requestedWorkspace)
      : undefined;
    const uploadDir = CoreUploadPolicy.selectUploadDir({
      cacheDir: CoreUploadRepository.getCacheDir(),
      conversationId,
      requestedWorkspace,
      saveToWorkspace,
      workspace,
    });
    await fsPromises.mkdir(uploadDir, { recursive: true });

    const safeFileName = this.sanitizeFileName(file.originalname);
    const initialTargetPath = path.join(uploadDir, safeFileName);
    let targetExists = true;

    try {
      await fsPromises.access(initialTargetPath);
    } catch {
      targetExists = false;
    }

    const targetPath = CoreUploadPolicy.buildDuplicateSafePath(uploadDir, safeFileName, targetExists);
    CoreUploadPolicy.assertPathInsideUploadDir(targetPath, uploadDir);
    const safeTempPath = CoreUploadPolicy.buildSafeTempPath(this.MULTER_TEMP_DIR, file.path);
    await fsPromises.rename(safeTempPath, targetPath);

    const storedFile = {
      path: targetPath,
      name: path.basename(targetPath),
      size: file.size,
      type: file.mimetype || 'application/octet-stream',
    };

    coreEventBus.emit('upload', 'upload.file.stored', {
      conversationId: conversationId || null,
      workspace: conversationId ? uploadDir : null,
      file: storedFile,
    });

    return storedFile;
  }

  public static async createUploadFile(params: {
    fileName: string;
    conversationId?: string;
    workspace?: string;
  }): Promise<StoredUploadFile> {
    const fileName = CoreUploadValidator.requireFileName(params.fileName);
    const conversationId = params.conversationId ?? '';
    const requestedWorkspace = params.workspace ?? '';
    const saveToWorkspace = await CoreUploadRepository.shouldSaveToWorkspace();
    const workspace =
      conversationId && saveToWorkspace
        ? await this.resolveUploadWorkspace(conversationId, requestedWorkspace)
        : undefined;
    const uploadDir = CoreUploadPolicy.selectUploadDir({
      cacheDir: CoreUploadRepository.getCacheDir(),
      conversationId,
      requestedWorkspace,
      saveToWorkspace,
      workspace,
    });

    await fsPromises.mkdir(uploadDir, { recursive: true });

    const safeFileName = this.sanitizeFileName(fileName);
    const initialTargetPath = path.join(uploadDir, safeFileName);
    let targetExists = true;

    try {
      await fsPromises.access(initialTargetPath);
    } catch {
      targetExists = false;
    }

    const targetPath = CoreUploadPolicy.buildDuplicateSafePath(uploadDir, safeFileName, targetExists);
    CoreUploadPolicy.assertPathInsideUploadDir(targetPath, uploadDir);
    await fsPromises.writeFile(targetPath, Buffer.alloc(0));

    const createdFile = {
      path: targetPath,
      name: path.basename(targetPath),
      size: 0,
      type: 'application/octet-stream',
    };

    coreEventBus.emit('upload', 'upload.file.stored', {
      conversationId: conversationId || null,
      workspace: conversationId ? uploadDir : null,
      file: createdFile,
    });

    return createdFile;
  }
}
