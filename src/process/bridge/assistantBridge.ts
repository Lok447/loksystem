/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { assistantService } from '@/common/config/assistantService';
import type { AcpBackendConfig } from '@/common/types/acpTypes';

export function initAssistantBridge(): void {
  ipcBridge.assistant.list.provider(async () => {
    return assistantService.listAssistants();
  });

  ipcBridge.assistant.save.provider(async (assistants) => {
    try {
      const normalized = await assistantService.saveAssistants(assistants);
      ipcBridge.assistant.changed.emit({ assistants: normalized });
      ipcBridge.config.changed.emit({ key: 'assistants', value: normalized });
      return {
        success: true,
        data: {
          assistants: normalized,
        },
      };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
