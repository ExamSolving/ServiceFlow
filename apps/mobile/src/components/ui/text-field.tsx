import { useState, type Ref } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Icon } from '@/components/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePreferences } from '@/providers/preferences-provider';
import { Text } from './text';

interface TextFieldProps extends Omit<TextInputProps, 'style' | 'secureTextEntry'> {
  label: string;
  error?: string | null;
  /** Hide the value and offer a Show/Hide control, for passwords. */
  secure?: boolean;
  ref?: Ref<TextInput>;
}

export function TextField({ label, error, secure = false, ref, onFocus, onBlur, editable = true, ...props }: TextFieldProps) {
  const theme = useTheme();
  const { t, colorScheme } = usePreferences();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const borderColor = error ? theme.danger : focused ? theme.ring : theme.border;

  return (
    <View style={styles.field}>
      <Text variant="label">{label}</Text>
      <View
        style={[
          styles.control,
          { borderColor, backgroundColor: editable ? theme.card : theme.muted },
          focused ? { borderWidth: 2, paddingHorizontal: Spacing.md - 1 } : null,
        ]}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error ?? undefined}
          placeholderTextColor={theme.textSecondary}
          selectionColor={theme.primary}
          cursorColor={theme.primary}
          secureTextEntry={secure && !revealed}
          keyboardAppearance={colorScheme}
          editable={editable}
          style={[styles.input, { color: theme.text }]}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          {...props}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? t('common.hidePassword') : t('common.showPassword')}
            hitSlop={8}
            onPress={() => setRevealed((value) => !value)}
            style={styles.reveal}
          >
            <Icon name={revealed ? 'hide' : 'show'} color={theme.textSecondary} size={20} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.xs + 2 },
  control: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
  },
  // The control draws its own focus ring, so the browser's outline is turned off (web only; no effect on phones).
  input: { flex: 1, fontSize: 16, paddingVertical: Spacing.md, outlineWidth: 0 },
  reveal: { paddingLeft: Spacing.sm, paddingVertical: Spacing.xs },
});
