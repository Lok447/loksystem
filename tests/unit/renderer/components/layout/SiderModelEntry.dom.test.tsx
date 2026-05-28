import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  LinkCloud: () => <span data-testid='link-cloud-icon' />,
}));

import SiderModelEntry from '@/renderer/components/layout/Sider/SiderNav/SiderModelEntry';

const siderTooltipProps: SiderTooltipProps = {
  disabled: true,
};

describe('SiderModelEntry', () => {
  it('uses border-box sizing for the full-width desktop row and triggers navigation click', () => {
    const onClick = vi.fn();

    render(
      <SiderModelEntry
        isMobile={false}
        isActive={false}
        collapsed={false}
        siderTooltipProps={siderTooltipProps}
        onClick={onClick}
      />
    );

    const entry = screen.getByText('模型管理').closest('div');
    expect(entry).not.toBeNull();
    expect(entry?.className).toContain('box-border');

    fireEvent.click(entry as HTMLElement);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
