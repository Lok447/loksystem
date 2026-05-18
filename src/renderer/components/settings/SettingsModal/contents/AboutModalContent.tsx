/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Typography } from '@arco-design/web-react';
import { Earth, Mail } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { useSettingsViewMode } from '../settingsViewContext';
import { openExternalUrl } from '@/renderer/utils/platform';

const AboutModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';

  const openLink = async (url: string) => {
    try {
      await openExternalUrl(url);
    } catch (error) {
      console.log('Failed to open link:', error);
    }
  };

  return (
    <div
      className={classNames(
        'flex h-full w-full items-center justify-center overflow-y-auto overflow-x-hidden px-24px',
        isPageMode && 'px-0 overflow-visible'
      )}
    >
      <div className='w-full max-w-560px rounded-24px bg-2 px-28px py-32px md:px-40px md:py-44px text-center shadow-[0_16px_48px_rgba(0,0,0,0.08)]'>
        <div className='mx-auto mb-18px h-54px w-54px rounded-18px bg-brand text-white flex items-center justify-center text-24px font-700'>
          L
        </div>
        <Typography.Title heading={3} className='text-26px font-bold text-t-primary mb-8px'>
          LokSystem
        </Typography.Title>
        <Typography.Text className='block text-14px text-t-secondary mb-28px leading-22px'>
          {t('settings.appDescription')}
        </Typography.Text>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-12px'>
          <Button
            type='primary'
            size='large'
            icon={<Mail theme='outline' size='18' />}
            onClick={() => {
              openLink('https://x.com/WailiVery').catch((error) => console.error('Failed to open link:', error));
            }}
          >
            {t('settings.contactMe')}
          </Button>
          <Button
            type='secondary'
            size='large'
            icon={<Earth theme='outline' size='18' />}
            onClick={() => {
              openLink('https://github.com/Lok447/loksystem').catch((error) =>
                console.error('Failed to open link:', error)
              );
            }}
          >
            {t('settings.officialWebsite')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AboutModalContent;
