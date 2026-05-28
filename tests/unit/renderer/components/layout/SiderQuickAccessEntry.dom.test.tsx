import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';

vi.mock('@arco-design/web-react', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  Lightning: (props: Record<string, unknown>) => <span data-testid='quick-access-icon' {...props} />,
}));

import { Lightning } from '@icon-park/react';
import SiderQuickAccessEntry from '@/renderer/components/layout/Sider/SiderNav/SiderQuickAccessEntry';

const siderTooltipProps: SiderTooltipProps = {
  disabled: true,
};

describe('SiderQuickAccessEntry', () => {
  it('renders a consistent desktop quick entry row and forwards click events', () => {
    const onClick = vi.fn();

    render(
      <SiderQuickAccessEntry
        isMobile={false}
        isActive={false}
        collapsed={false}
        siderTooltipProps={siderTooltipProps}
        onClick={onClick}
        label='Quick Link'
        icon={<Lightning />}
      />
    );

    const entry = screen.getByText('Quick Link').closest('div');
    expect(entry).not.toBeNull();
    expect(entry?.className).toContain('box-border');

    fireEvent.click(entry as HTMLElement);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
