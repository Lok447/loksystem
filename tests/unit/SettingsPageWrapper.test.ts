import { describe, it, expect } from 'vitest';
import { getBuiltinSettingsNavItems } from '@/renderer/pages/settings/components/SettingsPageWrapper';

const t = (key: string, options?: { defaultValue?: string }) => {
  const labels: Record<string, string> = {
    'settings.model': '模型管理',
    'settings.assistants': '助手中心',
    'settings.agents': '智能体管理',
    'settings.capabilities': '技能管理',
    'settings.display': '显示',
    'settings.webui': '远程管理',
    'settings.system': '系统管理',
    'settings.about': '关于',
  };

  return labels[key] ?? options?.defaultValue ?? key;
};

describe('getBuiltinSettingsNavItems', () => {
  it('returns mobile settings tabs in the same order as desktop sider', () => {
    const items = getBuiltinSettingsNavItems(false, t);

    expect(items.map((item) => item.id)).toEqual([
      'agent',
      'model',
      'capabilities',
      'assistants',
      'webui',
      'system',
      'about',
    ]);

    expect(items.map((item) => item.label)).toEqual([
      '智能体管理',
      '模型管理',
      '技能管理',
      '助手中心',
      '远程管理',
      '系统管理',
      '关于',
    ]);
  });

  it('keeps the webui route stable for mobile and desktop nav variants', () => {
    expect(getBuiltinSettingsNavItems(false, t).find((item) => item.id === 'webui')?.path).toBe('webui');
    expect(getBuiltinSettingsNavItems(true, t).find((item) => item.id === 'webui')?.path).toBe('webui');
  });
});
