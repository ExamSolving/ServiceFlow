import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { TopBar } from '@/components/top-bar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Translate } from '@/i18n';
import { roleKey } from '@/lib/auth/labels';
import { useAuth, type AuthState, type ErrorReason } from '@/providers/auth-provider';
import { useTranslation } from '@/providers/preferences-provider';

interface StatusContent {
  icon: IconName;
  title: string;
  body: string;
  /** Settings to list, for a build that is missing its configuration. */
  items?: string[];
  canRetry: boolean;
  canSignOut: boolean;
  /** Which action gets the primary button. */
  primary: 'retry' | 'signOut';
}

/** AccountUnavailableReason in apps/web/src/lib/auth/app-session.ts. */
const UNAVAILABLE_REASONS = [
  'PROFILE_MISSING',
  'USER_INACTIVE',
  'NO_ORGANIZATION',
  'MEMBERSHIP_MISSING',
  'MEMBERSHIP_INACTIVE',
  'MEMBERSHIP_INVALID',
  'ORGANIZATION_MISSING',
  'ORGANIZATION_INACTIVE',
] as const;
type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

const isUnavailableReason = (value: string | null): value is UnavailableReason =>
  UNAVAILABLE_REASONS.includes(value as UnavailableReason);

const ERROR_KEYS = {
  network: 'accountStatus.error.network',
  server: 'accountStatus.error.server',
  unexpected: 'accountStatus.error.unexpected',
  config: 'accountStatus.error.config',
  startup: 'accountStatus.error.startup',
} as const satisfies Record<ErrorReason, string>;

function describe(state: AuthState, t: Translate): StatusContent | null {
  if (state.status === 'misconfigured') {
    return {
      icon: 'settings',
      title: t('accountStatus.misconfigured.title'),
      body: t('accountStatus.misconfigured.body'),
      items: state.missing,
      canRetry: false,
      canSignOut: false,
      primary: 'retry',
    };
  }
  if (state.status === 'error') {
    return {
      icon: 'offline',
      title: t('accountStatus.error.title'),
      body: t(ERROR_KEYS[state.reason]),
      canRetry: true,
      canSignOut: true,
      primary: 'retry',
    };
  }
  if (state.status !== 'blocked') return null;

  // Names from the workspace stay as they are; "ServiceFlow" stands in when there is none.
  const organization = state.session?.organization.name || 'ServiceFlow';
  switch (state.reason) {
    case 'ROLE_NOT_SUPPORTED':
      return {
        icon: 'blocked',
        title: t('accountStatus.roleNotSupported.title'),
        body: t('accountStatus.roleNotSupported.body', {
          role: t(roleKey(state.session?.role ?? 'TECHNICIAN')),
          organization,
        }),
        canRetry: true,
        canSignOut: true,
        primary: 'signOut',
      };
    case 'PROFILE_MISSING':
      return {
        icon: 'account',
        title: t('accountStatus.profileMissing.title'),
        body: state.email
          ? t('accountStatus.profileMissing.body', { organization, email: state.email })
          : t('accountStatus.profileMissing.bodyNoEmail', { organization }),
        canRetry: true,
        canSignOut: true,
        primary: 'retry',
      };
    case 'PROFILE_INACTIVE':
      return {
        icon: 'blocked',
        title: t('accountStatus.profileInactive.title'),
        body: t('accountStatus.profileInactive.body', { organization }),
        canRetry: true,
        canSignOut: true,
        primary: 'retry',
      };
    case 'ACCOUNT_UNAVAILABLE':
      return {
        icon: 'account',
        title: t('accountStatus.unavailable.title'),
        body: isUnavailableReason(state.detail)
          ? t(`accountStatus.unavailable.${state.detail}`)
          : t('accountStatus.unavailable.fallback'),
        canRetry: true,
        canSignOut: true,
        primary: 'retry',
      };
  }
}

export default function AccountStatusScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { state, refresh, signOut } = useAuth();
  const [retrying, setRetrying] = useState(false);
  const [stillBlocked, setStillBlocked] = useState(false);
  const content = describe(state, t);
  if (!content) return null;

  async function retry() {
    setRetrying(true);
    setStillBlocked(false);
    let next: Awaited<ReturnType<typeof refresh>> = null;
    try {
      next = await refresh();
    } finally {
      setRetrying(false);
    }
    if (next?.status === 'blocked') setStillBlocked(true);
  }

  return (
    <Screen centered>
      <TopBar />
      <Card>
        <View style={[styles.badge, { backgroundColor: theme.secondary }]}>
          <Icon name={content.icon} color={theme.primary} size={26} />
        </View>
        <Text variant="heading">{content.title}</Text>
        <Text tone="secondary">{content.body}</Text>
        {content.items?.map((item) => (
          <Text key={item} variant="mono" style={[styles.item, { backgroundColor: theme.muted }]}>
            {item}
          </Text>
        ))}
        {(state.status === 'blocked' || state.status === 'error') && state.email ? (
          <Text variant="caption" tone="secondary">
            {t('accountStatus.signedInAs', { email: state.email })}
          </Text>
        ) : null}
      </Card>
      {stillBlocked ? <Notice>{t('accountStatus.nothingChanged')}</Notice> : null}
      <View style={[styles.actions, content.primary === 'signOut' ? styles.reversed : null]}>
        {content.canRetry ? (
          <Button
            title={t('common.tryAgain')}
            variant={content.primary === 'retry' ? 'primary' : 'secondary'}
            loading={retrying}
            onPress={retry}
          />
        ) : null}
        {content.canSignOut ? (
          <Button
            title={t('common.signOut')}
            icon="signOut"
            variant={content.primary === 'signOut' || !content.canRetry ? 'primary' : 'secondary'}
            disabled={retrying}
            onPress={signOut}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  item: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: Radius.sm, overflow: 'hidden' },
  actions: { gap: Spacing.md },
  reversed: { flexDirection: 'column-reverse' },
});
