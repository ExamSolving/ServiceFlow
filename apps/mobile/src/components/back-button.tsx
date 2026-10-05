import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function BackButton({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))}
      style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}
    >
      <Icon name="back" color={theme.primary} size={18} />
      <Text variant="label" tone="primary">
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, alignSelf: 'flex-start', paddingVertical: Spacing.xs },
  pressed: { opacity: 0.6 },
});
