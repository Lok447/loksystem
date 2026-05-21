import type { IProvider } from '@/common/config/storage';
import ModalHOC from '@/renderer/utils/ui/ModalHOC';
import { Form, Input, Select } from '@arco-design/web-react';
import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import LokModal from '@/renderer/components/base/LokModal';
import { LinkCloud } from '@icon-park/react';
import useModeModeList from '@renderer/hooks/agent/useModeModeList';

import DeepSeekLogo from '@/renderer/assets/logos/ai-major/deepseek.svg';
import OpenRouterLogo from '@/renderer/assets/logos/ai-cloud/openrouter.svg';
import SiliconFlowLogo from '@/renderer/assets/logos/ai-cloud/siliconflow.png';
import QwenLogo from '@/renderer/assets/logos/ai-china/qwen.svg';
import KimiLogo from '@/renderer/assets/logos/ai-china/kimi.svg';
import ZhipuLogo from '@/renderer/assets/logos/ai-china/zhipu.svg';
import VolcengineLogo from '@/renderer/assets/logos/ai-china/volcengine.svg';
import BaiduLogo from '@/renderer/assets/logos/ai-china/baidu.svg';
import TencentLogo from '@/renderer/assets/logos/ai-china/tencent.svg';
import MiniMaxLogo from '@/renderer/assets/logos/ai-china/minimax.png';
import NovitaLogo from '@/renderer/assets/logos/ai-cloud/novita.svg';

const PROVIDER_CONFIGS = [
  { name: 'DeepSeek', url: 'https://api.deepseek.com', logo: DeepSeekLogo },
  { name: 'MiniMax', url: 'https://api.minimaxi.com/v1', logo: MiniMaxLogo },
  { name: 'Novita', url: 'https://api.novita.ai/openai/v1', logo: NovitaLogo },
  { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', logo: OpenRouterLogo },
  { name: 'SiliconFlow', url: 'https://api.siliconflow.com/v1', logo: SiliconFlowLogo },
  { name: 'Dashscope', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', logo: QwenLogo },
  { name: 'Moonshot (China)', url: 'https://api.moonshot.cn/v1', logo: KimiLogo },
  { name: 'Zhipu', url: 'https://open.bigmodel.cn/api/paas/v4', logo: ZhipuLogo },
  { name: 'Ark', url: 'https://ark.cn-beijing.volces.com/api/v3', logo: VolcengineLogo },
  { name: 'Qianfan', url: 'https://qianfan.baidubce.com/v2', logo: BaiduLogo },
  { name: 'Hunyuan', url: 'https://api.hunyuan.cloud.tencent.com/v1', logo: TencentLogo },
];

const getProviderLogo = (name?: string, baseUrl?: string): string | null => {
  if (!name && !baseUrl) return null;
  const byName = PROVIDER_CONFIGS.find((p) => p.name.toLowerCase() === name?.toLowerCase());
  if (byName) return byName.logo;
  if (baseUrl) {
    const byUrl = PROVIDER_CONFIGS.find((p) => baseUrl.includes(p.url.replace('https://', '').split('/')[0]));
    if (byUrl) return byUrl.logo;
  }
  return null;
};

const ProviderLogo: React.FC<{ logo: string | null; name: string; size?: number }> = ({ logo, name, size = 20 }) => {
  if (logo) {
    return <img src={logo} alt={name} className='object-contain shrink-0' style={{ width: size, height: size }} />;
  }
  return <LinkCloud theme='outline' size={size} className='text-t-secondary flex shrink-0' />;
};

const EditModeModal = ModalHOC<{ data?: IProvider; onChange(data: IProvider): void }>(
  ({ modalProps, modalCtrl, ...props }) => {
    const { t } = useTranslation();
    const { data } = props;
    const [form] = Form.useForm();

    const providerLogo = useMemo(() => getProviderLogo(data?.name, data?.baseUrl), [data?.name, data?.baseUrl]);
    const modelListState = useModeModeList('custom', data?.baseUrl, data?.apiKey, true, undefined);

    useEffect(() => {
      if (data) {
        form.setFieldsValue({
          ...data,
          platform: 'custom',
          model: data.model && data.model.length > 0 ? (data.model.length === 1 ? data.model[0] : data.model) : undefined,
        });
      }
    }, [data, form]);

    return (
      <LokModal
        visible={modalProps.visible}
        onCancel={modalCtrl.close}
        header={{ title: t('settings.editModel'), showClose: true }}
        style={{ minHeight: '400px', maxHeight: '90vh', borderRadius: 16 }}
        contentStyle={{
          background: 'var(--dialog-fill-0)',
          borderRadius: 16,
          padding: '20px 24px 16px',
          overflow: 'auto',
        }}
        onOk={async () => {
          try {
            const values = await form.validate();
            props.onChange({
              ...data,
              ...values,
              platform: 'custom',
              model: Array.isArray(values.model) ? values.model : [values.model],
            });
            modalCtrl.close();
          } catch {
            // Arco Form highlights invalid fields automatically.
          }
        }}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
      >
        <div className='py-20px'>
          <Form form={form} layout='vertical'>
            <Form.Item
              label={
                <div className='flex items-center gap-6px'>
                  <ProviderLogo logo={providerLogo} name={data?.name || ''} size={16} />
                  <span>{t('settings.modelProvider')}</span>
                </div>
              }
              field='name'
              required
              rules={[{ required: true }]}
            >
              <Input placeholder={t('settings.modelProvider')} />
            </Form.Item>

            <Form.Item label={t('settings.baseUrl')} required rules={[{ required: true }]} field='baseUrl'>
              <Input />
            </Form.Item>

            <Form.Item
              label={t('settings.apiKey')}
              required
              rules={[{ required: true }]}
              field='apiKey'
              extra={<div className='text-11px text-t-secondary mt-2'>{t('settings.multiApiKeyEditTip')}</div>}
            >
              <Input.TextArea rows={4} placeholder={t('settings.apiKeyPlaceholder')} />
            </Form.Item>

            <Form.Item
              label={t('settings.modelName')}
              field='model'
              required
              rules={[{ required: true }]}
              validateStatus={modelListState.error ? 'error' : undefined}
              help={modelListState.error}
            >
              <Select
                loading={modelListState.isLoading}
                showSearch
                allowCreate
                mode={data?.model && data.model.length > 1 ? 'multiple' : undefined}
                onFocus={() => void modelListState.mutate()}
                options={modelListState.data?.models || []}
              />
            </Form.Item>
          </Form>
        </div>
      </LokModal>
    );
  }
);

export default EditModeModal;

