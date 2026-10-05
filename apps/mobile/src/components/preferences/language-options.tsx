import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LANGUAGES } from '@/i18n';
import { usePreferences } from '@/providers/preferences-provider';

/** English, Hindi and Telugu, each written in its own script. Applies immediately. */
export function LanguageOptions() {
  const theme = useTheme();
  const { t, language, setLanguage } = usePreferences();

  return (
    <View role="radiogroup" aria-label={t('settings.language')} style={styles.list}>
      {LANGUAGES.map((option) => {
        const selected = option.code === language;
        const translated = t(`languages.${option.code}`);
        return (
          <Pressable
            key={option.code}
            role="radio"
            aria-checked={selected}
            aria-label={translated === option.nativeName ? option.nativeName : `${option.nativeName}, ${translated}`}
            onPress={() => setLanguage(option.code)}
            style={({ pressed }) => [
              styles.option,
              {
                borderColor: selected ? theme.primary : theme.border,
                backgroundColor: selected ? theme.secondary : pressed ? theme.muted : theme.card,
              },
              selected ? styles.selected : null,
            ]}
          >
            <View style={styles.names}>
              <Text variant="heading" style={styles.native}>
                {option.nativeName}
              </Text>
              {translated !== option.nativeName ? (
                <Text variant="caption" tone="secondary">
                  {translated}
                </Text>
              ) : null}
            </View>
            <View style={[styles.radio, { borderColor: selected ? theme.primary : theme.ring }]}>
              {selected ? <View style={[styles.dot, { backgroundColor: theme.primary }]} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 60,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.lg,
  },
  selected: { borderWidth: 2, paddingHorizontal: Spacing.lg - 1, paddingVertical: Spacing.md - 1 },
  names: { flex: 1, gap: 2 },
  native: { letterSpacing: 0 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
