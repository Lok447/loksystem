/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { FileService, type FileMetadata } from '@/renderer/services/FileService';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Message } from '@arco-design/web-react';
import { FolderOpen, FolderUpload, Paperclip } from '@icon-park/react';
import React, { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { MobileActionSheetEntry } from './types';

interface UseAttachEntryOptions {
  openFileSelector: () => void;
  onLocalFilesAdded?: (files: FileMetadata[]) => void;
  dividerBefore?: boolean;
}

interface UseAttachEntryResult {
  entries: MobileActionSheetEntry[];
  hiddenFileInput: React.ReactElement;
}

export const useAttachEntry = ({
  openFileSelector,
  onLocalFilesAdded,
  dividerBefore,
}: UseAttachEntryOptions): UseAttachEntryResult => {
  const { t } = useTranslation();
  const conversationContext = useConversationContextSafe();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDesktop = isElectronDesktop();

  const handleLocalFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = event.target.files;
      if (!fileList || fileList.length === 0 || !onLocalFilesAdded) return;
      try {
        const processed = await FileService.processDroppedFiles(fileList, conversationContext?.conversationId);
        if (processed.length > 0) onLocalFilesAdded(processed);
      } catch {
        Message.error(t('common.fileAttach.failed'));
      }
      event.target.value = '';
    },
    [conversationContext?.conversationId, onLocalFilesAdded, t]
  );

  const triggerLocalUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const entries = useMemo<MobileActionSheetEntry[]>(() => {
    if (isDesktop) {
      return [
        {
          key: 'attach',
          icon: <FolderUpload theme='outline' size='16' />,
          label: t('common.fileAttach.addFiles', { defaultValue: 'Add files' }),
          variant: 'muted',
          dividerBefore,
          onClick: () => openFileSelector(),
        },
      ];
    }

    return [
      {
        key: 'attach-host-files',
        icon: <Paperclip theme='outline' size='16' />,
        label: t('common.fileAttach.addFiles', { defaultValue: 'Add files' }),
        variant: 'muted',
        dividerBefore,
        onClick: () => openFileSelector(),
      },
      {
        key: 'attach-my-device',
        icon: <FolderOpen theme='outline' size='16' />,
        label: t('common.fileAttach.myDevice', { defaultValue: 'Upload from device' }),
        variant: 'muted',
        onClick: () => triggerLocalUpload(),
      },
    ];
  }, [dividerBefore, isDesktop, openFileSelector, t, triggerLocalUpload]);

  const hiddenFileInput = (
    <input
      ref={fileInputRef}
      type='file'
      multiple
      style={{ display: 'none' }}
      onChange={handleLocalFileChange}
      data-testid='mobile-sheet-file-upload-input'
    />
  );

  return { entries, hiddenFileInput };
};
