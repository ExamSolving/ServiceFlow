import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { TopBar } from '@/components/top-bar';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { authErrorKey, type AuthErrorKey } from '@/lib/auth/auth-errors';
import { useAuth } from '@/providers/auth-provider';
import { useTranslation } from '@/providers/preferences-provider';

const RESEND_COOLDOWN_SECONDS = 60;

/** Kept as keys so messages follow a language change. */
type Message = { kind: 'stillUnverified' } | { kind: 'sent' } | { kind: 'error'; key: AuthErrorKey };

export default function VerifyEmailScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { state, refresh, resendVerification, signOut } = useAuth();
  const email = state.status === 'unverified' ? state.email : '';
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function checkAgain() {
    setChecking(true);
    setMessage(null);
    let next: Awaited<ReturnType<typeof refresh>> = null;
    try {
      next = await refresh();
    } finally {
      setChecking(false);
    }
    if (next?.status === 'unverified') setMessage({ kind: 'stillUnverified' });
  }

  async function resend() {
    setSending(true);
    setMessage(null);
    try {
      await resendVerification();
      setMessage({ kind: 'sent' });
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      setMessage({ kind: 'error', key: authErrorKey(error) });
    } finally {
      setSending(false);
    }
  }

  const notice =
    message?.kind === 'stillUnverified'
      ? { tone: 'info' as const, text: t('verifyEmail.stillUnverified') }
      : message?.kind === 'sent'
        ? { tone: 'success' as const, text: t('verifyEmail.sent', { email }) }
        : message?.kind === 'error'
          ? { tone: 'danger' as const, text: t(message.key) }
          : null;

  return (
    <Screen centered>
      <TopBar />
      <View style={[styles.badge, { backgroundColor: theme.secondary }]}>
        <Icon name="mail" color={theme.primary} size={28} />
      </View>
      <View style={styles.heading}>
        <Text variant="title">{t('verifyEmail.title')}</Text>
        <Text tone="secondary">{email ? t('verifyEmail.body', { email }) : t('verifyEmail.bodyNoEmail')}</Text>
      </View>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <View style={styles.actions}>
        <Button title={t('verifyEmail.verified')} loading={checking} onPress={checkAgain} />
        <Button
          title={cooldown > 0 ? t('verifyEmail.resendIn', { seconds: cooldown }) : t('verifyEmail.resend')}
          variant="secondary"
          loading={sending}
          disabled={cooldown > 0 || checking}
          onPress={resend}
        />
        <Button title={t('common.signOut')} variant="ghost" disabled={checking || sending} onPress={signOut} />
      </View>
      <Text variant="caption" tone="secondary" style={styles.center}>
        {t('verifyEmail.spamHint')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: Spacing.sm },
  actions: { gap: Spacing.md },
  badge: { width: 56, height: 56, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
