import { isLanguage, type Language } from '@/i18n';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

/** What the app remembers on this phone. */
export interface StoredPreferences {
  language: Language;
  /** False until the technician has confirmed a language on the welcome screen. */
  languageConfirmed: boolean;
  theme: ThemePreference;
}

export const PREFERENCES_KEY = 'serviceflow.preferences.v1';

export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference);
}

/** Read saved preferences; anything missing or invalid is treated as not saved. */
export function parsePreferences(raw: string | null | undefined): StoredPreferences | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (!isLanguage(record.language)) return null;
  return {
    language: record.language,
    languageConfirmed: record.languageConfirmed === true,
    theme: isThemePreference(record.theme) ? record.theme : 'system',
  };
}

export function serializePreferences(preferences: StoredPreferences): string {
  const { language, languageConfirmed, theme } = preferences;
  return JSON.stringify({ language, languageConfirmed, theme });
}

/** The colours to use: the technician's choice, or the phone's setting for "system". */
export function resolveColorScheme(theme: ThemePreference, system: string | null | undefined): ColorScheme {
  if (theme === 'light' || theme === 'dark') return theme;
  return system === 'dark' ? 'dark' : 'light';
}
