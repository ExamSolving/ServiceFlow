import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCheckedAt } from '@/lib/format';
import type { SessionSync } from '@/providers/auth-provider';
import { useTranslation } from '@/providers/preferences-provider';

interface SyncBannerProps {
  sync: SessionSync;
  timeZone: string;
  onRetry(): void;
  /** What the saved details are: the account and jobs (home), or one job. */
  kind?: 'account' | 'job';
}

/** Shown while the app uses saved details because ServiceFlow can't be reached. */
export function SyncBanner({ sync, timeZone, onRetry, kind = 'account' }: SyncBannerProps) {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  if (sync.connection === 'online') return null;

  const time = formatCheckedAt(timeZone, locale, new Date(sync.checkedAt));
  const message =
    kind === 'job'
      ? sync.connection === 'offline'
        ? t('job.offline', { time })
        : t('job.unreachable', { time })
      : sync.connection === 'offline'
        ? t('home.offline', { time })
        : t('home.unreachable', { time });

  return (
    <View aria-live="polite" style={[styles.banner, { backgroundColor: theme.muted, borderColor: theme.border }]}>
      <Icon name="offline" color={theme.textSecondary} size={18} style={styles.icon} />
      <View style={styles.body}>
        <Text variant="caption">{message}</Text>
        <Pressable
          role="button"
          aria-label={t('common.tryAgain')}
          aria-busy={sync.checking}
          disabled={sync.checking}
          hitSlop={8}
          onPress={onRetry}
          style={({ pressed }) => [styles.retry, pressed ? styles.pressed : null]}
        >
          {sync.checking ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Text variant="label" tone="primary">
              {t('common.tryAgain')}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  icon: { marginTop: 2 },
  body: { flex: 1, alignItems: 'flex-start' },
  retry: { minHeight: 40, minWidth: 44, justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
