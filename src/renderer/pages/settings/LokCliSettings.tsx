/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { getRendererCoreClient } from '@/common/coreClient';
import { isLokCliProviderBackend } from '@/common/config/lokcliCompatibility';
import { Tag, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import SettingsPageWrapper from './components/SettingsPageWrapper';

type LokCliAgentInfo = {
  available: boolean;
  version?: string;
  path?: string;
};

const LokCliSettings: React.FC = () => {
  const { t } = useTranslation();
  const [agentInfo, setAgentInfo] = useState<LokCliAgentInfo | null>(null);

  useEffect(() => {
    void getRendererCoreClient().acp.getAvailableAgents().then((result) => {
      if (result.success) {
        const agent = result.data.find((a) => isLokCliProviderBackend(a.backend));
        setAgentInfo(agent ? { available: true, path: agent.cliPath } : { available: false });
      }
    });
  }, []);

  return (
    <SettingsPageWrapper>
      <div className='flex flex-col gap-16px'>
        <Typography.Title heading={5} className='!mb-0'>
          LokCLI
        </Typography.Title>

        <div className='flex flex-col gap-8px p-16px rd-12px bg-aou-1'>
          <div className='flex items-center gap-8px'>
            <Typography.Text className='text-14px font-medium'>
              {t('common.status', { defaultValue: 'Status' })}
            </Typography.Text>
            <Tag color={agentInfo?.available ? 'green' : 'red'} size='small'>
              {agentInfo?.available
                ? t('settings.aionrs.available', { defaultValue: 'Available' })
                : t('settings.aionrs.notFound', { defaultValue: 'Not Found' })}
            </Tag>
          </div>
          {agentInfo?.version && (
            <Typography.Text type='secondary' className='text-12px'>
              {t('settings.aionrs.version', { defaultValue: 'Version' })}: {agentInfo.version}
            </Typography.Text>
          )}
          {agentInfo?.path && (
            <Typography.Text type='secondary' className='text-12px break-all'>
              {t('settings.aionrs.path', { defaultValue: 'Path' })}: {agentInfo.path}
            </Typography.Text>
          )}
        </div>

        <Typography.Text type='secondary' className='text-12px'>
          {t('settings.aionrs.providerNote', {
            defaultValue:
              'Provider and API key settings are managed in the Models page. LokCLI supports domestic model providers and OpenAI-compatible endpoints.',
          })}
        </Typography.Text>
      </div>
    </SettingsPageWrapper>
  );
};

export default LokCliSettings;
