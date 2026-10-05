import type { ReactElement, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type RefreshControlProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ScreenProps {
  children: ReactNode;
  /** Vertically centre short content such as the sign-in form. */
  centered?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  /** Pinned below the scrolling content, for example a job's action buttons. */
  footer?: ReactNode;
}

/** Safe-area aware, scrollable page that keeps inputs clear of the keyboard. */
export function Screen({ children, centered = false, refreshControl, footer }: ScreenProps) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.content, centered ? styles.centered : null]}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.inner}>{children}</View>
        </ScrollView>
        {footer ? <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.xl },
  centered: { justifyContent: 'center' },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.xl },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
});
