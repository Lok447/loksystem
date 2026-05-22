import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { ConfigStorage } from '@/common/config/storage';
import { ipcBridge } from '@/common';
import i18nConfig from '@/common/config/i18n-config.json';
import {
  DEFAULT_LANGUAGE,
  normalizeLanguageCode,
  mergeWithFallback,
  ensureAndSwitch,
  type LocaleData,
} from '@/common/config/i18n';

// Static imports for all locales to ensure packaged app can always switch language.
import enUS from './locales/en-US/index';
import zhCN from './locales/zh-CN/index';
import jaJP from './locales/ja-JP/index';
import zhTW from './locales/zh-TW/index';
import koKR from './locales/ko-KR/index';
import trTR from './locales/tr-TR/index';
import ruRU from './locales/ru-RU/index';
import ukUA from './locales/uk-UA/index';

export type { I18nKey, I18nModule } from './i18n-keys';

// Re-exports
export { normalizeLanguageCode } from '@/common/config/i18n';
export type { SupportedLanguage } from '@/common/config/i18n';

export const supportedLanguages = i18nConfig.supportedLanguages;

const localeData: LocaleData = {
  'en-US': enUS,
  'zh-CN': zhCN,
  'ja-JP': jaJP,
  'zh-TW': zhTW,
  'ko-KR': koKR,
  'tr-TR': trTR,
  'ru-RU': ruRU,
  'uk-UA': ukUA,
};

const fallbackLocale = localeData[DEFAULT_LANGUAGE] ?? {};
const DEFAULT_WEB_LANGUAGE = 'zh-CN';
const LANGUAGE_EXPLICIT_SELECTION_KEY = 'loksystem.language.explicit';
const initialRendererLanguage =
  typeof window !== 'undefined' && !window.electronAPI ? DEFAULT_WEB_LANGUAGE : DEFAULT_LANGUAGE;
const webFallbackLanguage =
  DEFAULT_WEB_LANGUAGE === DEFAULT_LANGUAGE ? DEFAULT_LANGUAGE : [DEFAULT_WEB_LANGUAGE, DEFAULT_LANGUAGE];

const isBrowserWebRuntime = typeof window !== 'undefined' && !window.electronAPI;

function hasExplicitLanguageSelection(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(LANGUAGE_EXPLICIT_SELECTION_KEY) === '1';
}

function getInitialLanguageHint(): string {
  if (typeof localStorage === 'undefined') {
    return initialRendererLanguage;
  }

  if (isBrowserWebRuntime && !hasExplicitLanguageSelection()) {
    return DEFAULT_WEB_LANGUAGE;
  }

  return localStorage.getItem('i18nextLng') || initialRendererLanguage;
}

// Cache for loaded translations
const loadedTranslations = new Map<string, Record<string, unknown>>();

// Pre-populate cache with the synchronously loaded fallback locale
loadedTranslations.set(DEFAULT_LANGUAGE, fallbackLocale as Record<string, unknown>);

function getLocaleModules(locale: string): Record<string, unknown> {
  const normalized = normalizeLanguageCode(locale);
  const modules = localeData[normalized] ?? fallbackLocale;
  if (normalized === DEFAULT_LANGUAGE) return modules;
  return mergeWithFallback(fallbackLocale, modules);
}

async function loadLocaleModules(locale: string): Promise<Record<string, unknown>> {
  const normalized = normalizeLanguageCode(locale);
  const cached = loadedTranslations.get(normalized);
  if (cached) return cached;

  const modules = getLocaleModules(normalized);
  loadedTranslations.set(normalized, modules);
  return modules;
}

// Initialize i18n with fallback locale loaded synchronously to avoid FOUC.
// NOTE: We intentionally do NOT use i18next-browser-languagedetector here.
// In WebUI mode the browser's localStorage is on a different origin than the
// Electron renderer, so the detector would read the wrong (or missing) value
// and fall back to navigator.language, causing a language mismatch (Issue #1176).
// Instead, we use localStorage only as a hint for the initial render and let
// ConfigStorage (which bridges to the main process) be the single source of truth.
i18n
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': {
        translation: localeData['zh-CN'],
      },
      [DEFAULT_LANGUAGE]: {
        translation: fallbackLocale,
      },
    },
    lng: getInitialLanguageHint(),
    fallbackLng: isBrowserWebRuntime ? webFallbackLanguage : DEFAULT_LANGUAGE,
    debug: false,
    interpolation: { escapeValue: false },
  })
  .catch((error: Error) => {
    console.error('Failed to initialize i18n:', error);
  });

// Load initial language from ConfigStorage (single source of truth)
async function initLanguage(): Promise<void> {
  try {
    const savedLanguage = await ConfigStorage.get('language');
    const shouldForceWebChinese = isBrowserWebRuntime && !hasExplicitLanguageSelection();
    const language = shouldForceWebChinese ? DEFAULT_WEB_LANGUAGE : savedLanguage || initialRendererLanguage;
    await ensureAndSwitch(i18n, language, loadLocaleModules);
    // Sync to localStorage so next page load can use it as a fast hint
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('i18nextLng', normalizeLanguageCode(language));
    }
  } catch (error) {
    console.error('Failed to initialize language:', error);
  }
}

// Listen for language changes and lazy load translations
i18n.on('languageChanged', async (lang: string) => {
  const normalizedLang = normalizeLanguageCode(lang);
  if (i18n.hasResourceBundle(normalizedLang, 'translation')) return;

  try {
    const translation = await loadLocaleModules(normalizedLang);
    i18n.addResourceBundle(normalizedLang, 'translation', translation, true, true);
  } catch (error) {
    console.error(`Failed to load language ${normalizedLang}:`, error);
  }
});

// Initialize on module load
void initLanguage();

// Listen for language changes broadcast by the main process (from other renderers).
// This enables real-time sync between desktop and WebUI — when one changes language,
// the other updates immediately without requiring a restart.
ipcBridge.systemSettings.languageChanged.on(async ({ language }) => {
  const normalized = normalizeLanguageCode(language);
  // Skip if already on this language (we're the one who triggered the change)
  if (i18n.language === normalized) return;
  await ensureAndSwitch(i18n, normalized, loadLocaleModules);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('i18nextLng', normalized);
  }
});

/**
 * Change language with lazy loading.
 */
export async function changeLanguage(lang: string): Promise<void> {
  await ensureAndSwitch(i18n, lang, loadLocaleModules);
  const normalized = normalizeLanguageCode(lang);
  await ConfigStorage.set('language', normalized);
  // Keep localStorage in sync so WebUI can use it as a fast hint on next load
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('i18nextLng', normalized);
    localStorage.setItem(LANGUAGE_EXPLICIT_SELECTION_KEY, '1');
  }
  // Notify main process to sync i18n (for tray menu, etc.)
  ipcBridge.systemSettings.changeLanguage.invoke({ language: normalized }).catch(() => {});
}

// Clear translation cache (useful for development/testing)
export function clearTranslationCache(): void {
  loadedTranslations.clear();
}

// Get loaded languages
export function getLoadedLanguages(): string[] {
  return Array.from(loadedTranslations.keys());
}

export default i18n;
