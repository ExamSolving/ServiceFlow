export type Language = 'en' | 'hi' | 'te';

export interface LanguageOption {
  code: Language;
  /** The language's own name, shown so people can always find it. */
  nativeName: string;
  /** Locale used for dates. */
  locale: string;
}

export const LANGUAGES: readonly LanguageOption[] = [
  { code: 'en', nativeName: 'English', locale: 'en-GB' },
  { code: 'hi', nativeName: 'हिन्दी', locale: 'hi-IN' },
  { code: 'te', nativeName: 'తెలుగు', locale: 'te-IN' },
];

export const DEFAULT_LANGUAGE: Language = 'en';

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((option) => option.code === value);
}

export function languageOption(language: Language): LanguageOption {
  return LANGUAGES.find((option) => option.code === language) ?? LANGUAGES[0];
}

/**
 * The first supported language in the phone's preferred languages, for example
 * "te-IN" → "te". Falls back to English.
 */
export function pickLanguage(preferred: readonly (string | null | undefined)[]): Language {
  for (const tag of preferred) {
    const code = tag?.trim().toLowerCase().split(/[-_]/)[0];
    if (isLanguage(code)) return code;
  }
  return DEFAULT_LANGUAGE;
}
