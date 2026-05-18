/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export { BasePlugin } from './BasePlugin';
export type { PluginMessageHandler } from './BasePlugin';

// DingTalk plugin
export { DingTalkPlugin } from './dingtalk/DingTalkPlugin';

// WeChat plugin
export { WeixinPlugin } from './weixin/WeixinPlugin';

// WeCom (Enterprise WeChat) plugin
export { WecomPlugin } from './wecom/WecomPlugin';
