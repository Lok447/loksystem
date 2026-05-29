/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Message, Typography } from '@arco-design/web-react';
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

const getOfficialSiteUrl = () => {
  if (typeof window === 'undefined') {
    return 'official-site/index.html';
  }

  const baseHref = window.location.href.split('#')[0];
  return new URL('./official-site/index.html', baseHref).href;
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
  const [qrLoadFailed, setQrLoadFailed] = React.useState(false);

  const handleOpenOfficialSite = React.useCallback(() => {
    void openExternalUrl(getOfficialSiteUrl()).catch((error) => {
      console.error('Failed to open official site:', error);
      Message.error(
        t('settings.aboutOpenOfficialSiteFailed', {
          defaultValue: 'Unable to open the official site page in your browser.',
        })
      );
    });
  }, [t]);

  const handleCopyPhoneNumber = React.useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(PHONE_NUMBER);
        Message.success(
          t('settings.aboutCopyPhoneSuccess', {
            defaultValue: 'Phone number copied to clipboard.',
          })
        );
        return;
      }

      Message.success(PHONE_NUMBER);
    } catch (error) {
      console.error('Failed to copy phone number:', error);
      Message.error(
        t('settings.aboutCopyPhoneFailed', {
          defaultValue: 'Unable to copy the phone number right now.',
        })
      );
    }
  }, [t]);

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
                {t('settings.aboutHeroDescription', {
                  defaultValue:
                    'LokSystem is an AI-native collaboration workspace that connects local agents, team orchestration, WebUI delivery, and office-ready outputs in one place.',
                })}
              </Typography.Text>
            </div>
          </div>

          <div className='w-full divide-y divide-border-2'>
            <SettingRow
              title={t('settings.contactMe')}
              description={t('settings.aboutContactDescription', {
                defaultValue: 'View the phone number and WeChat QR code for direct support.',
              })}
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
              description={t('settings.aboutOfficialWebsiteDescription', {
                defaultValue: 'Open the bundled official site page even when you are offline.',
              })}
              action={
                <Button
                  type='secondary'
                  size='large'
                  className='!h-38px w-full md:min-w-128px'
                  icon={<Earth theme='outline' size='18' />}
                  onClick={handleOpenOfficialSite}
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
        title={t('settings.aboutContactTitle', {
          defaultValue: 'Contact LokSystem',
        })}
        footer={null}
        style={{ width: '420px' }}
        contentStyle={{ padding: 0 }}
      >
        <div className='px-20px pb-20px pt-8px'>
          <div className='rounded-16px bg-3 px-16px py-14px text-center'>
            <div className='text-12px font-600 tracking-[0.08em] text-t-secondary'>
              {t('settings.aboutPhoneLabel', {
                defaultValue: 'Support Phone',
              })}
            </div>
            <div className='mt-8px text-24px font-600 leading-32px text-t-primary'>{PHONE_NUMBER}</div>
          </div>

          <div className='mt-14px rounded-16px border border-line-3 bg-white p-16px'>
            {qrLoadFailed ? (
              <div className='mx-auto flex min-h-240px max-w-240px items-center justify-center rounded-12px bg-3 px-16px text-center text-13px leading-20px text-t-secondary'>
                {t('settings.aboutQrFallback', {
                  defaultValue: 'QR image is unavailable in this build. Please use the phone number above for support.',
                })}
              </div>
            ) : (
              <img
                src={wechatQr}
                alt={t('settings.aboutWechatLabel', {
                  defaultValue: 'LokSystem WeChat QR code',
                })}
                className='mx-auto block w-full max-w-240px rounded-12px object-cover'
                onError={() => setQrLoadFailed(true)}
              />
            )}
          </div>

          <div className='mt-16px flex justify-center'>
            <Button type='primary' size='large' icon={<Mail theme='outline' size='18' />} onClick={() => void handleCopyPhoneNumber()}>
              {t('settings.aboutCopyPhone', {
                defaultValue: 'Copy phone number',
              })}
            </Button>
          </div>
        </div>
      </LokModal>
    </div>
  );
};

export default AboutModalContent;
