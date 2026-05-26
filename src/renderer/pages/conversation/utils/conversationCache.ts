/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getRendererCoreClient } from '@/common/coreClient';
import type { TChatConversation } from '@/common/config/storage';
import { mutate } from 'swr';

export async function refreshConversationCache(conversationId: string): Promise<void> {
  const conversation = await getRendererCoreClient()
    .conversations.get(conversationId)
    .catch((): null => null);
  if (!conversation) return;

  await mutate<TChatConversation>(`conversation/${conversationId}`, conversation, false);
}
