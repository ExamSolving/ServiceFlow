import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCheckedAt, formatTime } from '@/lib/format';
import { jobStatusKey } from '@/lib/jobs/labels';
import { isMissed } from '@/lib/jobs/sections';
import type { JobSummary } from '@/lib/jobs/types';
import { useTranslation } from '@/providers/preferences-provider';
import { JobStatusChip, PriorityTag } from './job-status-chip';

interface JobRowProps {
  job: JobSummary;
  timeZone: string;
  now: Date;
  /** The job in hand gets a stronger border. */
  highlight?: boolean;
  /** Show when the job was completed instead of the visit time. */
  completed?: boolean;
}

/** One job in a list: visit time, title, customer and address, status. Opens the job. */
export function JobRow({ job, timeZone, now, highlight = false, completed = false }: JobRowProps) {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  const missed = !completed && isMissed(job, timeZone, now);
  const time = job.scheduledAt ? formatTime(timeZone, locale, new Date(job.scheduledAt)) : t('jobs.noTime');
  const firstLine = job.serviceAddress.split(/\r?\n|,/)[0]?.trim() ?? '';
  // Skip the address's first line when it only repeats the customer's name.
  const area = firstLine.toLowerCase() === job.customerName.trim().toLowerCase() ? '' : firstLine;
  const detail = completed && job.completedAt
    ? t('done.completedAt', { time: formatCheckedAt(timeZone, locale, new Date(job.completedAt), now) })
    : missed && job.scheduledAt
      ? t('jobs.missed', { date: formatCheckedAt(timeZone, locale, new Date(job.scheduledAt), now) })
      : null;
  const label = [completed ? detail : time, job.title, job.customerName, area, t(jobStatusKey(job.status)), !completed ? detail : null]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: job.id } })}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? theme.muted : theme.card,
          borderColor: highlight ? theme.primary : theme.border,
          borderWidth: highlight ? 2 : 1,
        },
      ]}
    >
      {!completed ? (
        <View style={styles.time}>
          {/* Jobs without a time sit under a heading that says so; a dash keeps the column tidy. */}
          <Text variant="label" tone={job.scheduledAt ? 'default' : 'secondary'}>
            {job.scheduledAt ? time : '–'}
          </Text>
        </View>
      ) : null}
      <View style={styles.body}>
        <Text variant="label" numberOfLines={2}>
          {job.title}
        </Text>
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {job.customerName}
          {area ? ` · ${area}` : ''}
        </Text>
        {detail ? (
          <Text variant="caption" tone={missed ? 'danger' : 'secondary'}>
            {detail}
          </Text>
        ) : null}
        <View style={styles.tags}>
          <JobStatusChip status={job.status} />
          <PriorityTag priority={job.priority} />
        </View>
      </View>
      <Icon name="chevron" color={theme.textSecondary} size={16} style={styles.chevron} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.lg },
  time: { width: 76 },
  body: { flex: 1, gap: Spacing.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.xs },
  chevron: { alignSelf: 'center' },
});
