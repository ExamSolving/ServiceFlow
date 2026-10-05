import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Brand } from '@/components/brand';
import { Icon } from '@/components/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { languageOption } from '@/i18n';
import { usePreferences } from '@/providers/preferences-provider';

/** The logo, with a button to change language and theme from any screen. */
export function TopBar() {
  const theme = useTheme();
  const { t, language } = usePreferences();
  return (
    <View style={styles.row}>
      <Brand />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('settings.open')}
        hitSlop={6}
        onPress={() => router.push('/settings')}
        style={({ pressed }) => [
          styles.pill,
          { borderColor: theme.border, backgroundColor: pressed ? theme.muted : theme.card },
        ]}
      >
        <Icon name="language" color={theme.primary} size={16} />
        <Text variant="caption" style={styles.pillText} numberOfLines={1}>
          {languageOption(language).nativeName}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
    minHeight: 36,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.full,
  },
  pillText: { fontWeight: '600' },
});
