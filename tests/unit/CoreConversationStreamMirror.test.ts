import { beforeEach, describe, expect, it } from 'vitest';
import { mirrorConversationStreamMessage } from '@process/core/sessions';
import { coreEventBus } from '@process/core/shared/CoreEventBus';

describe('CoreConversationStreamMirror', () => {
  let events: Array<Parameters<Parameters<typeof coreEventBus.on>[0]>[0]>;
  let off: () => void;

  beforeEach(() => {
    events = [];
    off?.();
    off = coreEventBus.on((event) => events.push(event));
  });

  it('mirrors conversation response stream messages into core events', () => {
    mirrorConversationStreamMessage(
      {
        type: 'content',
        conversation_id: 'conv-1',
        msg_id: 'msg-1',
        data: 'hello',
      },
      'aionrs'
    );

    expect(events.at(-1)).toMatchObject({
      scope: 'conversation',
      type: 'conversation.stream.message',
      data: {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        messageType: 'content',
        source: 'aionrs',
        message: {
          type: 'content',
          conversation_id: 'conv-1',
          msg_id: 'msg-1',
          data: 'hello',
        },
      },
    });
  });
});
