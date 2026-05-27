import { ipcBridge } from '@/common';
import { isSideQuestionSupported } from '@/common/chat/sideQuestion';
import { getRendererCoreClient } from '@/common/coreClient';
import { configService } from '@/common/config/configService';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { AcpBackend, AcpModelInfo, AcpSessionModes } from '@/common/types/acpTypes';
import { uuid } from '@/common/utils';
import AcpConfigSelector from '@/renderer/components/agent/AcpConfigSelector';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';
import ContextUsageIndicator from '@/renderer/components/agent/ContextUsageIndicator';
import CommandQueuePanel from '@/renderer/components/chat/CommandQueuePanel';
import SendBox from '@/renderer/components/chat/sendbox';
import type { MobileActionSheetEntry } from '@/renderer/components/chat/MobileActionSheet';
import ThoughtDisplay from '@/renderer/components/chat/ThoughtDisplay';
import FileAttachButton from '@/renderer/components/media/FileAttachButton';
import FilePreview from '@/renderer/components/media/FilePreview';
import HorizontalFileList from '@/renderer/components/media/HorizontalFileList';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import { getSendBoxDraftHook, type FileOrFolderItem } from '@/renderer/hooks/chat/useSendBoxDraft';
import { createSetUploadFile, useSendBoxFiles } from '@/renderer/hooks/chat/useSendBoxFiles';
import { useSlashCommands } from '@/renderer/hooks/chat/useSlashCommands';
import { useOpenFileSelector } from '@/renderer/hooks/file/useOpenFileSelector';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
import { assertBridgeSuccess } from '@/renderer/pages/conversation/platforms/assertBridgeSuccess';
import {
  shouldEnqueueConversationCommand,
  useConversationCommandQueue,
  type ConversationCommandQueueItem,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import { allSupportedExts } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/styles/colors';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { mergeFileSelectionItems } from '@/renderer/utils/file/fileSelection';
import { buildDisplayMessage } from '@/renderer/utils/file/messageFiles';
import { getAgentModes, type AgentModeOption } from '@/renderer/utils/model/agentModes';
import { Tag } from '@arco-design/web-react';
import { Shield } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAcpInitialMessage } from './useAcpInitialMessage';
import { useAcpMessage } from './useAcpMessage';

const useAcpSendBoxDraft = getSendBoxDraftHook('acp', {
  _type: 'acp',
  atPath: [],
  content: '',
  uploadFile: [],
});

const EMPTY_AT_PATH: Array<string | FileOrFolderItem> = [];
const EMPTY_UPLOAD_FILES: string[] = [];

const useSendBoxDraft = (conversation_id: string) => {
  const { data, mutate } = useAcpSendBoxDraft(conversation_id);
  const atPath = data?.atPath ?? EMPTY_AT_PATH;
  const uploadFile = data?.uploadFile ?? EMPTY_UPLOAD_FILES;
  const content = data?.content ?? '';

  const setAtPath = useCallback(
    (nextAtPath: Array<string | FileOrFolderItem>) => {
      mutate((prev) => ({ ...prev, atPath: nextAtPath }));
    },
    [data, mutate]
  );

  const setUploadFile = createSetUploadFile(mutate, data);

  const setContent = useCallback(
    (nextContent: string) => {
      mutate((prev) => ({ ...prev, content: nextContent }));
    },
    [data, mutate]
  );

  return {
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
    content,
    setContent,
  };
};

const AcpSendBox: React.FC<{
  conversation_id: string;
  backend: AcpBackend;
  sessionMode?: string;
  cachedConfigOptions?: import('@/common/types/acpTypes').AcpSessionConfigOption[];
  agentName?: string;
  workspacePath?: string;
  teamId?: string;
  agentSlotId?: string;
}> = ({
  conversation_id,
  backend,
  sessionMode,
  cachedConfigOptions,
  agentName,
  workspacePath,
  teamId,
  agentSlotId,
}) => {
  const {
    running,
    hasHydratedRunningState,
    acpStatus,
    aiProcessing,
    setAiProcessing,
    resetState,
    tokenUsage,
    contextLimit,
    hasThinkingMessage,
  } = useAcpMessage(conversation_id);
  const { t } = useTranslation();
  const teamPermission = useTeamPermission();
  // In team mode, all agents show the permission mode selector (members don't propagate)
  const showModeSelector = true;
  const isLeaderInTeam = teamPermission && conversation_id === teamPermission.leaderConversationId;
  const { checkAndUpdateTitle } = useAutoTitle();
  const slashCommands = useSlashCommands(conversation_id, { agentStatus: acpStatus, deferUntilReady: true });
  const { atPath, uploadFile, setAtPath, setUploadFile, content, setContent } = useSendBoxDraft(conversation_id);
  const { setSendBoxHandler } = usePreviewContext();
  const [mobileModeOptions, setMobileModeOptions] = useState<AgentModeOption[]>([]);
  const [mobileModelInfo, setMobileModelInfo] = useState<import('@/common/types/acpTypes').AcpModelInfo | null>(null);

  // Use useLatestRef to keep latest setters to avoid re-registering handler
  const setContentRef = useLatestRef(setContent);
  const atPathRef = useLatestRef(atPath);

  const addOrUpdateMessage = useAddOrUpdateMessage(); // Move this here so it's available in useEffect
  const addOrUpdateMessageRef = useLatestRef(addOrUpdateMessage);

  // Shared file handling logic
  const { handleFilesAdded, clearFiles } = useSendBoxFiles({
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
  });
  const isBusy = running || aiProcessing;

  // Register handler for adding text from preview panel to sendbox
  useEffect(() => {
    const handler = (text: string) => {
      // If there's existing content, add newline and new text; otherwise just set the text
      const newContent = content ? `${content}\n${text}` : text;
      setContentRef.current(newContent);
    };
    setSendBoxHandler(handler);
  }, [setSendBoxHandler, content]);

  // Listen for sendbox.fill event to populate input from external sources
  useAddEventListener(
    'sendbox.fill',
    (text: string) => {
      setContentRef.current(text);
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    const loadCachedModes = async (): Promise<void> => {
      const cachedModes = await configService.get('acp.cachedModes').catch((): undefined => undefined);
      const sessionModes = cachedModes?.[backend];
      if (!cancelled && sessionModes?.availableModes?.length) {
        setMobileModeOptions(
          (sessionModes as AcpSessionModes).availableModes!.map((mode): AgentModeOption => ({
            value: mode.id,
            label: mode.name ?? mode.id,
          }))
        );
      } else if (!cancelled) {
        setMobileModeOptions(getAgentModes(backend));
      }
    };

    const loadModelInfo = async (): Promise<void> => {
      try {
        const result = await ipcBridge.acpConversation.getModelInfo.invoke({ conversationId: conversation_id });
        if (!cancelled && result.success && result.data?.modelInfo) {
          setMobileModelInfo(result.data.modelInfo);
          return;
        }
      } catch {
        // ignore
      }

      const cachedModels = await configService.get('acp.cachedModels').catch((): undefined => undefined);
      if (!cancelled) {
        setMobileModelInfo((cachedModels?.[backend] as AcpModelInfo | undefined) ?? null);
      }
    };

    void Promise.all([loadCachedModes(), loadModelInfo()]);

    const unsubscribe = ipcBridge.acpConversation.responseStream.on((message: IResponseMessage) => {
      if (message.conversation_id !== conversation_id || message.type !== 'acp_model_info' || !message.data) {
        return;
      }
      setMobileModelInfo(message.data as import('@/common/types/acpTypes').AcpModelInfo);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [backend, conversation_id]);

  // Check for and send initial message from guid page
  useAcpInitialMessage({
    conversationId: conversation_id,
    backend,
    workspacePath,
    setAiProcessing,
    checkAndUpdateTitle,
    addOrUpdateMessage: addOrUpdateMessageRef.current,
  });

  const executeCommand = useCallback(
    async ({ input, files }: Pick<ConversationCommandQueueItem, 'input' | 'files'>) => {
      const msg_id = uuid();
      const displayMessage = buildDisplayMessage(input, files, workspacePath || '');

      setAiProcessing(true);

      try {
        void checkAndUpdateTitle(conversation_id, input);
        if (teamId) {
          if (agentSlotId) {
            const result = await getRendererCoreClient().teams.sendMessageToAgent({
              teamId,
              slotId: agentSlotId,
              content: displayMessage,
              files,
            });
            assertBridgeSuccess(result, 'Failed to send message to agent');
          } else {
            const result = await getRendererCoreClient().teams.sendMessage({ teamId, content: displayMessage, files });
            assertBridgeSuccess(result, 'Failed to send message to team');
          }
        } else {
          const result = await getRendererCoreClient().conversations.sendMessage({
            input: displayMessage,
            msg_id,
            conversation_id,
            files,
          });
          assertBridgeSuccess(result, `Failed to send message to ${backend}`);
        }
        emitter.emit('chat.history.refresh');
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const isAuthError =
          errorMsg.includes('[ACP-AUTH-') ||
          errorMsg.includes('authentication failed') ||
          errorMsg.includes('认证失败');
        if (isAuthError) {
          const errorMessage = {
            id: uuid(),
            msg_id: uuid(),
            conversation_id,
            type: 'error',
            data: t('acp.auth.failed', {
              backend,
              error: errorMsg,
              defaultValue: `${backend} authentication failed:

{{error}}

Please check your local CLI tool authentication status`,
            }),
          };

          ipcBridge.acpConversation.responseStream.emit(errorMessage);
        }

        setAiProcessing(false);
        throw error;
      }

      if (files.length > 0) {
        emitter.emit('acp.workspace.refresh');
      }
    },
    [agentSlotId, backend, checkAndUpdateTitle, conversation_id, setAiProcessing, t, teamId, workspacePath]
  );

  const {
    items: queuedCommands,
    isPaused: isQueuePaused,
    isInteractionLocked: isQueueInteractionLocked,
    hasPendingCommands,
    enqueue,
    remove,
    clear,
    reorder,
    pause,
    resume,
    lockInteraction,
    unlockInteraction,
    resetActiveExecution,
  } = useConversationCommandQueue({
    conversationId: conversation_id,
    enabled: true,
    isBusy,
    isHydrated: hasHydratedRunningState,
    onExecute: executeCommand,
  });

  const onSendHandler = async (message: string) => {
    const atPathFiles = atPath.map((item) => (typeof item === 'string' ? item : item.path));
    const allFiles = [...uploadFile, ...atPathFiles];

    clearFiles();
    emitter.emit('acp.selected.file.clear');

    if (
      shouldEnqueueConversationCommand({
        enabled: true,
        isBusy,
        hasPendingCommands,
      })
    ) {
      enqueue({ input: message, files: allFiles });
      return;
    }

    await executeCommand({ input: message, files: allFiles });
  };

  const handleEditQueuedCommand = useCallback(
    (item: ConversationCommandQueueItem) => {
      remove(item.id);
      setContent(item.input);
      setUploadFile(Array.from(new Set(item.files)));
      setAtPath([]);
      emitter.emit('acp.selected.file.clear');
    },
    [remove, setAtPath, setContent, setUploadFile]
  );

  const appendSelectedFiles = useCallback(
    (files: string[]) => {
      setUploadFile((prev) => [...prev, ...files]);
    },
    [setUploadFile]
  );
  const { openFileSelector, onSlashBuiltinCommand } = useOpenFileSelector({
    onFilesSelected: appendSelectedFiles,
  });

  useAddEventListener('acp.selected.file', setAtPath);
  useAddEventListener('acp.selected.file.append', (selectedItems: Array<string | FileOrFolderItem>) => {
    const merged = mergeFileSelectionItems(atPathRef.current, selectedItems);
    if (merged !== atPathRef.current) {
      setAtPath(merged as Array<string | FileOrFolderItem>);
    }
  });

  // Stop conversation handler
  const handleStop = async (): Promise<void> => {
    // Use finally to ensure UI state is reset even if backend stop fails
    try {
      await getRendererCoreClient().conversations.stop(conversation_id);
    } finally {
      resetState();
      resetActiveExecution('stop');
    }
  };

  const mobileActionEntries = React.useMemo<MobileActionSheetEntry[]>(() => {
    const entries: MobileActionSheetEntry[] = [];
    const modeOptions = mobileModeOptions.length > 0 ? mobileModeOptions : getAgentModes(backend);
    const currentMode = sessionMode || modeOptions[0]?.value;

    if (modeOptions.length > 0) {
      entries.push({
        key: 'acp-mode',
        icon: <Shield theme='outline' size='16' fill={iconColors.secondary} />,
        label: t('agentMode.permission'),
        meta: currentMode ? t(`agentMode.${currentMode}`, { defaultValue: currentMode }) : undefined,
        submenu: {
          title: t('agentMode.switchMode', { defaultValue: 'Switch Mode' }),
          options: modeOptions.map((mode) => ({
            key: mode.value,
            label: t(`agentMode.${mode.value}`, { defaultValue: mode.label }),
            active: currentMode === mode.value,
          })),
          emptyText: t('messages.slash.empty', { defaultValue: 'No commands found' }),
          selectable: false,
          onSelect: (mode) => {
            void ipcBridge.acpConversation.setMode.invoke({ conversationId: conversation_id, mode });
          },
        },
      });
    }

    if (mobileModelInfo?.availableModels?.length) {
      entries.push({
        key: 'acp-model',
        icon: <ContextUsageIndicator tokenUsage={tokenUsage} contextLimit={contextLimit > 0 ? contextLimit : undefined} size={16} />,
        label: t('common.defaultModel'),
        meta: mobileModelInfo.currentModelLabel || mobileModelInfo.currentModelId || undefined,
        submenu: {
          title: t('common.defaultModel'),
          options: mobileModelInfo.availableModels.map((model) => ({
            key: model.id,
            label: model.label,
            active: model.id === mobileModelInfo.currentModelId,
          })),
          emptyText: t('conversation.chat.noModelSelected'),
          selectable: false,
          onSelect: (modelId) => {
            void ipcBridge.acpConversation.setModel.invoke({ conversationId: conversation_id, modelId });
          },
        },
      });
    }

    return entries;
  }, [backend, contextLimit, conversation_id, mobileModeOptions, mobileModelInfo, sessionMode, t, tokenUsage]);

  return (
    <div className='max-w-800px w-full mx-auto flex flex-col mt-auto mb-16px'>
      <CommandQueuePanel
        items={queuedCommands}
        paused={isQueuePaused}
        interactionLocked={isQueueInteractionLocked}
        onPause={pause}
        onResume={resume}
        onInteractionLock={lockInteraction}
        onInteractionUnlock={unlockInteraction}
        onEdit={handleEditQueuedCommand}
        onReorder={reorder}
        onRemove={remove}
        onClear={clear}
      />
      <ThoughtDisplay running={aiProcessing && !hasThinkingMessage} onStop={handleStop} />

      <SendBox
        value={content}
        onChange={setContent}
        selectedWorkspaceItems={atPath}
        onSelectedWorkspaceItemsChange={(items) => {
          emitter.emit('acp.selected.file', items);
          setAtPath(items);
        }}
        loading={isBusy}
        disabled={false}
        placeholder={t('acp.sendbox.placeholder', {
          backend: agentName || backend,
          defaultValue: `Send message to {{backend}}...`,
        })}
        onStop={handleStop}
        className='z-10'
        onFilesAdded={handleFilesAdded}
        hasPendingAttachments={uploadFile.length > 0 || atPath.length > 0}
        enableBtw={isSideQuestionSupported({ type: 'acp', backend })}
        supportedExts={allSupportedExts}
        defaultMultiLine={true}
        lockMultiLine={true}
        mobileActionEntries={mobileActionEntries}
        tools={
          <div className='flex items-center gap-4px'>
            <FileAttachButton openFileSelector={openFileSelector} onLocalFilesAdded={handleFilesAdded} />
            {showModeSelector && (
              <AgentModeSelector
                backend={backend}
                conversationId={conversation_id}
                compact
                initialMode={sessionMode}
                compactLeadingIcon={<Shield theme='outline' size='14' fill={iconColors.secondary} />}
                modeLabelFormatter={(mode) => t(`agentMode.${mode.value}`, { defaultValue: mode.label })}
                compactLabelPrefix={t('agentMode.permission')}
                hideCompactLabelPrefixOnMobile
                onModeChanged={isLeaderInTeam ? teamPermission?.propagateMode : undefined}
              />
            )}
            <AcpConfigSelector
              conversationId={conversation_id}
              backend={backend}
              compact={!!teamId}
              initialConfigOptions={cachedConfigOptions}
            />
          </div>
        }
        prefix={
          <>
            {uploadFile.length > 0 && (
              <HorizontalFileList>
                {uploadFile.map((path) => (
                  <FilePreview
                    key={path}
                    path={path}
                    onRemove={() => setUploadFile(uploadFile.filter((v) => v !== path))}
                  />
                ))}
              </HorizontalFileList>
            )}
            {atPath.some((item) => (typeof item === 'string' ? false : !item.isFile)) && (
              <div className='flex flex-wrap items-center gap-8px mb-8px'>
                {atPath.map((item) => {
                  if (typeof item === 'string') return null;
                  if (!item.isFile) {
                    return (
                      <Tag
                        key={item.path}
                        color='blue'
                        closable
                        onClose={() => {
                          const newAtPath = atPath.filter((v) => (typeof v === 'string' ? true : v.path !== item.path));
                          emitter.emit('acp.selected.file', newAtPath);
                          setAtPath(newAtPath);
                        }}
                      >
                        {item.name}
                      </Tag>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </>
        }
        onSend={onSendHandler}
        slashCommands={slashCommands}
        onSlashBuiltinCommand={onSlashBuiltinCommand}
        allowSendWhileLoading
        compactActions={!!teamId}
        sendButtonPrefix={
          tokenUsage ? (
            <ContextUsageIndicator
              tokenUsage={tokenUsage}
              contextLimit={contextLimit > 0 ? contextLimit : undefined}
              size={24}
            />
          ) : undefined
        }
      ></SendBox>
    </div>
  );
};

export default AcpSendBox;
