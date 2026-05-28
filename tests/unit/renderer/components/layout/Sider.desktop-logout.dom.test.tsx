import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLogout = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ logout: mockLogout, status: 'authenticated' }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({ closePreview: vi.fn() }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light', setTheme: vi.fn() }),
}));

vi.mock('@/renderer/pages/cron/useCronJobs', () => ({
  useAllCronJobs: () => ({ jobs: [] }),
}));

vi.mock('@/renderer/utils/ui/siderTooltip', () => ({
  cleanupSiderTooltips: vi.fn(),
  getSiderTooltipProps: () => ({ disabled: true }),
}));

vi.mock('@/renderer/utils/ui/focus', () => ({
  blurActiveElement: vi.fn(),
}));

vi.mock('@/renderer/components/layout/Sider/SiderNav/SiderToolbar', () => ({
  default: () => <div data-testid='sider-toolbar' />,
}));

vi.mock('@/renderer/components/layout/Sider/SiderNav/SiderSearchEntry', () => ({
  default: () => <div data-testid='sider-search-entry' />,
}));

vi.mock('@/renderer/components/layout/Sider/SiderNav/SiderModelEntry', () => ({
  default: () => <div data-testid='sider-model-entry' />,
}));

vi.mock('@/renderer/components/layout/Sider/SiderNav/SiderAgentEntry', () => ({
  default: () => <div data-testid='sider-agent-entry' />,
}));

vi.mock('@/renderer/components/layout/Sider/SiderNav/SiderCapabilitiesEntry', () => ({
  default: () => <div data-testid='sider-capabilities-entry' />,
}));

vi.mock('@/renderer/components/layout/Sider/SiderNav/SiderAssistantsEntry', () => ({
  default: () => <div data-testid='sider-assistants-entry' />,
}));

vi.mock('@/renderer/components/layout/Sider/SiderNav/SiderWebuiEntry', () => ({
  default: () => <div data-testid='sider-webui-entry' />,
}));

vi.mock('@/renderer/components/layout/Sider/SiderNav/SiderScheduledEntry', () => ({
  default: () => <div data-testid='sider-scheduled-entry' />,
}));

vi.mock('@/renderer/components/layout/Sider/CronJobSiderSection', () => ({
  default: () => <div data-testid='cron-job-section' />,
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory', () => ({
  default: () => <div data-testid='workspace-grouped-history' />,
}));

vi.mock('@/renderer/pages/team/hooks/useTeamList', () => ({
  useTeamList: () => ({ teams: [], mutate: vi.fn(), removeTeam: vi.fn() }),
}));

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, mutate: vi.fn() })),
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/common', () => ({
  ipcBridge: { team: { renameTeam: { invoke: vi.fn() } } },
}));

vi.mock('@/renderer/pages/team/components/TeamCreateModal', () => ({
  default: () => null,
}));

import Sider from '@/renderer/components/layout/Sider';

describe('Sider desktop logout action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as { electronAPI?: unknown }).electronAPI = {
      desktopAuthLogout: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('shows logout entry and triggers logout in desktop mode', async () => {
    render(
      <MemoryRouter initialEntries={['/guid']}>
        <Sider />
      </MemoryRouter>
    );

    const logoutEntry = await screen.findByText('settings.googleLogout');
    expect(logoutEntry).toBeInTheDocument();

    fireEvent.click(logoutEntry);

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
