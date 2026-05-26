/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { coreEventBus } from '@process/core/shared/CoreEventBus';
import type { CoreAcpStreamEventDto } from '@process/core/shared/CoreContracts';

export function mirrorAcpStreamMessage(
  message: IResponseMessage,
  source: CoreAcpStreamEventDto['source'] = 'unknown'
): void {
  coreEventBus.emit('acp', 'acp.stream.message', {
    conversationId: message.conversation_id,
    messageId: message.msg_id,
    messageType: message.type,
    hidden: message.hidden,
    source,
    message,
  });
}
