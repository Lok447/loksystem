import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const mockOpenExternalUrl = vi.fn(() => Promise.resolve());

const MockButton = ({
  children,
  onClick,
}: React.PropsWithChildren<{ onClick?: () => void }>) => <button onClick={onClick}>{children}</button>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@icon-park/react', () => ({
  Earth: () => <span data-testid='icon-earth' />,
  Mail: () => <span data-testid='icon-mail' />,
}));

vi.mock('@arco-design/web-react', () => {
  const Typography = {
    Title: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Text: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  };

  return { Button: MockButton, Typography };
});

vi.mock('@/renderer/components/base/LokModal', () => ({
  default: ({
    children,
    visible,
    title,
  }: React.PropsWithChildren<{ visible?: boolean; title?: React.ReactNode }>) =>
    visible ? (
      <div>
        <div>{title}</div>
        {children}
      </div>
    ) : null,
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'page',
}));

vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: (...args: unknown[]) => mockOpenExternalUrl(...args),
}));

import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';

describe('AboutModalContent', () => {
  it('renders two simple about actions and keeps contact info hidden by default', () => {
    render(<AboutModalContent />);

    expect(screen.getByAltText('LokSystem')).toBeInTheDocument();
    expect(screen.getByText('LokSystem')).toBeInTheDocument();
    expect(
      screen.getByText('LokSystem 全新 AI 原生协同平台，打通人机协作壁垒，依托智能体能力赋能团队高效协作。')
    ).toBeInTheDocument();
    expect(screen.getAllByText('settings.contactMe')).toHaveLength(2);
    expect(screen.getAllByText('settings.officialWebsite')).toHaveLength(2);
    expect(screen.queryByText('13434766647')).not.toBeInTheDocument();
  });

  it('opens contact modal and triggers the phone and website actions', async () => {
    render(<AboutModalContent />);

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'settings.contactMe' })[0]);
    });

    expect(screen.getByText('联系我')).toBeInTheDocument();
    expect(screen.getByText('13434766647')).toBeInTheDocument();
    expect(screen.getByAltText('LokSystem 微信二维码')).toBeInTheDocument();
    expect(screen.getByText('立即联系')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'settings.officialWebsite' })[0]);
    });

    expect(mockOpenExternalUrl).toHaveBeenCalledWith(new URL('official-site/index.html', window.location.href).href);
  });
});
