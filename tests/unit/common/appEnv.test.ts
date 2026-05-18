import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({ paths: { isPackaged: () => false } }),
}));

describe('common/appEnv', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('appends -dev suffix in dev builds', async () => {
    const { getEnvAwareName } = await import('../../../src/common/config/appEnv');
    expect(getEnvAwareName('.loksystem')).toBe('.loksystem-dev');
    expect(getEnvAwareName('.loksystem-config')).toBe('.loksystem-config-dev');
  });

  it('returns baseName unchanged in release builds', async () => {
    vi.doMock('@/common/platform', () => ({
      getPlatformServices: () => ({ paths: { isPackaged: () => true } }),
    }));
    const { getEnvAwareName } = await import('../../../src/common/config/appEnv');
    expect(getEnvAwareName('.loksystem')).toBe('.loksystem');
    expect(getEnvAwareName('.loksystem-config')).toBe('.loksystem-config');
  });
});
