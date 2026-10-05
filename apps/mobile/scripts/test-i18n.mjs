// Unit tests for languages and theme: every translation is complete and keeps
// its placeholders, language detection, saved preferences and theme choice.
// Run with: npm test
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./helpers/module-hooks.mjs', import.meta.url);

const { LANGUAGES, MESSAGES, createTranslator, hasMessage, pickLanguage } = await import('../src/i18n/index.ts');
const { parsePreferences, resolveColorScheme, serializePreferences } = await import('../src/lib/preferences.ts');
const { formatToday } = await import('../src/lib/format.ts');

/** Every leaf of a messages object, as [key, text]. */
function leaves(node, prefix = '') {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value]] : leaves(value, `${prefix}${key}.`),
  );
}
const placeholders = (text) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();

const tests = [];
const test = (name, run) => tests.push({ name, run });

const english = new Map(leaves(MESSAGES.en));

test('Hindi and Telugu have every English message, and nothing extra', () => {
  assert.ok(english.size > 100, `expected the full catalogue, got ${english.size} messages`);
  for (const language of ['hi', 'te']) {
    const translated = new Map(leaves(MESSAGES[language]));
    assert.deepEqual([...translated.keys()].sort(), [...english.keys()].sort(), `${language} keys differ from English`);
    for (const [key, text] of translated) assert.ok(text.trim().length > 0, `${language}.${key} is empty`);
  }
});

test('translations keep the same {{placeholders}} as English', () => {
  for (const language of ['hi', 'te']) {
    for (const [key, text] of leaves(MESSAGES[language])) {
      assert.deepEqual(placeholders(text), placeholders(english.get(key)), `${language}.${key}`);
    }
  }
});

test('Hindi and Telugu screens are really translated, with brand names and settings kept as they are', () => {
  const sameAsEnglish = { hi: [], te: [] };
  for (const language of ['hi', 'te']) {
    for (const [key, text] of leaves(MESSAGES[language])) if (text === english.get(key)) sameAsEnglish[language].push(key);
  }
  // Only the example email address stays identical.
  assert.deepEqual(sameAsEnglish.hi, ['common.emailPlaceholder']);
  assert.deepEqual(sameAsEnglish.te, ['common.emailPlaceholder']);
  assert.match(MESSAGES.hi.signIn.title, /[ऀ-ॿ]/, 'Hindi uses Devanagari');
  assert.match(MESSAGES.te.signIn.title, /[ఀ-౿]/, 'Telugu uses Telugu script');
  for (const language of ['hi', 'te']) {
    assert.ok(MESSAGES[language].signIn.title.includes('ServiceFlow'));
    assert.ok(MESSAGES[language].errors.invalidApiKey.includes('EXPO_PUBLIC_FIREBASE_API_KEY'));
    assert.ok(MESSAGES[language].accountStatus.misconfigured.body.includes('apps/mobile/.env.local'));
  }
  // Telugu loanwords keep a zero-width non-joiner, so పాస్‌వర్డ్ doesn't fuse into a conjunct.
  assert.ok(MESSAGES.te.common.password.includes('‌'));
  assert.ok(!leaves(MESSAGES.te).some(([, text]) => text.includes('~')), 'no leftover markers');
});

test('translates with placeholders and falls back to English, then the key', () => {
  const te = createTranslator('te');
  const hi = createTranslator('hi');
  const en = createTranslator('en');
  assert.equal(en('home.greetingMorning', { name: 'Tess' }), 'Good morning, Tess');
  assert.equal(hi('home.greetingMorning', { name: 'Tess' }), 'सुप्रभात, Tess');
  assert.equal(te('verifyEmail.resendIn', { seconds: 42 }), '42 సెకన్ల తర్వాత మళ్లీ పంపండి');
  assert.equal(en('accountStatus.roleNotSupported.body', { role: 'Dispatcher', organization: 'Acme' }).startsWith('You’re signed in as Dispatcher at Acme.'), true);
  assert.equal(en('settings.version', {}), 'ServiceFlow technician app · version {{version}}', 'leaves unknown placeholders visible');

  const original = MESSAGES.hi.common.back;
  MESSAGES.hi.common.back = undefined;
  try {
    assert.equal(createTranslator('hi')('common.back'), 'Back', 'falls back to English');
  } finally {
    MESSAGES.hi.common.back = original;
  }
  assert.equal(en('nothing.here'), 'nothing.here');
  assert.ok(hasMessage('accountStatus.unavailable.MEMBERSHIP_INACTIVE'));
  assert.ok(!hasMessage('accountStatus.unavailable.SOMETHING_NEW'));
});

test('covers every reason the server can give for an unavailable account', () => {
  for (const reason of ['PROFILE_MISSING', 'USER_INACTIVE', 'NO_ORGANIZATION', 'MEMBERSHIP_MISSING', 'MEMBERSHIP_INACTIVE',
    'MEMBERSHIP_INVALID', 'ORGANIZATION_MISSING', 'ORGANIZATION_INACTIVE']) {
    assert.ok(hasMessage(`accountStatus.unavailable.${reason}`), reason);
  }
  for (const role of ['OWNER', 'ADMIN', 'MANAGER', 'DISPATCHER', 'TECHNICIAN', 'ACCOUNTANT']) assert.ok(hasMessage(`roles.${role}`));
  for (const status of ['AVAILABLE', 'BUSY', 'OFFLINE', 'ON_LEAVE', 'INACTIVE']) assert.ok(hasMessage(`technicianStatus.${status}`));
});

test('picks the phone’s first supported language, otherwise English', () => {
  assert.deepEqual(LANGUAGES.map((option) => option.code), ['en', 'hi', 'te']);
  assert.equal(pickLanguage(['te-IN', 'en-US']), 'te');
  assert.equal(pickLanguage(['hi']), 'hi');
  assert.equal(pickLanguage(['ta-IN', 'hi-IN']), 'hi');
  assert.equal(pickLanguage(['TE_in']), 'te');
  assert.equal(pickLanguage([null, undefined, '', 'fr-FR']), 'en');
  assert.equal(pickLanguage([]), 'en');
});

test('reads and writes saved preferences defensively', () => {
  const saved = { language: 'te', languageConfirmed: true, theme: 'dark' };
  assert.deepEqual(parsePreferences(serializePreferences(saved)), saved);
  assert.equal(parsePreferences(null), null);
  assert.equal(parsePreferences(''), null);
  assert.equal(parsePreferences('{not json'), null);
  assert.equal(parsePreferences('"te"'), null);
  assert.equal(parsePreferences('{"language":"fr","languageConfirmed":true}'), null);
  assert.deepEqual(parsePreferences('{"language":"hi","languageConfirmed":"yes","theme":"neon"}'),
    { language: 'hi', languageConfirmed: false, theme: 'system' });
  assert.equal(serializePreferences({ ...saved, extra: 'ignored' }), '{"language":"te","languageConfirmed":true,"theme":"dark"}');
});

test('the theme follows the choice, or the phone for System', () => {
  assert.equal(resolveColorScheme('system', 'dark'), 'dark');
  assert.equal(resolveColorScheme('system', 'light'), 'light');
  assert.equal(resolveColorScheme('system', null), 'light');
  assert.equal(resolveColorScheme('system', 'unspecified'), 'light');
  assert.equal(resolveColorScheme('light', 'dark'), 'light');
  assert.equal(resolveColorScheme('dark', 'light'), 'dark');
});

test('dates use the chosen language', () => {
  const evening = new Date('2026-10-04T20:00:00Z'); // Monday 01:30 in India
  for (const option of LANGUAGES) {
    const text = formatToday('Asia/Kolkata', option.locale, evening);
    assert.match(text, /, /, option.code);
    assert.match(text, /5/, option.code);
  }
  // Month spellings vary slightly between ICU versions on phones (अक्तूबर / अक्टूबर), so match the shape.
  assert.match(formatToday('Asia/Kolkata', 'hi-IN', evening), /^सोमवार, 5 [\u0900-\u097f]+$/);
  assert.match(formatToday('Asia/Kolkata', 'te-IN', evening), /^సోమవారం, 5 [\u0c00-\u0c7f]+$/);
});

let failed = 0;
for (const { name, run } of tests) {
  try {
    await run();
    console.log(`✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${name}\n`, error);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} language and theme tests passed`);
if (failed) process.exitCode = 1;
