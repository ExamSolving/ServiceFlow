import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from './text';

interface NoticeProps {
  tone?: 'info' | 'danger' | 'success';
  children: string;
}

/** An inline message. Danger notices are announced by screen readers. */
export function Notice({ tone = 'info', children }: NoticeProps) {
  const theme = useTheme();
  const colors = {
    info: { background: theme.infoSurface, border: theme.infoBorder, text: theme.text, icon: theme.primary },
    success: { background: theme.secondary, border: theme.border, text: theme.secondaryText, icon: theme.primary },
    danger: { background: theme.dangerSurface, border: theme.dangerBorder, text: theme.danger, icon: theme.danger },
  }[tone];
  return (
    <View
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[styles.notice, { backgroundColor: colors.background, borderColor: colors.border }]}
    >
      <Icon name={tone === 'danger' ? 'alert' : tone === 'success' ? 'success' : 'info'} color={colors.icon} size={18} style={styles.icon} />
      <Text variant="caption" style={[styles.text, { color: colors.text }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  icon: { marginTop: 1 },
  text: { flex: 1 },
});
