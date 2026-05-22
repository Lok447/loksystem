import type { IProvider } from '@/common/config/storage';
import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import ModalHOC from '@/renderer/utils/ui/ModalHOC';
import { Form, Input, Message, Select } from '@arco-design/web-react';
import { LinkCloud, Edit, Search } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useModeModeList from '@renderer/hooks/agent/useModeModeList';
import LokModal from '@/renderer/components/base/LokModal';
import ApiKeyEditorModal from './ApiKeyEditorModal';
import { MODEL_PLATFORMS, getPlatformByValue, isCustomOption, type PlatformConfig } from '@/renderer/utils/model/modelPlatforms';
import type { DeepLinkAddProviderDetail } from '@/renderer/hooks/system/useDeepLink';

const ProviderLogo: React.FC<{ logo: string | null; name: string; size?: number }> = ({ logo, name, size = 20 }) => {
  if (logo) {
    return <img src={logo} alt={name} className='object-contain shrink-0' style={{ width: size, height: size }} />;
  }
  return <LinkCloud theme='outline' size={size} className='text-t-secondary flex shrink-0' />;
};

const renderPlatformOption = (platform: PlatformConfig, t?: (key: string) => string) => {
  const displayName = platform.i18nKey && t ? t(platform.i18nKey) : platform.name;
  return (
    <div className='flex items-center gap-8px'>
      <ProviderLogo logo={platform.logo} name={displayName} size={18} />
      <span>{displayName}</span>
    </div>
  );
};

const DEFAULT_PLATFORM = 'custom';

const AddPlatformModal = ModalHOC<{
  onSubmit: (platform: IProvider) => void;
  deepLinkData?: DeepLinkAddProviderDetail;
}>(({ modalProps, onSubmit, modalCtrl, deepLinkData }) => {
  const [message, messageContext] = Message.useMessage();
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [apiKeyEditorVisible, setApiKeyEditorVisible] = useState(false);

  const platformValue = Form.useWatch('platform', form);
  const baseUrl = Form.useWatch('baseUrl', form);
  const apiKey = Form.useWatch('apiKey', form);

  const selectedPlatform = useMemo(() => getPlatformByValue(platformValue), [platformValue]);
  const isCustom = isCustomOption(platformValue);
  const actualBaseUrl = baseUrl || selectedPlatform?.baseUrl || '';
  const modelListState = useModeModeList('custom', actualBaseUrl, apiKey, true, undefined);

  useEffect(() => {
    if (!modalProps.visible) return;
    form.resetFields();
    const initialPlatform = MODEL_PLATFORMS.some((p) => p.value === deepLinkData?.platform) ? deepLinkData?.platform : DEFAULT_PLATFORM;
    form.setFieldValue('platform', initialPlatform);
    if (deepLinkData?.baseUrl) form.setFieldValue('baseUrl', deepLinkData.baseUrl);
    if (deepLinkData?.apiKey) form.setFieldValue('apiKey', deepLinkData.apiKey);
  }, [modalProps.visible, deepLinkData, form]);

  useEffect(() => {
    if (modelListState.data?.fix_base_url) {
      form.setFieldValue('baseUrl', modelListState.data.fix_base_url);
      message.info(t('settings.baseUrlAutoFix', { base_url: modelListState.data.fix_base_url }));
    }
  }, [modelListState.data?.fix_base_url, form, message, t]);

  const handleSubmit = () => {
    form
      .validate()
      .then((values) => {
        const name = selectedPlatform?.i18nKey
          ? t(selectedPlatform.i18nKey)
          : (selectedPlatform?.name ?? values.platform ?? t('settings.platformCustom'));
        const provider: IProvider = {
          id: uuid(),
          platform: 'custom',
          name,
          baseUrl: values.baseUrl || selectedPlatform?.baseUrl || '',
          apiKey: values.apiKey,
          model: [values.model],
        };

        onSubmit(provider);
        modalCtrl.close();
      })
      .catch(() => {
        // Arco Form highlights invalid fields automatically.
      });
  };

  return (
    <LokModal
      visible={modalProps.visible}
      onCancel={modalCtrl.close}
      header={{ title: t('settings.addModel'), showClose: true }}
      style={{ maxWidth: '92vw', borderRadius: 16 }}
      contentStyle={{
        background: 'var(--dialog-fill-0)',
        borderRadius: 16,
        padding: '20px 24px 16px',
        overflow: 'auto',
      }}
      onOk={handleSubmit}
      confirmLoading={modalProps.confirmLoading}
      okText={t('common.confirm')}
      cancelText={t('common.cancel')}
    >
      {messageContext}
      <div className='pt-4px pb-12px'>
        <Form form={form} layout='vertical' className='[&_.arco-form-item]:mb-12px [&_.arco-form-item:last-child]:mb-0'>
          <Form.Item initialValue={DEFAULT_PLATFORM} label={t('settings.modelPlatform')} field='platform' required rules={[{ required: true }]}>
            <Select
              showSearch
              filterOption={(inputValue, option) => {
                const optionValue = (option as React.ReactElement<{ value?: string }>)?.props?.value;
                const plat = MODEL_PLATFORMS.find((p) => p.value === optionValue);
                return plat?.name.toLowerCase().includes(inputValue.toLowerCase()) ?? false;
              }}
              onChange={() => form.setFieldValue('model', '')}
              renderFormat={(option) => {
                const optionValue = (option as { value?: string })?.value;
                const plat = MODEL_PLATFORMS.find((p) => p.value === optionValue);
                return plat ? renderPlatformOption(plat, t) : optionValue;
              }}
            >
              {MODEL_PLATFORMS.map((plat) => (
                <Select.Option key={plat.value} value={plat.value}>
                  {renderPlatformOption(plat, t)}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            hidden={!isCustom}
            label={t('settings.baseUrl')}
            field='baseUrl'
            required={isCustom}
            rules={[{ required: isCustom }]}
          >
            <Input
              placeholder={selectedPlatform?.baseUrl || 'https://your-openai-compatible-endpoint/v1'}
              onBlur={() => void modelListState.mutate()}
            />
          </Form.Item>

          <Form.Item
            label={t('settings.apiKey')}
            required
            rules={[{ required: true }]}
            field='apiKey'
            extra={<div className='text-11px text-t-secondary mt-2 leading-4'>{t('settings.multiApiKeyTip')}</div>}
          >
            <Input
              onBlur={() => void modelListState.mutate()}
              suffix={
                <Edit
                  theme='outline'
                  size={16}
                  className='cursor-pointer text-t-secondary hover:text-t-primary flex'
                  onClick={() => setApiKeyEditorVisible(true)}
                />
              }
            />
          </Form.Item>

          <Form.Item
            label={t('settings.modelName')}
            field='model'
            required
            rules={[{ required: true }]}
            validateStatus={modelListState.error ? 'error' : 'success'}
            help={modelListState.error}
          >
            <Select
              loading={modelListState.isLoading}
              showSearch
              allowCreate
              suffixIcon={
                <Search
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isCustom && !baseUrl) {
                      message.warning(t('settings.pleaseEnterBaseUrl'));
                      return;
                    }
                    if (!apiKey) {
                      message.warning(t('settings.pleaseEnterApiKey'));
                      return;
                    }
                    void modelListState.mutate();
                  }}
                  theme='outline'
                  size={16}
                  className='cursor-pointer text-t-secondary hover:text-t-primary'
                />
              }
              options={modelListState.data?.models || []}
            />
          </Form.Item>
        </Form>
      </div>

      <ApiKeyEditorModal
        visible={apiKeyEditorVisible}
        apiKeys={apiKey || ''}
        onClose={() => setApiKeyEditorVisible(false)}
        onSave={(keys) => {
          form.setFieldValue('apiKey', keys);
          void modelListState.mutate();
        }}
        onTestKey={async (key) => {
          try {
            const res = await ipcBridge.mode.fetchModelList.invoke({
              base_url: actualBaseUrl,
              api_key: key,
              platform: 'custom',
            });
            return res.success === true && Array.isArray(res.data?.mode) && res.data.mode.length > 0;
          } catch {
            return false;
          }
        }}
      />
    </LokModal>
  );
});

export default AddPlatformModal;
