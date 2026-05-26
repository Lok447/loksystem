import { beforeEach, describe, expect, it } from 'vitest';
import { mirrorAcpStreamMessage } from '@process/core/acp';
import { coreEventBus } from '@process/core/shared/CoreEventBus';

describe('CoreAcpStreamMirror', () => {
  let events: Array<Parameters<Parameters<typeof coreEventBus.on>[0]>[0]>;
  let off: () => void;

  beforeEach(() => {
    events = [];
    off?.();
    off = coreEventBus.on((event) => events.push(event));
  });

  it('mirrors ACP response stream messages into core events', () => {
    mirrorAcpStreamMessage(
      {
        type: 'content',
        conversation_id: 'conv-1',
        msg_id: 'msg-1',
        data: { text: 'hello' },
      },
      'acp'
    );

    expect(events.at(-1)).toMatchObject({
      scope: 'acp',
      type: 'acp.stream.message',
      data: {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        messageType: 'content',
        source: 'acp',
      },
    });
  });
});
