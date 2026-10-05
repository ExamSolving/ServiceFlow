import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from './text';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  title: string;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, variant = 'primary', icon, loading = false, disabled = false, style, ...props }: ButtonProps) {
  const theme = useTheme();
  const colors = {
    primary: { background: theme.primary, pressed: theme.primaryPressed, border: theme.primary, text: theme.primaryText },
    secondary: { background: theme.card, pressed: theme.muted, border: theme.border, text: theme.text },
    ghost: { background: 'transparent', pressed: theme.muted, border: 'transparent', text: theme.primary },
  }[variant];
  const inactive = Boolean(disabled) || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: pressed ? colors.pressed : colors.background, borderColor: colors.border },
        disabled && !loading ? styles.disabled : null,
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} color={colors.text} size={18} /> : null}
          <Text variant="label" style={[styles.label, { color: colors.text }]}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, maxWidth: '100%' },
  label: { textAlign: 'center', flexShrink: 1 },
  disabled: { opacity: 0.5 },
});
