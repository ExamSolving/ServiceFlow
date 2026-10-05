import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { jobStatusKey, priorityKey } from '@/lib/jobs/labels';
import type { JobPriority, JobStatus } from '@/lib/jobs/types';
import { useTranslation } from '@/providers/preferences-provider';

type Variant = 'positive' | 'attention' | 'info' | 'destructive' | 'neutral';

/** The same colour roles as the web admin's job status badge (jobStatusVariant). */
function variant(status: JobStatus): Variant {
  if (status === 'COMPLETED' || status === 'PAID' || status === 'CLOSED') return 'positive';
  if (status === 'ON_HOLD' || status === 'WAITING_APPROVAL' || status === 'QUOTATION_REQUIRED') return 'attention';
  if (status === 'CANCELLED' || status === 'REJECTED') return 'destructive';
  if (status === 'IN_PROGRESS' || status === 'EN_ROUTE' || status === 'ARRIVED' || status === 'DIAGNOSING') return 'info';
  return 'neutral';
}

function useColors(kind: Variant) {
  const theme = useTheme();
  return {
    positive: { background: theme.secondary, border: theme.border, text: theme.secondaryText },
    attention: { background: theme.secondary, border: theme.border, text: theme.text },
    info: { background: theme.infoSurface, border: theme.infoBorder, text: theme.primary },
    destructive: { background: theme.dangerSurface, border: theme.dangerBorder, text: theme.danger },
    neutral: { background: theme.muted, border: theme.border, text: theme.textSecondary },
  }[kind];
}

export function JobStatusChip({ status }: { status: JobStatus }) {
  const { t } = useTranslation();
  const colors = useColors(variant(status));
  const label = t(jobStatusKey(status));
  return (
    <View
      accessible
      accessibilityLabel={t('a11y.status', { status: label })}
      style={[styles.chip, { backgroundColor: colors.background, borderColor: colors.border }]}
    >
      <Text variant="caption" style={[styles.text, { color: colors.text }]}>
        {label}
      </Text>
    </View>
  );
}

/** Shown for High and Urgent jobs only, so it stands out. */
export function PriorityTag({ priority }: { priority: JobPriority }) {
  const { t } = useTranslation();
  const colors = useColors(priority === 'URGENT' ? 'destructive' : 'attention');
  if (priority !== 'HIGH' && priority !== 'URGENT') return null;
  return (
    <View style={[styles.chip, styles.row, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Icon name="priority" color={colors.text} size={12} />
      <Text variant="caption" style={[styles.text, { color: colors.text }]}>
        {t(priorityKey(priority))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  text: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
});
