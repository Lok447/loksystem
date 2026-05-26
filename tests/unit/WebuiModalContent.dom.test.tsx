// @vitest-environment jsdom

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue || key,
  }),
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: vi.fn(async () => false),
    set: vi.fn(async () => undefined),
  },
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  shell: {
    openExternal: { invoke: vi.fn(async () => undefined) },
  },
  webui: {
    getStatus: {
      invoke: vi.fn(async () => ({
        success: true,
        data: {
          running: false,
          port: 3333,
          allowRemote: false,
          localUrl: 'http://localhost:3333',
          adminUsername: 'admin',
        },
      })),
    },
    start: { invoke: vi.fn(async () => ({ success: true })) },
    stop: { invoke: vi.fn(async () => ({ success: true })) },
    changePassword: { invoke: vi.fn(async () => ({ success: true })) },
    changeUsername: { invoke: vi.fn(async () => ({ success: true })) },
    generateQRToken: { invoke: vi.fn(async () => ({ success: true })) },
    statusChanged: { on: vi.fn(() => vi.fn()) },
    resetPasswordResult: { on: vi.fn(() => vi.fn()) },
  },
}));

vi.mock('@/renderer/components/base/LokScrollArea', () => ({
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/base/LokModal', () => ({
  default: ({ children, visible }: React.PropsWithChildren<{ visible?: boolean }>) =>
    visible ? <div>{children}</div> : null,
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'page',
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/channels/ChannelModalContent', () => ({
  default: () => <div>Channels content</div>,
}));

vi.mock('@icon-park/react', () => ({
  CheckOne: () => <span />,
  Communication: () => <span />,
  Copy: () => <span />,
  Earth: () => <span />,
  EditTwo: () => <span />,
  Refresh: () => <span />,
}));

vi.mock('@arco-design/web-react', () => {
  const FormComponent = ({ children }: React.PropsWithChildren) => <form>{children}</form>;
  return {
    Button: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) => (
      <button onClick={onClick}>{children}</button>
    ),
    Form: Object.assign(FormComponent, {
      Item: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
      useForm: () => [{ resetFields: vi.fn(), setFieldsValue: vi.fn(), validate: vi.fn() }],
    }),
    Input: Object.assign((props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />, {
      Password: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input type='password' {...props} />,
    }),
    Message: {
      error: vi.fn(),
      success: vi.fn(),
    },
    Switch: ({ checked }: { checked?: boolean }) => <input type='checkbox' checked={checked} readOnly />,
    Tabs: Object.assign(({ children }: React.PropsWithChildren) => <div>{children}</div>, {
      TabPane: ({ title }: { title: React.ReactNode }) => <div>{title}</div>,
    }),
    Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
  };
});

import WebuiModalContent from '@/renderer/components/settings/SettingsModal/contents/WebuiModalContent';

describe('WebuiModalContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as { electronAPI?: unknown }).electronAPI;
  });

  it('shows both WebUI and Channels tabs in browser runtime', async () => {
    const { container } = render(<WebuiModalContent />);

    expect(container.querySelector('[data-webui-tab="webui"]')).toBeInTheDocument();
    expect(container.querySelector('[data-webui-tab="channels"]')).toBeInTheDocument();
    expect(screen.getByText('settings.webui.description')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });
  });
});
