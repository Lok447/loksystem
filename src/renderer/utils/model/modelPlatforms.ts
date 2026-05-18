/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

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

export type PlatformType = 'gemini' | 'gemini-vertex-ai' | 'anthropic' | 'custom' | 'new-api' | 'bedrock';

export interface PlatformConfig {
  name: string;
  value: string;
  logo: string | null;
  platform: PlatformType;
  baseUrl?: string;
  i18nKey?: string;
}

export const MODEL_PLATFORMS: PlatformConfig[] = [
  { name: 'Custom', value: 'custom', logo: null, platform: 'custom', i18nKey: 'settings.platformCustom' },
  {
    name: 'OpenRouter',
    value: 'OpenRouter',
    logo: OpenRouterLogo,
    platform: 'custom',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  {
    name: 'DeepSeek',
    value: 'DeepSeek',
    logo: DeepSeekLogo,
    platform: 'custom',
    baseUrl: 'https://api.deepseek.com/v1',
  },
  { name: 'MiniMax', value: 'MiniMax', logo: MiniMaxLogo, platform: 'custom', baseUrl: 'https://api.minimaxi.com/v1' },
  {
    name: 'Novita',
    value: 'Novita',
    logo: NovitaLogo,
    platform: 'custom',
    baseUrl: 'https://api.novita.ai/openai/v1',
  },
  {
    name: 'Dashscope',
    value: 'Dashscope',
    logo: QwenLogo,
    platform: 'custom',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  {
    name: 'SiliconFlow',
    value: 'SiliconFlow',
    logo: SiliconFlowLogo,
    platform: 'custom',
    baseUrl: 'https://api.siliconflow.com/v1',
  },
  {
    name: 'Zhipu',
    value: 'Zhipu',
    logo: ZhipuLogo,
    platform: 'custom',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  },
  {
    name: 'Moonshot (China)',
    value: 'Moonshot',
    logo: KimiLogo,
    platform: 'custom',
    baseUrl: 'https://api.moonshot.cn/v1',
  },
  {
    name: 'Ark',
    value: 'Ark',
    logo: VolcengineLogo,
    platform: 'custom',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  },
  {
    name: 'Qianfan',
    value: 'Qianfan',
    logo: BaiduLogo,
    platform: 'custom',
    baseUrl: 'https://qianfan.baidubce.com/v2',
  },
  {
    name: 'Hunyuan',
    value: 'Hunyuan',
    logo: TencentLogo,
    platform: 'custom',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
  },
];

export const NEW_API_PROTOCOL_OPTIONS = [{ label: 'OpenAI', value: 'openai' }];

export const detectNewApiProtocol = (): string => {
  return 'openai';
};

export const getPlatformByValue = (value: string): PlatformConfig | undefined => {
  return MODEL_PLATFORMS.find((p) => p.value === value);
};

export const getPresetProviders = (): PlatformConfig[] => {
  return MODEL_PLATFORMS.filter((p) => p.baseUrl);
};

export const getGeminiPlatforms = (): PlatformConfig[] => {
  return [];
};

export const isGeminiPlatform = (platform: PlatformType): boolean => {
  return platform === 'gemini' || platform === 'gemini-vertex-ai';
};

export const isCustomOption = (value: string): boolean => {
  const platform = getPlatformByValue(value);
  return value === 'custom' && !platform?.baseUrl;
};

export { isNewApiPlatform } from '@/common/utils/platformConstants';

export const searchPlatformsByName = (keyword: string): PlatformConfig[] => {
  const lowerKeyword = keyword.toLowerCase();
  return MODEL_PLATFORMS.filter((p) => p.name.toLowerCase().includes(lowerKeyword));
};
