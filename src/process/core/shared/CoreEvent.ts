/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CoreRuntimeConfigDto, CoreWorkspaceSearchProgressDto } from './CoreContracts';

export type CoreEventScope = 'auth' | 'upload' | 'session' | 'task' | 'acp' | 'workspace';

export interface CoreEventPayloadMap {
  'auth.session.updated': {
    action: 'login' | 'logout' | 'password_changed' | 'token_refreshed';
    userId?: string;
    username?: string;
  };
  'upload.file.stored': {
    conversationId: string | null;
    workspace: string | null;
    file: {
      path: string;
      name: string;
      size: number;
      type: string;
    };
  };
  'session.created': {
    conversationId: string;
    source?: string;
    type?: string;
    workspace?: string;
    sourceConversationId?: string;
    migrated?: boolean;
  };
  'session.updated': {
    action?: 'updated' | 'deleted' | 'migrated';
    conversationId: string;
    source?: string;
    targetConversationId?: string;
    updates?: unknown;
  };
  'task.runtime.updated': {
    action: 'killed' | 'stopped' | 'message_sent' | 'confirmation_submitted' | 'config_updated';
    conversationId: string;
    reason?: string;
    status?: string;
    fileCount?: number;
    msgId?: string;
    callId?: string;
    config?: CoreRuntimeConfigDto;
  };
  'acp.session.updated': {
    action: string;
    conversationId: string;
    [key: string]: unknown;
  };
  'workspace.search.progress': CoreWorkspaceSearchProgressDto;
}

export type CoreEventType = keyof CoreEventPayloadMap;

export interface CoreEventEnvelope<TType extends CoreEventType = CoreEventType> {
  type: TType;
  scope: CoreEventScope;
  timestamp: number;
  data: CoreEventPayloadMap[TType];
}
