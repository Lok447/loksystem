/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { CoreConversationStreamEventDto } from '@process/core/shared/CoreContracts';
import { coreEventBus } from '@process/core/shared/CoreEventBus';

export function mirrorConversationStreamMessage(
  message: IResponseMessage,
  source: CoreConversationStreamEventDto['source'] = 'unknown'
): void {
  coreEventBus.emit('conversation', 'conversation.stream.message', {
    conversationId: message.conversation_id,
    messageId: message.msg_id,
    messageType: message.type,
    hidden: message.hidden,
    source,
    message,
  });
}
