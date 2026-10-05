import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackButton } from '@/components/back-button';
import { Icon, type IconName } from '@/components/icon';
import { LanguageOptions } from '@/components/preferences/language-options';
import { ThemeOptions } from '@/components/preferences/theme-options';
import { StatusChip } from '@/components/status-chip';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { initials } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';
import { usePreferences } from '@/providers/preferences-provider';

/** Language and theme, available before and after sign-in, plus the signed-in account and Sign out. */
export default function SettingsScreen() {
  const { t } = usePreferences();
  const { state, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [signedOutHere, setSignedOutHere] = useState(false);
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const account = state.status === 'ready' && state.session.technician ? { session: state.session, technician: state.session.technician } : null;

  // Settings is open before sign-in too, so after signing out here, go on to the sign-in screen.
  useEffect(() => {
    if (signedOutHere && state.status === 'signedOut') router.replace('/sign-in');
  }, [signedOutHere, state.status]);

  async function onSignOut() {
    setSigningOut(true);
    setSignedOutHere(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <Screen>
      <BackButton label={t('common.back')} />
      <View style={styles.heading}>
        <Text variant="title">{t('settings.title')}</Text>
        <Text tone="secondary">{t('settings.subtitle')}</Text>
      </View>
      {account ? (
        <View style={styles.section}>
          <Text variant="label">{t('settings.account')}</Text>
          <AccountCard
            name={account.technician.displayName}
            detail={`${t('roles.TECHNICIAN')}${account.technician.employeeNumber ? ` · ${account.technician.employeeNumber}` : ''}`}
            status={account.technician.status}
            workspace={account.session.organization.name || 'ServiceFlow'}
            email={account.session.user.email}
          />
          <Text variant="caption" tone="secondary">
            {t('settings.availability')}
          </Text>
        </View>
      ) : null}
      <View style={styles.section}>
        <Text variant="label">{t('settings.language')}</Text>
        <LanguageOptions />
      </View>
      <View style={styles.section}>
        <Text variant="label">{t('appearance.title')}</Text>
        <ThemeOptions />
      </View>
      {account ? <Button title={t('common.signOut')} icon="signOut" variant="secondary" loading={signingOut} onPress={onSignOut} /> : null}
      <Text variant="caption" tone="secondary" style={styles.center}>
        {t('settings.version', { version })}
      </Text>
    </Screen>
  );
}

interface AccountCardProps {
  name: string;
  detail: string;
  status: Parameters<typeof StatusChip>[0]['status'];
  workspace: string;
  email: string;
}

function AccountCard({ name, detail, status, workspace, email }: AccountCardProps) {
  const theme = useTheme();
  const { t } = usePreferences();
  return (
    <Card>
      <View style={styles.profile}>
        <View style={[styles.avatar, { backgroundColor: theme.secondary }]}>
          <Text variant="heading" style={{ color: theme.secondaryText }}>
            {initials(name)}
          </Text>
        </View>
        <View style={styles.profileText}>
          <Text variant="heading" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="caption" tone="secondary">
            {detail}
          </Text>
        </View>
        <StatusChip status={status} />
      </View>
      <View style={[styles.divider, { backgroundColor: theme.border }]} />
      <Detail icon="workspace" label={t('home.workspace')} value={workspace} />
      <Detail icon="badge" label={t('home.signedInAs')} value={email} />
    </Card>
  );
}

function Detail({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.detail}>
      <Icon name={icon} color={theme.textSecondary} size={18} />
      <Text variant="caption" tone="secondary" style={styles.detailLabel}>
        {label}
      </Text>
      <Text variant="caption" style={styles.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { gap: Spacing.sm },
  section: { gap: Spacing.md },
  center: { textAlign: 'center' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: { width: 48, height: 48, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  profileText: { flex: 1, gap: 2 },
  divider: { height: StyleSheet.hairlineWidth },
  detail: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  detailLabel: { width: 104 },
  detailValue: { flex: 1, fontWeight: '600' },
});
