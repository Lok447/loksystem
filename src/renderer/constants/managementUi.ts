/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const MANAGEMENT_LABELS = {
  search: '对话搜索',
  model: '模型管理',
  agent: '智能体管理',
  capabilities: '技能管理',
  scheduled: '定时任务',
  webui: '远程管理',
  assistants: '助手中心',
} as const;

export const MANAGEMENT_ROUTES = {
  model: '/manage/model',
  agent: '/manage/agent',
  capabilities: '/manage/capabilities',
  webui: '/manage/webui',
  assistants: '/manage/assistants',
} as const;

export const SETTINGS_PAGE_LABELS = {
  model: MANAGEMENT_LABELS.model,
  agent: MANAGEMENT_LABELS.agent,
  capabilities: MANAGEMENT_LABELS.capabilities,
  webui: MANAGEMENT_LABELS.webui,
  assistants: MANAGEMENT_LABELS.assistants,
  tools: MANAGEMENT_LABELS.capabilities,
  system: '系统管理',
} as const;
