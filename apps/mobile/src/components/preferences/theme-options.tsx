import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ThemePreference } from '@/lib/preferences';
import { usePreferences } from '@/providers/preferences-provider';

const OPTIONS: { value: ThemePreference; icon: IconName; label: 'appearance.system' | 'appearance.light' | 'appearance.dark' }[] = [
  { value: 'system', icon: 'themeSystem', label: 'appearance.system' },
  { value: 'light', icon: 'themeLight', label: 'appearance.light' },
  { value: 'dark', icon: 'themeDark', label: 'appearance.dark' },
];

/** System, Light or Dark. Applies immediately. */
export function ThemeOptions() {
  const theme = useTheme();
  const { t, theme: selectedTheme, setTheme } = usePreferences();

  return (
    <View style={styles.wrap}>
      <View
        role="radiogroup"
        aria-label={t('appearance.title')}
        style={[styles.group, { borderColor: theme.border, backgroundColor: theme.muted }]}
      >
        {OPTIONS.map((option) => {
          const selected = option.value === selectedTheme;
          return (
            <Pressable
              key={option.value}
              role="radio"
              aria-checked={selected}
              aria-label={t(option.label)}
              onPress={() => setTheme(option.value)}
              style={({ pressed }) => [
                styles.segment,
                selected
                  ? { backgroundColor: theme.card, borderColor: theme.primary }
                  : { backgroundColor: pressed ? theme.secondary : 'transparent', borderColor: 'transparent' },
              ]}
            >
              <Icon name={option.icon} color={selected ? theme.primary : theme.textSecondary} size={20} />
              <Text variant="label" style={{ color: selected ? theme.primary : theme.textSecondary }} numberOfLines={1}>
                {t(option.label)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text variant="caption" tone="secondary">
        {t('appearance.systemHint')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  group: { flexDirection: 'row', gap: Spacing.xs, padding: Spacing.xs, borderWidth: 1, borderRadius: Radius.lg },
  segment: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
});
