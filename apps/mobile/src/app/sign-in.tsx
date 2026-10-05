import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type TextInput } from 'react-native';

import { TopBar } from '@/components/top-bar';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { authErrorKey, type AuthErrorKey } from '@/lib/auth/auth-errors';
import { isEmail } from '@/lib/validation';
import { useAuth } from '@/providers/auth-provider';
import { useTranslation } from '@/providers/preferences-provider';

/** Error messages are kept as keys, so they follow a language change. */
interface FormErrors {
  email?: 'validation.emailRequired' | 'validation.emailInvalid';
  password?: 'validation.passwordRequired';
  form?: AuthErrorKey;
}

export default function SignInScreen() {
  const { t } = useTranslation();
  const { state, notice, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const busy = submitting || state.status === 'loading';

  async function submit() {
    if (busy) return;
    const next: FormErrors = {};
    if (!email.trim()) next.email = 'validation.emailRequired';
    else if (!isEmail(email)) next.email = 'validation.emailInvalid';
    if (!password) next.password = 'validation.passwordRequired';
    setErrors(next);
    if (next.email || next.password) return;

    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (error) {
      setErrors({ form: authErrorKey(error) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen centered>
      <TopBar />
      <View style={styles.heading}>
        <Text variant="eyebrow" tone="primary">
          {t('signIn.eyebrow')}
        </Text>
        <Text variant="title">{t('signIn.title')}</Text>
        <Text tone="secondary">{t('signIn.subtitle')}</Text>
      </View>

      {notice === 'sessionEnded' ? <Notice>{t('notices.sessionEnded')}</Notice> : null}
      {errors.form ? <Notice tone="danger">{t(errors.form)}</Notice> : null}

      <View style={styles.form}>
        <TextField
          label={t('common.email')}
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            if (errors.email || errors.form) setErrors({});
          }}
          error={errors.email ? t(errors.email) : null}
          placeholder={t('common.emailPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="username"
          keyboardType="email-address"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          editable={!busy}
        />
        <TextField
          ref={passwordRef}
          label={t('common.password')}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (errors.password || errors.form) setErrors({});
          }}
          error={errors.password ? t(errors.password) : null}
          secure
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          editable={!busy}
        />
        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          disabled={busy}
          onPress={() => router.push({ pathname: '/forgot-password', params: email.trim() ? { email: email.trim() } : {} })}
          style={({ pressed }) => [styles.forgot, pressed ? styles.pressed : null]}
        >
          <Text variant="label" tone="primary">
            {t('signIn.forgot')}
          </Text>
        </Pressable>
        <Button title={t('common.signIn')} loading={busy} onPress={submit} />
      </View>

      <Text variant="caption" tone="secondary" style={styles.footer}>
        {t('signIn.footer')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: Spacing.sm },
  form: { gap: Spacing.lg },
  forgot: { alignSelf: 'flex-end', marginTop: -Spacing.xs },
  pressed: { opacity: 0.6 },
  footer: { textAlign: 'center' },
});
