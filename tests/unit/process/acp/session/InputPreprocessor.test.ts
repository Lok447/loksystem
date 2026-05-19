// tests/unit/process/acp/session/InputPreprocessor.test.ts
import nodePath from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import { InputPreprocessor } from '@process/acp/session/InputPreprocessor';

function toExpectedResourceUri(filePath: string): string {
  return pathToFileURL(nodePath.resolve(filePath)).toString();
}

describe('InputPreprocessor', () => {
  it('returns text-only content when no files', () => {
    const pp = new InputPreprocessor(vi.fn());
    const result = pp.process('hello world');
    expect(result).toEqual([{ type: 'text', text: 'hello world' }]);
  });

  it('appends file items for provided files', () => {
    const readFile = vi.fn((path: string) => `content of ${path}`);
    const pp = new InputPreprocessor(readFile);
    const result = pp.process('check this', ['/foo/bar.ts']);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: 'text', text: 'check this' });
    expect(result[1]).toEqual({ type: 'text', text: '[File: /foo/bar.ts]\ncontent of /foo/bar.ts' });
  });

  it('keeps image uploads as resource links instead of inlining them', () => {
    const readFile = vi.fn();
    const pp = new InputPreprocessor(readFile);
    const result = pp.process('what is this image', ['/foo/demo.jpg']);

    expect(readFile).not.toHaveBeenCalled();
    expect(result).toEqual([
      { type: 'text', text: 'what is this image' },
      {
        type: 'resource_link',
        name: 'demo.jpg',
        uri: toExpectedResourceUri('/foo/demo.jpg'),
        mimeType: 'image/jpeg',
      },
    ]);
  });

  it('resolves @file references in text', () => {
    const readFile = vi.fn((path: string) => `content of ${path}`);
    const pp = new InputPreprocessor(readFile);
    const result = pp.process('review @/src/index.ts');
    expect(result.length).toBeGreaterThan(1);
    expect(result.some((item) => item.type === 'text' && 'text' in item && item.text.startsWith('[File:'))).toBe(true);
  });

  it('handles file read errors gracefully', () => {
    const readFile = vi.fn(() => {
      throw new Error('ENOENT');
    });
    const pp = new InputPreprocessor(readFile);
    const result = pp.process('check this', ['/nonexistent.ts']);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('text');
  });

  it('falls back to a resource link when a file content looks binary', () => {
    const readFile = vi.fn(() => '\u0000\u0001binary');
    const pp = new InputPreprocessor(readFile);
    const result = pp.process('check this', ['/foo/blob.bin']);

    expect(readFile).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { type: 'text', text: 'check this' },
      {
        type: 'resource_link',
        name: 'blob.bin',
        uri: toExpectedResourceUri('/foo/blob.bin'),
      },
    ]);
  });

  it('deduplicates uploaded files from @references', () => {
    const readFile = vi.fn((path: string) => `content of ${path}`);
    const pp = new InputPreprocessor(readFile);
    const result = pp.process('review @/src/index.ts', ['/src/index.ts']);
    // Should only read the file once (from uploaded files), not twice
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2); // text + 1 file
  });

  it('deduplicates by basename when uploaded file path differs', () => {
    const readFile = vi.fn((path: string) => `content of ${path}`);
    const pp = new InputPreprocessor(readFile);
    const result = pp.process('review @index.ts', ['/workspace/src/index.ts']);
    // @index.ts basename matches uploaded /workspace/src/index.ts — skip
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
  });

  it('resolves quoted @"path with spaces"', () => {
    const readFile = vi.fn((path: string) => `content of ${path}`);
    const pp = new InputPreprocessor(readFile);
    const result = pp.process('check @"my folder/file name.ts"');
    expect(readFile).toHaveBeenCalledWith('my folder/file name.ts');
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      type: 'text',
      text: '[File: my folder/file name.ts]\ncontent of my folder/file name.ts',
    });
  });

  it('deduplicates duplicate uploaded files', () => {
    const readFile = vi.fn((path: string) => `content of ${path}`);
    const pp = new InputPreprocessor(readFile);
    const result = pp.process('check', ['/a.ts', '/a.ts', '/b.ts']);
    expect(readFile).toHaveBeenCalledTimes(2); // /a.ts once + /b.ts once
    expect(result).toHaveLength(3); // text + 2 files
  });

  it('sends a balanced excerpt and resource link for very large text attachments', () => {
    const largeContent = [
      'BEGIN-IMPORTANT\n',
      'a'.repeat(40_000),
      '\nMIDDLE-IMPORTANT\n',
      'b'.repeat(40_000),
      '\nEND-IMPORTANT',
    ].join('');
    const readFile = vi.fn(() => largeContent);
    const pp = new InputPreprocessor(readFile);
    const result = pp.process('请分析附件重点提了哪些内容', ['/workspace/report.txt']);

    expect(result).toHaveLength(3);
    expect(result[1]).toMatchObject({ type: 'text' });
    const text = result[1].type === 'text' ? result[1].text : '';
    expect(text).toContain('To avoid ACP prompt timeout');
    expect(text).toContain('BEGIN-IMPORTANT');
    expect(text).toContain('MIDDLE-IMPORTANT');
    expect(text).toContain('END-IMPORTANT');
    expect(text.length).toBeLessThan(32_000);
    expect(result[2]).toEqual({
      type: 'resource_link',
      name: 'report.txt',
      uri: toExpectedResourceUri('/workspace/report.txt'),
    });
  });
});
