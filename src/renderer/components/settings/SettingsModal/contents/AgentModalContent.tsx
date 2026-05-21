/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import LocalAgents from '@/renderer/pages/settings/AgentSettings/LocalAgents';
import LokScrollArea from '@/renderer/components/base/LokScrollArea';
import { useSettingsViewMode } from '../settingsViewContext';

const AgentModalContent: React.FC = () => {
  const { t } = useTranslation();
  const [agentMessage, agentMessageContext] = Message.useMessage({ maxCount: 10 });
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';

  return (
    <div className='flex flex-col h-full w-full'>
      {agentMessageContext}
      <div className='mb-12px text-16px font-600 text-t-primary'>{t('settings.agentManagement.localAgents')}</div>
      <LokScrollArea className='flex-1 min-h-0 pb-16px scrollbar-hide' disableOverflow={isPageMode}>
        <LocalAgents />
      </LokScrollArea>
    </div>
  );
};

export default AgentModalContent;
