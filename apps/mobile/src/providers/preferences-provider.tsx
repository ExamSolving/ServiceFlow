import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, Platform } from 'react-native';

import { useColorScheme as useSystemColorScheme } from '@/hooks/use-color-scheme';
import { DEFAULT_LANGUAGE, createTranslator, languageOption, pickLanguage, type Language, type Translate } from '@/i18n';
import { getFirebaseAuth } from '@/lib/firebase/client';
import {
  PREFERENCES_KEY,
  parsePreferences,
  resolveColorScheme,
  serializePreferences,
  type ColorScheme,
  type StoredPreferences,
  type ThemePreference,
} from '@/lib/preferences';

interface PreferencesContextValue {
  /** False until saved choices have been read from the phone. */
  ready: boolean;
  language: Language;
  /** False until the technician confirms a language on the welcome screen. */
  languageConfirmed: boolean;
  theme: ThemePreference;
  /** The colours in use: the chosen theme, or the phone's setting for "system". */
  colorScheme: ColorScheme;
  /** Locale for dates and numbers, for example "te-IN". */
  locale: string;
  t: Translate;
  setLanguage(language: Language): void;
  confirmLanguage(): void;
  setTheme(theme: ThemePreference): void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

/** The phone's preferred language if the app supports it, otherwise English. */
function deviceLanguage(): Language {
  try {
    return pickLanguage(getLocales().map((locale) => locale.languageTag ?? locale.languageCode));
  } catch {
    return pickLanguage([]);
  }
}

type State = StoredPreferences & { ready: boolean };

// The phone's language is read after mount, so the first render is the same everywhere (including web pre-rendering).
const INITIAL_STATE: State = { language: DEFAULT_LANGUAGE, languageConfirmed: false, theme: 'system', ready: false };

/**
 * Language and theme for this phone. Both are saved on the device and work
 * before sign-in, so the technician picks a language before using the app.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(INITIAL_STATE);
  const systemScheme = useSystemColorScheme();
  const { ready, language, languageConfirmed, theme } = state;

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(PREFERENCES_KEY)
      .catch(() => null)
      .then((raw) => {
        if (!active) return;
        const saved = parsePreferences(raw);
        setState({ ...(saved ?? { language: deviceLanguage(), languageConfirmed: false, theme: 'system' }), ready: true });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(PREFERENCES_KEY, serializePreferences({ language, languageConfirmed, theme })).catch(() => {
      // Not saved: the choice still applies until the app is closed.
    });
  }, [ready, language, languageConfirmed, theme]);

  // Keyboards and system dialogs follow the chosen theme too.
  useEffect(() => {
    if (!ready || Platform.OS === 'web' || typeof Appearance.setColorScheme !== 'function') return;
    Appearance.setColorScheme(theme === 'system' ? 'unspecified' : theme);
  }, [ready, theme]);

  // Firebase sends password-reset and verification emails in this language where it has a template for it.
  useEffect(() => {
    try {
      getFirebaseAuth().languageCode = language;
    } catch {
      // The app isn't configured yet; the account status screen explains.
    }
  }, [language]);

  const setLanguage = useCallback((next: Language) => setState((current) => ({ ...current, language: next })), []);
  const confirmLanguage = useCallback(() => setState((current) => ({ ...current, languageConfirmed: true })), []);
  const setTheme = useCallback((next: ThemePreference) => setState((current) => ({ ...current, theme: next })), []);

  const colorScheme = resolveColorScheme(theme, systemScheme);
  const t = useMemo(() => createTranslator(language), [language]);
  const value = useMemo<PreferencesContextValue>(
    () => ({
      ready,
      language,
      languageConfirmed,
      theme,
      colorScheme,
      locale: languageOption(language).locale,
      t,
      setLanguage,
      confirmLanguage,
      setTheme,
    }),
    [ready, language, languageConfirmed, theme, colorScheme, t, setLanguage, confirmLanguage, setTheme],
  );

  return <PreferencesContext value={value}>{children}</PreferencesContext>;
}

export function usePreferences(): PreferencesContextValue {
  const context = use(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used inside <PreferencesProvider>.');
  return context;
}

/** The translate function and locale for the chosen language. */
export function useTranslation() {
  const { t, language, locale } = usePreferences();
  return { t, language, locale };
}
