/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Typography } from '@arco-design/web-react';
import { Earth, Mail } from '@icon-park/react';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';
import LokModal from '@/renderer/components/base/LokModal';
import lokLogo from '@/renderer/assets/logos/brand/lok.png';
import wechatQr from '@/renderer/assets/contact/wechat-qr.jpg';
import { openExternalUrl } from '@/renderer/utils/platform';
import { useSettingsViewMode } from '../settingsViewContext';

const PHONE_NUMBER = '13434766647';

const getOfficialSiteUrl = () => new URL('official-site/index.html', window.location.href).href;

const openLink = async (url: string) => {
  try {
    await openExternalUrl(url);
  } catch (error) {
    console.error('Failed to open link:', error);
  }
};

const SettingRow: React.FC<{
  title: string;
  description: string;
  action: React.ReactNode;
}> = ({ title, description, action }) => (
  <div className='flex flex-col gap-10px py-12px md:flex-row md:items-center md:justify-between md:gap-24px'>
    <div className='min-w-0 flex-1'>
      <div className='text-14px font-500 leading-22px text-t-primary'>{title}</div>
      <div className='mt-4px text-13px leading-20px text-t-secondary'>{description}</div>
    </div>
    <div className='w-full md:w-auto md:flex-shrink-0'>{action}</div>
  </div>
);

const AboutModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const [contactModalVisible, setContactModalVisible] = React.useState(false);

  return (
    <div className={classNames('h-full w-full overflow-y-auto overflow-x-hidden', isPageMode ? 'px-0' : 'px-24px')}>
      <div className='w-full min-h-full rounded-16px bg-2 px-16px py-14px md:px-24px md:py-16px'>
        <div className='flex flex-col gap-14px'>
          <div className='flex items-center gap-12px'>
            <div className='flex h-50px w-50px flex-shrink-0 items-center justify-center rounded-14px bg-white shadow-[0_4px_14px_rgba(0,0,0,0.05)]'>
              <img src={lokLogo} alt='LokSystem' className='h-34px w-34px rounded-8px object-cover' />
            </div>
            <div className='min-w-0 flex-1 self-center'>
              <Typography.Title heading={4} className='!mb-4px !text-20px !font-600 !leading-28px !text-t-primary'>
                LokSystem
              </Typography.Title>
              <Typography.Text className='block max-w-720px text-left text-13px leading-21px text-t-secondary'>
                LokSystem 全新 AI 原生协同平台，打通人机协作壁垒，依托智能体能力赋能团队高效协作。
              </Typography.Text>
            </div>
          </div>

          <div className='w-full divide-y divide-border-2'>
            <SettingRow
              title={t('settings.contactMe')}
              description='查看电话号码与微信二维码。'
              action={
                <Button
                  type='secondary'
                  size='large'
                  className='!h-38px w-full md:min-w-128px'
                  icon={<Mail theme='outline' size='18' />}
                  onClick={() => setContactModalVisible(true)}
                >
                  {t('settings.contactMe')}
                </Button>
              }
            />

            <SettingRow
              title={t('settings.officialWebsite')}
              description='打开 LokSystem 官方介绍页面。'
              action={
                <Button
                  type='secondary'
                  size='large'
                  className='!h-38px w-full md:min-w-128px'
                  icon={<Earth theme='outline' size='18' />}
                  onClick={() => {
                    void openLink(getOfficialSiteUrl());
                  }}
                >
                  {t('settings.officialWebsite')}
                </Button>
              }
            />
          </div>
        </div>
      </div>

      <LokModal
        visible={contactModalVisible}
        onCancel={() => setContactModalVisible(false)}
        title='联系我'
        footer={null}
        style={{ width: '420px' }}
        contentStyle={{ padding: 0 }}
      >
        <div className='px-20px pb-20px pt-8px'>
          <div className='rounded-16px bg-3 px-16px py-14px text-center'>
            <div className='text-12px font-600 tracking-[0.08em] text-t-secondary'>联系电话</div>
            <div className='mt-8px text-24px font-600 leading-32px text-t-primary'>{PHONE_NUMBER}</div>
          </div>

          <div className='mt-14px rounded-16px border border-line-3 bg-white p-16px'>
            <img src={wechatQr} alt='LokSystem 微信二维码' className='mx-auto block w-full max-w-240px rounded-12px object-cover' />
          </div>

          <div className='mt-16px flex justify-center'>
            <Button type='primary' size='large' icon={<Mail theme='outline' size='18' />}>
              立即联系
            </Button>
          </div>
        </div>
      </LokModal>
    </div>
  );
};

export default AboutModalContent;
