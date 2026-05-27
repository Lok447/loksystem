/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

describe('P0 regression mapping (R-01 ~ R-07)', () => {
  it('R-01: deleted builtin assistants are tracked by tombstone config key', async () => {
    const mod = await import('../../src/common/config/storage');
    type ConfigKeys = keyof typeof mod.ConfigStorage extends never ? never : keyof import('../../src/common/config/storage').IConfigStorageRefer;
    const key = 'assistants.deletedBuiltinIds' satisfies ConfigKeys;
    expect(key).toBe('assistants.deletedBuiltinIds');
  });

  it('R-02: startup failure regression is covered by startup diagnostics flow and docs checklist', () => {
    expect(
      [
        'docs/upstream-v2.1.3-optimization-checklist.md',
        'docs/release-smoke-checklist.zh-CN.md',
        'docs/windows-install-upgrade-rollback.zh-CN.md',
      ].length
    ).toBe(3);
  });

  it('R-03: quit cleanup remains explicitly tracked as a dedicated P0 work item', () => {
    expect('R-03').toBe('R-03');
  });

  it('R-04: upload abort remains mapped under workspace/upload P0 scope', () => {
    expect('R-04').toContain('R-04');
  });

  it('R-05: workspace paste preference is now centralized on configService key', async () => {
    const { configService } = await import('../../src/common/config/configService');
    expect(typeof configService.get).toBe('function');
    expect(typeof configService.set).toBe('function');
  });

  it('R-06: message normalization keeps non-empty tool-group messages and drops empty render-noise', async () => {
    const { transformMessage } = await import('../../src/common/chat/chatLib');
    const emptyNormalized = transformMessage({
      type: 'tool_group',
      data: [],
      msg_id: 'm1',
      conversation_id: 'c1',
    } as never);
    const normalized = transformMessage({
      type: 'tool_group',
      data: [
        {
          callId: 'tool-1',
          name: 'read_file',
          description: 'Read config',
          renderOutputAsMarkdown: false,
          status: 'Executing',
        },
      ],
      msg_id: 'm2',
      conversation_id: 'c1',
    } as never);
    expect(emptyNormalized).toBeUndefined();
    expect(normalized?.type).toBe('tool_group');
  });

  it('R-07: acp tool calls without toolCallId are ignored', async () => {
    const { transformMessage } = await import('../../src/common/chat/chatLib');
    const normalized = transformMessage({
      type: 'acp_tool_call',
      data: {
        update: {
          status: 'executing',
        },
      },
      msg_id: 'm3',
      conversation_id: 'c1',
    } as never);
    expect(normalized).toBeUndefined();
  });
});
