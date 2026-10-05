import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { statusKey } from '@/lib/auth/labels';
import type { TechnicianStatus } from '@/lib/auth/mobile-session';
import { useTranslation } from '@/providers/preferences-provider';

/** Technician availability, with the same colour roles as the web admin's status badge. */
export function StatusChip({ status }: { status: TechnicianStatus }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const label = t(statusKey(status));
  const colors = {
    AVAILABLE: { background: theme.secondary, border: theme.border, text: theme.secondaryText },
    BUSY: { background: theme.infoSurface, border: theme.infoBorder, text: theme.primary },
    OFFLINE: { background: theme.muted, border: theme.border, text: theme.textSecondary },
    ON_LEAVE: { background: theme.secondary, border: theme.border, text: theme.text },
    INACTIVE: { background: 'transparent', border: theme.border, text: theme.textSecondary },
  }[status];
  return (
    <View
      accessible
      accessibilityLabel={t('a11y.status', { status: label })}
      style={[styles.chip, { backgroundColor: colors.background, borderColor: colors.border }]}
    >
      <Text variant="caption" style={[styles.text, { color: colors.text }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  text: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
});
