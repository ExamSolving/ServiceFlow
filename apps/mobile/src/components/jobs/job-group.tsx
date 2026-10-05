import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';

/** A titled group of jobs on the jobs list, such as Today or Waiting. */
export function JobGroup({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <View style={styles.heading}>
        <Text variant="eyebrow" tone="secondary" accessibilityRole="header">
          {title}
        </Text>
        {count !== undefined ? (
          <Text variant="eyebrow" tone="secondary">
            {count}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.sm },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: Spacing.xs },
});
