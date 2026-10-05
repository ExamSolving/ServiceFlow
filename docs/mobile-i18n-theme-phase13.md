# Technician app: languages and themes — phase 13

## Scope

Mobile app only (`apps/mobile`). English, Hindi and Telugu for every screen and message, a System / Light /
Dark theme, a first-launch screen that asks for the language before sign-in, and a Settings screen reachable
from every screen. The web admin is unchanged.

## How it works

- **Preferences** (`src/providers/preferences-provider.tsx`, pure helpers in `src/lib/preferences.ts`):
  `language`, `languageConfirmed` and `theme`, saved as JSON in AsyncStorage under
  `serviceflow.preferences.v1` and validated when read (anything invalid counts as not saved). The phone's
  language is read with `expo-localization` after mount (the first render is identical everywhere, so web
  pre-rendering hydrates cleanly) and pre-selects English, Hindi or Telugu; anything else defaults to English.
- **Gate** (`src/app/_layout.tsx`): a `Stack.Protected` group shows `welcome` until a language is confirmed;
  every other group also requires it. `settings` is available in every signed-in or signed-out state once a
  language is chosen. The splash screen stays up until preferences are loaded.
- **Theme**: `resolveColorScheme(theme, system)` picks the palette; `useTheme()` and the navigation theme read
  it from the provider. On iOS and Android `Appearance.setColorScheme` keeps native controls (keyboard,
  dialogs) in step; the status bar follows too. `userInterfaceStyle` stays `automatic`.
- **Translations** (`src/i18n`): `messages/en.ts` is the source; `hi.ts` and `te.ts` are typed `Messages`, so
  missing or extra keys fail type checking. `t(key, params)` is typed from the English text: keys that contain
  `{{placeholders}}` require exactly those values. Missing text falls back to English, then to the key.
  Dates use `en-GB`, `hi-IN` or `te-IN`.
- **No English leaks**: the auth provider now stores codes (`notice: 'sessionEnded'`, error `reason`:
  `network | server | unexpected | config | startup`) and screens translate them; Firebase errors map to keys
  (`authErrorKey`); server `reason` values map to `accountStatus.unavailable.*`. Role and status names come from
  `roles.*` and `technicianStatus.*`.
- **Typography**: `Text` raises line heights and removes letter spacing for Devanagari and Telugu, which need
  room for vowel signs and break apart when letter-spaced. System fonts render both scripts on iOS and Android.
- **Firebase emails**: `auth.languageCode` follows the chosen language.
- **Accessibility**: language and theme pickers are radio groups (`role="radio"`, `aria-checked`), so screen
  readers announce the selection on iOS, Android and web.

## Files

Created: `src/i18n/{index,languages,translate,types}.ts`, `src/i18n/messages/{en,hi,te}.ts`,
`src/lib/preferences.ts`, `src/providers/preferences-provider.tsx`, `src/app/{welcome,settings}.tsx`,
`src/components/top-bar.tsx`, `src/components/preferences/{language-options,theme-options}.tsx`,
`scripts/test-i18n.mjs`.

Changed: every screen (`_layout`, `sign-in`, `forgot-password`, `verify-email`, `account-status`,
`(app)/index`), `providers/auth-provider.tsx` (codes instead of English text), `lib/auth/auth-errors.ts`
(`authErrorKey`), `lib/auth/labels.ts` (translation keys), `lib/format.ts` (`greetingKey`, locale-aware
`formatToday`), `components/ui/{text,text-field,button}.tsx`, `components/{status-chip,back-button,icon}.tsx`,
`hooks/use-theme.ts`, `scripts/test-auth.mjs`, `scripts/helpers/module-hooks.mjs`, `package.json`
(`expo-localization` ~57.0.2, `npm test` runs both suites), `package-lock.json`, `app.json`
(`expo-localization` config plugin, added by `expo install`).

## Known limitations

The Hindi and Telugu text should be reviewed by native speakers before release. The app's name stays
"ServiceFlow" in every language. Emails from Firebase are only translated where Firebase has a template for
the language. The web admin remains English-only.

## Test checklist

`npm test` in `apps/mobile` (auth 8/8, languages and themes 9/9 — completeness, placeholders, real
translation, fallbacks, detection, saved preferences, theme resolution, localized dates), `npm run typecheck`,
`npm run lint`, `npx expo export --platform android --platform ios`. Browser run of the web build against the
Firebase Auth emulator: 13 language and theme steps (first launch on a Telugu phone, live switching, Dark,
persistence after reopening, translated validation and Firebase errors, Telugu home and date, Settings to
Hindi and Light, System following the phone, translated account messages, Telugu verify-email with countdown,
English phone) plus the 16 English sign-in steps from phase 12.

Still to check on real phones: Hindi and Telugu rendering with the system fonts, the theme switch while the
keyboard is open, and that the choice survives an app update.
