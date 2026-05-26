/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/adapter/ipcBridge';

export type CoreServiceModule = 'auth' | 'upload' | 'session' | 'task' | 'acp' | 'workspace';

export interface CoreServiceResponse<TData = Record<string, never>> {
  success: boolean;
  data?: TData;
  msg?: string;
}

export interface CoreRuntimeConfigDto {
  model?: string;
  thinking?: string;
  thinking_budget?: number;
  effort?: string;
}

export interface CoreWorkspaceQueryDto {
  conversationId: string;
  workspace: string;
  targetPath: string;
  search?: string;
}

export interface CoreWorkspaceSearchProgressDto {
  conversationId: string;
  workspace: string;
  result: {
    file: number;
    dir: number;
    match?: IDirOrFile;
  };
}
