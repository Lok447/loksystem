import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Form, Input, Message } from '@arco-design/web-react';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';
import { Close } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { configService } from '@/common/config/configService';
import type { AcpInitializeResult } from '@/common/types/acpTypes';
import type { TeamCapabilityOverrides, TTeam, TeamAgent } from '@/common/types/teamTypes';
import { useConversationAgents } from '@renderer/pages/conversation/hooks/useConversationAgents';
import LokModal from '@renderer/components/base/LokModal';
import LokSelect from '@renderer/components/base/LokSelect';
import {
  agentKey,
  agentFromKey,
  resolveConversationType,
  resolveTeamAgentType,
  partitionAgentsByTeamRole,
  getAgentTeamCapabilitySummary,
  getTeammateMixedBackendHint,
  AgentOptionLabel,
} from './agentSelectUtils';

const FormItem = Form.Item;
const { Option, OptGroup } = LokSelect;

type Props = {
  visible: boolean;
  team: TTeam;
  onClose: () => void;
  onAdd: (agent: Omit<TeamAgent, 'slotId'>) => Promise<void>;
};

const AddTeamMemberModal: React.FC<Props> = ({ visible, team, onClose, onAdd }) => {
  const { t } = useTranslation();
  const { cliAgents, presetAssistants } = useConversationAgents();
  const [name, setName] = useState('');
  const [agentKeyValue, setAgentKeyValue] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [cachedInitResults, setCachedInitResults] = useState<Record<string, AcpInitializeResult> | null>(null);
  const [capabilityOverrides, setCapabilityOverrides] = useState<TeamCapabilityOverrides | null>(null);
  const nameInputRef = useRef<RefInputType | null>(null);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    Promise.all([configService.get('acp.cachedInitializeResult'), configService.get('team.capabilityOverrides')])
      .then(([cachedData, overrideData]) => {
        if (!active) return;
        setCachedInitResults(cachedData ?? null);
        setCapabilityOverrides((overrideData as TeamCapabilityOverrides | null | undefined) ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [visible]);

  useEffect(() => {
    if (visible) {
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [visible]);

  const allAgents = useMemo(() => [...cliAgents, ...presetAssistants], [cliAgents, presetAssistants]);
  const { selectable, blocked } = useMemo(
    () => partitionAgentsByTeamRole(allAgents, cachedInitResults, 'teammate', capabilityOverrides),
    [allAgents, cachedInitResults, capabilityOverrides]
  );

  const { supportedCliAgents, supportedPresetAssistants } = useMemo(() => {
    const selectableKeys = new Set(selectable.map(agentKey));
    return {
      supportedCliAgents: cliAgents.filter((agent) => selectableKeys.has(agentKey(agent))),
      supportedPresetAssistants: presetAssistants.filter((agent) => selectableKeys.has(agentKey(agent))),
    };
  }, [cliAgents, presetAssistants, selectable]);

  const leaderBackend = team.agents.find((agent) => agent.role === 'leader')?.agentType;
  const selectedAgent = useMemo(
    () => (agentKeyValue ? agentFromKey(agentKeyValue, selectable) : undefined),
    [agentKeyValue, selectable]
  );
  const teammateHint = useMemo(() => {
    if (!selectedAgent) return undefined;
    return getTeammateMixedBackendHint(selectedAgent, leaderBackend, cachedInitResults, capabilityOverrides);
  }, [selectedAgent, leaderBackend, cachedInitResults, capabilityOverrides]);

  const handleClose = () => {
    setName('');
    setAgentKeyValue(undefined);
    onClose();
  };

  const handleAdd = async () => {
    if (!name.trim()) {
      Message.warning(t('team.memberAdd.nameRequired', { defaultValue: 'Please enter a teammate name' }));
      nameInputRef.current?.focus();
      return;
    }
    if (!agentKeyValue) {
      Message.warning(t('team.memberAdd.agentRequired', { defaultValue: 'Please select a teammate runtime' }));
      return;
    }

    const selected = agentFromKey(agentKeyValue, selectable);
    if (!selected) {
      Message.warning(t('team.memberAdd.agentRequired', { defaultValue: 'Please select a teammate runtime' }));
      return;
    }

    setLoading(true);
    try {
      const agentType = resolveTeamAgentType(selected, 'acp');
      await onAdd({
        conversationId: '',
        role: 'teammate',
        status: 'pending',
        agentType,
        agentName: name.trim(),
        conversationType: resolveConversationType(agentType),
        cliPath: selected.cliPath,
        customAgentId: selected.customAgentId,
      });
      handleClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      Message.error(msg || t('team.memberAdd.error', { defaultValue: 'Failed to add teammate' }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <LokModal
      visible={visible}
      onCancel={handleClose}
      className='team-add-member-modal'
      style={{ width: 560 }}
      wrapStyle={{ zIndex: 10000 }}
      maskStyle={{ zIndex: 9999 }}
      autoFocus={false}
      unmountOnExit={false}
      contentStyle={{
        background: 'var(--dialog-fill-0)',
        maxHeight: 'min(72vh, 680px)',
        overflow: 'auto',
      }}
      header={{
        render: () => (
          <div className='flex items-center justify-between border-b border-border-1 bg-dialog-fill-0 px-24px py-20px'>
            <h3 className='m-0 text-18px font-500 text-t-primary'>
              {t('team.memberAdd.title', { defaultValue: 'Add Team Member' })}
            </h3>
            <Button
              type='text'
              icon={<Close size='20' fill='currentColor' className='text-t-secondary' />}
              onClick={handleClose}
              className='!h-32px !w-32px !min-w-32px !p-0 !rd-8px hover:!bg-fill-1'
            />
          </div>
        ),
      }}
      footer={
        <div className='flex justify-end gap-10px border-t border-border-1 bg-dialog-fill-0 px-24px py-20px'>
          <Button onClick={handleClose} className='min-w-88px' style={{ borderRadius: 8 }}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button type='primary' onClick={handleAdd} loading={loading} className='min-w-88px' style={{ borderRadius: 8 }}>
            {t('team.memberAdd.confirm', { defaultValue: 'Add Member' })}
          </Button>
        </div>
      }
    >
      <div className='px-24px py-20px'>
        <Form layout='vertical'>
          <FormItem label={t('team.memberAdd.nameLabel', { defaultValue: 'Teammate name' })} required>
            <Input
              ref={nameInputRef}
              placeholder={t('team.memberAdd.namePlaceholder', { defaultValue: 'Teammate name' })}
              value={name}
              onChange={setName}
            />
          </FormItem>

          <FormItem label={t('team.memberAdd.agentLabel', { defaultValue: 'Runtime' })} required>
            <div className='flex flex-col gap-8px'>
              <span className='text-12px leading-18px text-t-secondary'>
                {t('team.memberAdd.description', {
                  defaultValue:
                    'Only worker-capable runtimes are available here. Mixed-runtime teammates are screened before they can join the current team.',
                })}
              </span>
              {selectable.length === 0 ? (
                <div className='flex items-center justify-center rounded-12px border border-dashed border-border-2 bg-fill-1 py-20px text-12px text-t-secondary'>
                  {t('team.memberAdd.noSupportedAgents', {
                    defaultValue: 'No worker-capable runtimes are currently available for this team.',
                  })}
                </div>
              ) : (
                <div className='flex flex-col gap-8px'>
                  <LokSelect
                    showSearch
                    allowClear
                    placeholder={t('team.memberAdd.agentPlaceholder', { defaultValue: 'Select teammate runtime' })}
                    value={agentKeyValue}
                    onChange={(value) => setAgentKeyValue(value as string | undefined)}
                    filterOption={(inputValue, option) => {
                      const optionValue = (option as React.ReactElement<{ value?: string }>)?.props?.value;
                      if (!optionValue) return false;
                      const agent = agentFromKey(optionValue, selectable);
                      if (!agent) return false;
                      return agent.name.toLowerCase().includes(inputValue.toLowerCase());
                    }}
                    renderFormat={(_option, value) => {
                      const strVal = value as unknown as string;
                      if (!strVal) return '';
                      const agent = agentFromKey(strVal, selectable);
                      if (!agent) return strVal;
                      return (
                        <AgentOptionLabel
                          agent={agent}
                          capabilitySummary={getAgentTeamCapabilitySummary(agent, cachedInitResults, capabilityOverrides)}
                        />
                      );
                    }}
                  >
                    {supportedCliAgents.length > 0 && (
                      <OptGroup label={t('conversation.dropdown.cliAgents', { defaultValue: 'CLI Agents' })}>
                        {supportedCliAgents.map((agent) => {
                          const key = agentKey(agent);
                          return (
                            <Option key={key} value={key}>
                              <AgentOptionLabel
                                agent={agent}
                                capabilitySummary={getAgentTeamCapabilitySummary(agent, cachedInitResults, capabilityOverrides)}
                              />
                            </Option>
                          );
                        })}
                      </OptGroup>
                    )}
                    {supportedPresetAssistants.length > 0 && (
                      <OptGroup label={t('conversation.dropdown.presetAssistants', { defaultValue: 'Preset Assistants' })}>
                        {supportedPresetAssistants.map((agent) => {
                          const key = agentKey(agent);
                          return (
                            <Option key={key} value={key}>
                              <AgentOptionLabel
                                agent={agent}
                                capabilitySummary={getAgentTeamCapabilitySummary(agent, cachedInitResults, capabilityOverrides)}
                              />
                            </Option>
                          );
                        })}
                      </OptGroup>
                    )}
                  </LokSelect>
                  <div className='rounded-12px border border-border-1 bg-fill-1 px-12px py-10px text-12px leading-18px text-t-secondary'>
                    {teammateHint ||
                      t('team.memberAdd.runtimeHint', {
                        defaultValue:
                          'The selected teammate must remain worker-capable under the current leader runtime and mixed-backend routing rules.',
                      })}
                  </div>
                  {blocked.length > 0 ? (
                    <div className='rounded-12px border border-dashed border-border-2 bg-fill-0 px-12px py-10px text-12px leading-18px text-t-tertiary'>
                      {t('team.memberAdd.blockedHint', {
                        defaultValue:
                          'Some installed runtimes are hidden here because they are leader-only, unsupported, or still missing an explicit worker capability override.',
                      })}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </FormItem>
        </Form>
      </div>
    </LokModal>
  );
};

export default AddTeamMemberModal;
