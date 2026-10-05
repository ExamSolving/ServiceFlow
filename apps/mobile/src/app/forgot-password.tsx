import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackButton } from '@/components/back-button';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { authErrorKey, type AuthErrorKey } from '@/lib/auth/auth-errors';
import { isEmail } from '@/lib/validation';
import { useAuth } from '@/providers/auth-provider';
import { useTranslation } from '@/providers/preferences-provider';

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ email?: string }>();
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [error, setError] = useState<'validation.emailRequired' | 'validation.emailInvalid' | null>(null);
  const [formError, setFormError] = useState<AuthErrorKey | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    const value = email.trim();
    if (!value) return setError('validation.emailRequired');
    if (!isEmail(value)) return setError('validation.emailInvalid');
    setError(null);
    setFormError(null);
    setSubmitting(true);
    try {
      await sendPasswordReset(value);
      setSentTo(value);
    } catch (caught) {
      setFormError(authErrorKey(caught));
    } finally {
      setSubmitting(false);
    }
  }

  function backToSignIn() {
    if (router.canGoBack()) router.back();
    else router.replace('/sign-in');
  }

  if (sentTo) {
    return (
      <Screen centered>
        <View style={[styles.badge, { backgroundColor: theme.secondary }]}>
          <Icon name="mail" color={theme.primary} size={28} />
        </View>
        <View style={styles.heading}>
          <Text variant="title">{t('forgotPassword.sentTitle')}</Text>
          <Text tone="secondary">{t('forgotPassword.sentBody', { email: sentTo })}</Text>
          <Text variant="caption" tone="secondary">
            {t('forgotPassword.spamHint')}
          </Text>
        </View>
        <View style={styles.actions}>
          <Button title={t('forgotPassword.backToSignIn')} onPress={backToSignIn} />
          <Button title={t('forgotPassword.differentEmail')} variant="ghost" onPress={() => setSentTo(null)} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <BackButton label={t('forgotPassword.back')} />
      <View style={styles.heading}>
        <Text variant="title">{t('forgotPassword.title')}</Text>
        <Text tone="secondary">{t('forgotPassword.subtitle')}</Text>
      </View>
      {formError ? <Notice tone="danger">{t(formError)}</Notice> : null}
      <View style={styles.actions}>
        <TextField
          label={t('common.email')}
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setError(null);
          }}
          error={error ? t(error) : null}
          placeholder={t('common.emailPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="username"
          keyboardType="email-address"
          returnKeyType="send"
          onSubmitEditing={submit}
          editable={!submitting}
        />
        <Button title={t('forgotPassword.submit')} loading={submitting} onPress={submit} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: Spacing.sm },
  actions: { gap: Spacing.md },
  badge: { width: 56, height: 56, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
});
