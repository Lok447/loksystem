/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { getRendererCoreClient } from '@/common/coreClient';
import type { CoreAcpStreamEventDto, CoreConversationStreamEventDto } from '@process/core/shared/CoreContracts';

export function subscribeCoreConversationResponseStream(
  listener: (message: IResponseMessage) => void
): () => void {
  return getRendererCoreClient().events.subscribe((event) => {
    if (event.type !== 'conversation.stream.message') {
      return;
    }

    const data = event.data as CoreConversationStreamEventDto;
    listener(data.message);
  });
}

export function subscribeCoreAcpResponseStream(listener: (message: IResponseMessage) => void): () => void {
  return getRendererCoreClient().events.subscribe((event) => {
    if (event.type !== 'acp.stream.message') {
      return;
    }

    const data = event.data as CoreAcpStreamEventDto;
    listener(data.message);
  });
}
