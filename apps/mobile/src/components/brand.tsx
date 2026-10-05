import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The ServiceFlow logo, as on the web admin's sign-in page. */
export function Brand() {
  const theme = useTheme();
  return (
    <View style={styles.row} accessible accessibilityRole="image" accessibilityLabel="ServiceFlow">
      <View style={[styles.mark, { backgroundColor: theme.secondary, borderColor: theme.border }]}>
        <Icon name="brand" color={theme.secondaryText} size={20} />
      </View>
      <Text style={styles.word}>
        ServiceFlow<Text style={[styles.word, { color: theme.primary }]}>.</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm + 2 },
  mark: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  word: { fontSize: 21, lineHeight: 26, fontWeight: '700', letterSpacing: -0.8 },
});
