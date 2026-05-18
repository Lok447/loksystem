/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import FontSizeControl from '@/renderer/components/settings/FontSizeControl';
import { ThemeSwitcher } from '@/renderer/components/settings/ThemeSwitcher';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { useSettingsViewMode } from '../settingsViewContext';

const PreferenceRow: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div className='flex flex-col items-stretch gap-10px py-12px md:flex-row md:items-center md:justify-between md:gap-24px'>
    <div className='text-14px text-t-primary leading-22px'>{label}</div>
    <div className='w-full flex md:flex-1 md:justify-end'>{children}</div>
  </div>
);

const DisplayModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';

  const displayItems = [
    { key: 'theme', label: t('settings.theme'), component: <ThemeSwitcher /> },
    { key: 'fontSize', label: t('settings.fontSize'), component: <FontSizeControl /> },
  ];

  return (
    <div className='flex flex-col h-full w-full'>
      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='px-16px md:px-24px lg:px-28px py-14px md:py-16px bg-2 rd-16px space-y-10px md:space-y-12px'>
          <div className='w-full flex flex-col divide-y divide-border-2'>
            {displayItems.map((item) => (
              <PreferenceRow key={item.key} label={item.label}>
                {item.component}
              </PreferenceRow>
            ))}
          </div>
        </div>
      </AionScrollArea>
    </div>
  );
};

export default DisplayModalContent;
