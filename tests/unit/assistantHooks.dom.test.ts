/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const assistantServiceMock = vi.hoisted(() => ({
  listAssistants: vi.fn().mockResolvedValue([]),
}));

const configServiceMock = vi.hoisted(() => ({
  subscribe: vi.fn(() => vi.fn()),
}));

const coreClientMock = vi.hoisted(() => ({
  getAvailableAgents: vi.fn().mockResolvedValue({ success: true, data: [] }),
  refreshCustomAgents: vi.fn().mockResolvedValue(undefined),
}));

// IPC bridge mocks
const getAssistantsInvoke = vi.fn().mockResolvedValue([]);
const getAcpAdaptersInvoke = vi.fn().mockResolvedValue([]);
const getAvailableAgentsInvoke = vi.fn().mockResolvedValue({ success: true, data: [] });
const refreshCustomAgentsInvoke = vi.fn().mockResolvedValue({});
const detectAndCountExternalSkillsInvoke = vi.fn().mockResolvedValue({ success: true, data: [] });
const addCustomExternalPathInvoke = vi.fn().mockResolvedValue({ success: true });

vi.mock('../../src/common', () => ({
  ipcBridge: {
    extensions: {
      getAssistants: { invoke: (...args: unknown[]) => getAssistantsInvoke(...args) },
      getAcpAdapters: { invoke: (...args: unknown[]) => getAcpAdaptersInvoke(...args) },
    },
    acpConversation: {
      getAvailableAgents: { invoke: (...args: unknown[]) => getAvailableAgentsInvoke(...args) },
      refreshCustomAgents: { invoke: (...args: unknown[]) => refreshCustomAgentsInvoke(...args) },
    },
    fs: {
      detectAndCountExternalSkills: { invoke: (...args: unknown[]) => detectAndCountExternalSkillsInvoke(...args) },
      addCustomExternalPath: { invoke: (...args: unknown[]) => addCustomExternalPathInvoke(...args) },
    },
  },
}));

vi.mock('@/common/config/assistantService', () => ({
  assistantService: assistantServiceMock,
}));

vi.mock('@/common/config/configService', () => ({
  configService: configServiceMock,
}));

vi.mock('@/common/coreClient', () => ({
  getRendererCoreClient: () => ({
    acp: {
      getAvailableAgents: coreClientMock.getAvailableAgents,
      refreshCustomAgents: coreClientMock.refreshCustomAgents,
    },
  }),
}));

// Configuration storage mock
const configStorageGetMock = vi.fn().mockResolvedValue([]);
const configStorageSetMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/common/config/storage', () => ({
  ConfigStorage: {
    get: (...args: unknown[]) => configStorageGetMock(...args),
    set: (...args: unknown[]) => configStorageSetMock(...args),
  },
}));

// SWR mock
const swrFetchers = new Map<string, () => unknown>();

vi.mock('swr', () => {
  const swrDefault = vi.fn((key: string, fetcher: () => unknown) => {
    swrFetchers.set(key, fetcher);
    return { data: undefined, error: undefined, isLoading: false };
  });
  return {
    default: swrDefault,
    __esModule: true,
    mutate: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts?.defaultValue as string) ?? key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('../../src/common/utils', () => ({
  resolveLocaleKey: (lang: string) => lang,
}));

vi.mock('../../src/common/config/presets/assistantPresets', () => ({
  ASSISTANT_PRESETS: [
    { id: 'default', defaultEnabledSkills: [], skillFiles: {} },
    { id: 'coder', defaultEnabledSkills: ['code'], skillFiles: {} },
  ],
}));

vi.mock('../../src/renderer/utils/platform', () => ({
  resolveExtensionAssetUrl: (url: string) => url,
}));

import { useAssistantList } from '../../src/renderer/hooks/assistant/useAssistantList';
import { useDetectedAgents } from '../../src/renderer/hooks/assistant/useDetectedAgents';
import { useAssistantSkills } from '../../src/renderer/hooks/assistant/useAssistantSkills';
import type {
  ExternalSource,
  PendingSkill,
  SkillInfo,
} from '../../src/renderer/pages/settings/AssistantManagement/types';

describe('useAssistantList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configStorageGetMock.mockResolvedValue([]);
    assistantServiceMock.listAssistants.mockResolvedValue([]);
    configServiceMock.subscribe.mockReturnValue(vi.fn());
    getAssistantsInvoke.mockResolvedValue([]);
  });

  it('returns empty assistants and null activeAssistantId initially', async () => {
    const { result } = renderHook(() => useAssistantList());

    expect(result.current.assistants).toEqual([]);
    expect(result.current.activeAssistantId).toBeNull();
    expect(result.current.activeAssistant).toBeNull();
  });

  it('loadAssistants fetches from the configuration layer and populates the list', async () => {
    const storedAgents = [
      { id: 'builtin-coder', name: 'Coder', isPreset: true, isBuiltin: true, enabled: true },
      { id: 'builtin-default', name: 'Default', isPreset: true, isBuiltin: true, enabled: true },
    ];
    assistantServiceMock.listAssistants.mockResolvedValue(storedAgents);

    const { result } = renderHook(() => useAssistantList());

    await waitFor(() => {
      expect(result.current.assistants.length).toBe(2);
    });

    expect(result.current.assistants[0].id).toBe('builtin-default');
    expect(result.current.assistants[1].id).toBe('builtin-coder');
    expect(result.current.activeAssistantId).toBe('builtin-default');
  });

  it('activeAssistant is derived from activeAssistantId', async () => {
    const storedAgents = [
      { id: 'builtin-default', name: 'Default', isPreset: true, isBuiltin: true, enabled: true },
      { id: 'custom-1', name: 'My Agent', isPreset: true, isBuiltin: false, enabled: true },
    ];
    assistantServiceMock.listAssistants.mockResolvedValue(storedAgents);

    const { result } = renderHook(() => useAssistantList());

    await waitFor(() => {
      expect(result.current.assistants.length).toBe(2);
    });

    act(() => {
      result.current.setActiveAssistantId('custom-1');
    });

    expect(result.current.activeAssistant?.id).toBe('custom-1');
    expect(result.current.activeAssistant?.name).toBe('My Agent');
  });

  it('preserves activeAssistantId across reloads if it still exists', async () => {
    const storedAgents = [
      { id: 'builtin-default', name: 'Default', isPreset: true, isBuiltin: true, enabled: true },
      { id: 'custom-1', name: 'My Agent', isPreset: true, isBuiltin: false, enabled: true },
    ];
    assistantServiceMock.listAssistants.mockResolvedValue(storedAgents);

    const { result } = renderHook(() => useAssistantList());

    await waitFor(() => {
      expect(result.current.assistants.length).toBe(2);
    });

    act(() => {
      result.current.setActiveAssistantId('custom-1');
    });

    await act(async () => {
      await result.current.loadAssistants();
    });

    expect(result.current.activeAssistantId).toBe('custom-1');
  });

  it('isExtensionAssistant detects extension-sourced assistants', async () => {
    const { result } = renderHook(() => useAssistantList());

    const extAssistant = { id: 'ext-buddy', name: 'Buddy', _source: 'extension', isPreset: true, enabled: true };
    const normalAssistant = { id: 'custom-1', name: 'Custom', isPreset: true, enabled: true };

    expect(result.current.isExtensionAssistant(extAssistant)).toBe(true);
    expect(result.current.isExtensionAssistant(normalAssistant)).toBe(false);
    expect(result.current.isExtensionAssistant(null)).toBe(false);
  });

  it('extension assistant is editable (not readonly)', async () => {
    const storedAgents = [
      { id: 'ext-buddy', name: 'Buddy', _source: 'extension', isPreset: true, isBuiltin: false, enabled: true },
    ];
    assistantServiceMock.listAssistants.mockResolvedValue(storedAgents);

    const { result } = renderHook(() => useAssistantList());

    await waitFor(() => {
      expect(result.current.assistants.length).toBe(1);
    });

    expect(result.current.isExtensionAssistant(result.current.assistants[0])).toBe(true);
  });

  it('handles configuration storage errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    assistantServiceMock.listAssistants.mockRejectedValue(new Error('storage failure'));

    const { result } = renderHook(() => useAssistantList());

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load assistant presets:', expect.objectContaining({}));
    });

    expect(result.current.assistants).toEqual([]);
    consoleSpy.mockRestore();
  });
});

describe('useDetectedAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    coreClientMock.getAvailableAgents.mockResolvedValue({ success: true, data: [] });
    coreClientMock.refreshCustomAgents.mockResolvedValue(undefined);
  });

  it('initializes with empty availableBackends before SWR resolves', () => {
    const { result } = renderHook(() => useDetectedAgents());

    expect(result.current.availableBackends).toEqual([]);
  });

  it('refreshAgentDetection calls refreshCustomAgents', async () => {
    const { result } = renderHook(() => useDetectedAgents());

    await act(async () => {
      await result.current.refreshAgentDetection();
    });

    expect(coreClientMock.refreshCustomAgents).toHaveBeenCalledOnce();
  });

  it('refreshAgentDetection handles errors silently', async () => {
    coreClientMock.refreshCustomAgents.mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useDetectedAgents());

    await act(async () => {
      await result.current.refreshAgentDetection();
    });
  });

  it('SWR fetcher returns normalized agents and hook filtering is based on current backend policy', async () => {
    coreClientMock.getAvailableAgents.mockResolvedValue({
      success: true,
      data: [
        { backend: 'gemini', name: 'Gemini' },
        { backend: 'claude', name: 'Claude' },
        { backend: 'auggie', name: 'Auggie', isExtension: true },
        { backend: 'custom', name: 'Custom' },
        { backend: 'remote', name: 'Remote' },
      ],
    });

    renderHook(() => useDetectedAgents());

    const fetcher = swrFetchers.get('agents.detected');
    expect(fetcher).toBeDefined();

    const result = await fetcher!();
    expect(result).toHaveLength(5);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backend: 'gemini',
          name: 'Gemini',
          displayName: 'Gemini',
          available: true,
          teamCapable: false,
          conversationType: 'gemini',
        }),
        expect.objectContaining({
          backend: 'claude',
          name: 'Claude',
          displayName: 'Claude',
          available: true,
          teamCapable: false,
          conversationType: 'acp',
        }),
        expect.objectContaining({
          backend: 'auggie',
          name: 'Auggie',
          isExtension: true,
          displayName: 'Auggie',
          available: true,
          teamCapable: false,
          conversationType: 'acp',
        }),
        expect.objectContaining({
          backend: 'custom',
          name: 'Custom',
          displayName: 'Custom',
          available: true,
          teamCapable: false,
          conversationType: 'acp',
        }),
        expect.objectContaining({
          backend: 'remote',
          name: 'Remote',
          displayName: 'Remote',
          available: true,
          teamCapable: false,
          conversationType: 'remote',
        }),
      ])
    );
  });
});

describe('useAssistantSkills', () => {
  const mockMessage = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    normal: vi.fn(),
    clear: vi.fn(),
  };

  const defaultParams = {
    skillsModalVisible: false,
    customSkills: [] as string[],
    selectedSkills: [] as string[],
    pendingSkills: [] as PendingSkill[],
    availableSkills: [] as SkillInfo[],
    setPendingSkills: vi.fn(),
    setCustomSkills: vi.fn(),
    setSelectedSkills: vi.fn(),
    message: mockMessage as unknown as ReturnType<typeof import('@arco-design/web-react').Message.useMessage>[0],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    detectAndCountExternalSkillsInvoke.mockResolvedValue({ success: true, data: [] });
  });

  it('initializes with empty external sources and no active tab', () => {
    const { result } = renderHook(() => useAssistantSkills(defaultParams));

    expect(result.current.externalSources).toEqual([]);
    expect(result.current.activeSourceTab).toBe('');
    expect(result.current.searchExternalQuery).toBe('');
    expect(result.current.filteredExternalSkills).toEqual([]);
    expect(result.current.externalSkillsLoading).toBe(false);
  });

  it('handleRefreshExternal calls ipcBridge and updates sources', async () => {
    const sources: ExternalSource[] = [
      {
        name: 'Local',
        path: '/skills',
        source: 'local',
        skills: [{ name: 'web-search', description: 'Search the web', path: '/skills/web-search' }],
      },
    ];
    detectAndCountExternalSkillsInvoke.mockResolvedValue({ success: true, data: sources });

    const { result } = renderHook(() => useAssistantSkills(defaultParams));

    await act(async () => {
      await result.current.handleRefreshExternal();
    });

    expect(detectAndCountExternalSkillsInvoke).toHaveBeenCalledOnce();
    expect(result.current.externalSources).toEqual(sources);
    expect(result.current.activeSourceTab).toBe('local');
  });

  it('triggers handleRefreshExternal when skillsModalVisible becomes true', async () => {
    detectAndCountExternalSkillsInvoke.mockResolvedValue({ success: true, data: [] });

    const { rerender } = renderHook(
      (props: { visible: boolean }) => useAssistantSkills({ ...defaultParams, skillsModalVisible: props.visible }),
      { initialProps: { visible: false } }
    );

    rerender({ visible: true });

    await waitFor(() => {
      expect(detectAndCountExternalSkillsInvoke).toHaveBeenCalled();
    });
  });

  it('filteredExternalSkills filters by searchExternalQuery', async () => {
    const sources: ExternalSource[] = [
      {
        name: 'Local',
        path: '/skills',
        source: 'local',
        skills: [
          { name: 'web-search', description: 'Search the web', path: '/skills/web-search' },
          { name: 'file-reader', description: 'Read files', path: '/skills/file-reader' },
          { name: 'web-scraper', description: 'Scrape websites', path: '/skills/web-scraper' },
        ],
      },
    ];
    detectAndCountExternalSkillsInvoke.mockResolvedValue({ success: true, data: sources });

    const { result } = renderHook(() => useAssistantSkills(defaultParams));

    await act(async () => {
      await result.current.handleRefreshExternal();
    });

    expect(result.current.filteredExternalSkills.length).toBe(3);

    act(() => {
      result.current.setSearchExternalQuery('web');
    });

    expect(result.current.filteredExternalSkills.length).toBe(2);
    expect(result.current.filteredExternalSkills.map((s) => s.name)).toEqual(['web-search', 'web-scraper']);
  });

  it('filteredExternalSkills matches description as well', async () => {
    const sources: ExternalSource[] = [
      {
        name: 'Local',
        path: '/skills',
        source: 'local',
        skills: [
          { name: 'alpha', description: 'Search the web', path: '/skills/alpha' },
          { name: 'beta', description: 'Read files', path: '/skills/beta' },
        ],
      },
    ];
    detectAndCountExternalSkillsInvoke.mockResolvedValue({ success: true, data: sources });

    const { result } = renderHook(() => useAssistantSkills(defaultParams));

    await act(async () => {
      await result.current.handleRefreshExternal();
    });

    act(() => {
      result.current.setSearchExternalQuery('files');
    });

    expect(result.current.filteredExternalSkills.length).toBe(1);
    expect(result.current.filteredExternalSkills[0].name).toBe('beta');
  });

  it('handleRefreshExternal handles errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    detectAndCountExternalSkillsInvoke.mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useAssistantSkills(defaultParams));

    await act(async () => {
      await result.current.handleRefreshExternal();
    });

    expect(result.current.externalSkillsLoading).toBe(false);
    expect(result.current.refreshing).toBe(false);
    consoleSpy.mockRestore();
  });

  it('handleAddFoundSkills adds new skills and calls setPendingSkills', () => {
    const setPendingSkills = vi.fn();
    const setCustomSkills = vi.fn();
    const setSelectedSkills = vi.fn();

    const { result } = renderHook(() =>
      useAssistantSkills({
        ...defaultParams,
        setPendingSkills,
        setCustomSkills,
        setSelectedSkills,
        customSkills: ['existing-skill'],
        availableSkills: [],
        pendingSkills: [],
        selectedSkills: ['existing-skill'],
      })
    );

    act(() => {
      result.current.handleAddFoundSkills([
        { name: 'new-skill', description: 'A new skill', path: '/skills/new-skill' },
        { name: 'existing-skill', description: 'Already there', path: '/skills/existing-skill' },
      ]);
    });

    expect(setPendingSkills).toHaveBeenCalledWith([
      { name: 'new-skill', description: 'A new skill', path: '/skills/new-skill' },
    ]);
    expect(setCustomSkills).toHaveBeenCalledWith(['existing-skill', 'new-skill']);
    expect(setSelectedSkills).toHaveBeenCalledWith(['existing-skill', 'new-skill']);
    expect(mockMessage.success).toHaveBeenCalled();
  });

  it('handleAddFoundSkills shows warning when all skills already exist', () => {
    const { result } = renderHook(() =>
      useAssistantSkills({
        ...defaultParams,
        customSkills: ['skill-a'],
      })
    );

    act(() => {
      result.current.handleAddFoundSkills([{ name: 'skill-a', description: 'Dup', path: '/p' }]);
    });

    expect(mockMessage.warning).toHaveBeenCalled();
  });
});
