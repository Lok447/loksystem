import type { IProvider } from '@/common/config/storage';
import ModalHOC from '@/renderer/utils/ui/ModalHOC';
import LokModal from '@/renderer/components/base/LokModal';
import { Select } from '@arco-design/web-react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useModeModeList from '@renderer/hooks/agent/useModeModeList';

const AddModelModal = ModalHOC<{ data?: IProvider; onSubmit: (model: IProvider) => void }>(
  ({ modalProps, data, onSubmit, modalCtrl }) => {
    const { t } = useTranslation();
    const [model, setModel] = useState('');
    const { data: modelList, isLoading } = useModeModeList('custom', data?.baseUrl, data?.apiKey);
    const existingModels = data?.model || [];
    const optionsList = useMemo(() => {
      const models = Array.isArray(modelList) ? modelList : modelList?.models || [];
      if (!models || !data?.model) return models;
      return models.map((item) => ({ ...item, disabled: data.model.includes(item.value) }));
    }, [modelList, data?.model]);

    const handleConfirm = useCallback(() => {
      if (!model || !data) return;
      onSubmit({ ...data, platform: 'custom', model: [...existingModels, model] });
      modalCtrl.close();
    }, [data, existingModels, model, onSubmit, modalCtrl]);

    return (
      <LokModal
        visible={modalProps.visible}
        onCancel={modalCtrl.close}
        header={{ title: t('settings.addModel'), showClose: true }}
        style={{ maxHeight: '90vh' }}
        contentStyle={{
          background: 'var(--dialog-fill-0)',
          borderRadius: 16,
          padding: '20px 24px',
          overflow: 'auto',
        }}
        onOk={handleConfirm}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        okButtonProps={{ disabled: !model }}
      >
        <div className='flex flex-col gap-16px pt-20px'>
          <div className='space-y-8px'>
            <div className='text-13px font-500 text-t-secondary'>{t('settings.addModelPlaceholder')}</div>
            <Select
              showSearch
              options={optionsList}
              loading={isLoading}
              onChange={setModel}
              value={model}
              allowCreate
              placeholder={t('settings.addModelPlaceholder')}
            />
          </div>
        </div>
      </LokModal>
    );
  }
);

export default AddModelModal;

