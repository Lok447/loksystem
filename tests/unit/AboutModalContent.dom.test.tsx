import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const mockWindowOpen = vi.fn(() => ({ closed: false }));

function MockButton({
  children,
  onClick,
}: React.PropsWithChildren<{ onClick?: () => void }>) {
  return <button onClick={onClick}>{children}</button>;
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue || key,
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
    Message: {
      error: vi.fn(),
      success: vi.fn(),
    },
  };

  return {
    Button: MockButton,
    Message: {
      error: vi.fn(),
      success: vi.fn(),
    },
    Typography,
  };
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

import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';

describe('AboutModalContent', () => {
  beforeEach(() => {
    mockWindowOpen.mockClear();
    window.open = mockWindowOpen as unknown as Window['open'];
  });

  it('renders two simple about actions and keeps contact info hidden by default', () => {
    render(<AboutModalContent />);

    expect(screen.getByAltText('LokSystem')).toBeInTheDocument();
    expect(screen.getByText('LokSystem')).toBeInTheDocument();
    expect(
      screen.getByText(
        'LokSystem is an AI-native collaboration workspace that connects local agents, team orchestration, WebUI delivery, and office-ready outputs in one place.'
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText('settings.contactMe')).toHaveLength(2);
    expect(screen.getAllByText('settings.officialWebsite')).toHaveLength(2);
    expect(screen.queryByText('13434766647')).not.toBeInTheDocument();
  });

  it('opens contact modal and triggers the website action', async () => {
    render(<AboutModalContent />);

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'settings.contactMe' })[0]);
    });

    expect(screen.getByText('Contact LokSystem')).toBeInTheDocument();
    expect(screen.getByText('13434766647')).toBeInTheDocument();
    expect(screen.getByAltText('LokSystem WeChat QR code')).toBeInTheDocument();
    expect(screen.getByText('Copy phone number')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'settings.officialWebsite' })[0]);
    });

    expect(mockWindowOpen).toHaveBeenCalledWith(
      new URL('./official-site/index.html', window.location.href.split('#')[0]).href,
      '_blank',
      'noopener,noreferrer'
    );
  });
});
