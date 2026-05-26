/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreTaskRuntimeService } from '@process/core/tasks/CoreTaskRuntimeService';
import type { CoreRuntimeConfigDto } from '@process/core/shared/CoreContracts';

export class CoreSessionRuntimeService {
  constructor(private readonly taskRuntimeService: CoreTaskRuntimeService) {}

  public async resetConversation(id?: string): Promise<void> {
    await this.taskRuntimeService.resetConversation(id);
  }

  public async reloadContext(conversationId: string) {
    return this.taskRuntimeService.reloadContext(conversationId);
  }

  public async setConfig(
    conversationId: string,
    config: CoreRuntimeConfigDto
  ) {
    return this.taskRuntimeService.setRuntimeConfig(conversationId, config);
  }
}
