import { Text as NativeText, Platform, StyleSheet, type TextProps as NativeTextProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { usePreferences } from '@/providers/preferences-provider';

type Variant = 'title' | 'heading' | 'body' | 'label' | 'caption' | 'eyebrow' | 'mono';
type Tone = 'default' | 'secondary' | 'primary' | 'danger' | 'onPrimary';

export interface TextProps extends NativeTextProps {
  variant?: Variant;
  tone?: Tone;
}

export function Text({ variant = 'body', tone = 'default', style, ...props }: TextProps) {
  const theme = useTheme();
  const { language } = usePreferences();
  const color = {
    default: theme.text,
    secondary: theme.textSecondary,
    primary: theme.primary,
    danger: theme.danger,
    onPrimary: theme.primaryText,
  }[tone];
  return (
    <NativeText
      accessibilityRole={variant === 'title' ? 'header' : undefined}
      style={[styles[variant], language === 'en' ? null : indic[variant], { color }, style]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6 },
  heading: { fontSize: 17, lineHeight: 23, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 22 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18 },
  eyebrow: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
  mono: { fontSize: 13, lineHeight: 19, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
});

/**
 * Devanagari and Telugu need taller lines for vowel signs above and below the
 * letters, and no letter spacing (it breaks joined letters apart).
 */
const indic = StyleSheet.create({
  title: { lineHeight: 40, letterSpacing: 0 },
  heading: { lineHeight: 29, letterSpacing: 0 },
  body: { lineHeight: 27 },
  label: { lineHeight: 25 },
  caption: { lineHeight: 23 },
  eyebrow: { fontSize: 12, lineHeight: 18, letterSpacing: 0 },
  mono: {},
});
