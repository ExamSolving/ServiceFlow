import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from './text';

interface SheetProps {
  visible: boolean;
  title: string;
  /** Called for the backdrop and the Android back button. */
  onClose(): void;
  children: ReactNode;
}

/** A panel that slides up from the bottom of the screen, above the keyboard. */
export function Sheet({ visible, title, onClose, children }: SheetProps) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.35)' }]} onPress={onClose} />
        <SafeAreaView edges={['bottom']} style={[styles.panel, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.inner} accessibilityViewIsModal>
            <Text variant="heading" accessibilityRole="header">
              {title}
            </Text>
            {children}
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  backdrop: StyleSheet.absoluteFill,
  panel: { borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, borderWidth: 1, borderBottomWidth: 0 },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.xl, gap: Spacing.lg },
});
