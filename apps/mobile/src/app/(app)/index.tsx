import { router } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { JobGroup } from '@/components/jobs/job-group';
import { JobRow } from '@/components/jobs/job-row';
import { StatusChip } from '@/components/status-chip';
import { SyncBanner } from '@/components/sync-banner';
import { TopBar } from '@/components/top-bar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { dayKey, formatCheckedAt, formatDayLabel, formatToday, greetingKey, nextDayKey } from '@/lib/format';
import { groupJobs } from '@/lib/jobs/sections';
import { useAuth } from '@/providers/auth-provider';
import { useJobs } from '@/providers/jobs-provider';
import { useTranslation } from '@/providers/preferences-provider';

/** My jobs: the job in hand, today's visits, what's coming up, jobs without a time and jobs waiting on the office. */
export default function MyJobsScreen() {
  const theme = useTheme();
  const { t, locale } = useTranslation();
  const { state } = useAuth();
  const jobs = useJobs();
  const now = useNow();
  if (state.status !== 'ready' || !state.session.technician) return null;

  const { session, sync } = state;
  const technician = state.session.technician;
  const timeZone = session.organization.timezone;
  const firstName = technician.displayName.trim().split(/\s+/)[0];
  const { list, listError, loaded } = jobs;
  const online = sync.connection === 'online';
  const sections = list ? groupJobs(list.open, timeZone, now) : null;
  const tomorrow = nextDayKey(dayKey(timeZone, now));
  // The banner says how old the jobs on screen are.
  const bannerSync = jobs.listSavedAt ? { ...sync, checkedAt: jobs.listSavedAt } : sync;
  const refresh = () => void jobs.refresh();

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={jobs.refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
    >
      <TopBar />

      <SyncBanner sync={bannerSync} timeZone={timeZone} onRetry={refresh} />

      <View style={styles.heading}>
        <Text variant="eyebrow" tone="primary">
          {formatToday(timeZone, locale, now)}
        </Text>
        <Text variant="title">{t(greetingKey(timeZone, now), { name: firstName })}</Text>
        <View style={styles.profile}>
          <Text variant="caption" tone="secondary" style={styles.profileText} numberOfLines={1}>
            {technician.displayName}
            {technician.employeeNumber ? ` · ${technician.employeeNumber}` : ''}
          </Text>
          <StatusChip status={technician.status} />
        </View>
      </View>

      {list && listError && online && jobs.listSavedAt ? (
        <Notice tone="danger">{t('jobs.staleError', { time: formatCheckedAt(timeZone, locale, new Date(jobs.listSavedAt), now) })}</Notice>
      ) : null}
      {list?.truncated ? <Notice>{t('jobs.truncated')}</Notice> : null}

      {!list ? (
        !loaded || (online && !listError) ? (
          <Card style={styles.center}>
            <ActivityIndicator color={theme.primary} />
            <Text tone="secondary">{t('jobs.loading')}</Text>
          </Card>
        ) : listError && online ? (
          <Card>
            <Text>{t('jobs.loadError')}</Text>
            <Button title={t('common.tryAgain')} variant="secondary" loading={jobs.refreshing} onPress={refresh} />
          </Card>
        ) : (
          <Notice>{t('jobs.offlineEmpty')}</Notice>
        )
      ) : null}

      {list && sections && !list.open.length ? (
        <Card style={{ backgroundColor: theme.muted }}>
          <View style={[styles.badge, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Icon name="jobs" color={theme.primary} size={22} />
          </View>
          <Text variant="heading">{t('jobs.emptyTitle')}</Text>
          <Text tone="secondary">{t('jobs.emptyBody')}</Text>
        </Card>
      ) : null}

      {sections ? (
        <>
          {sections.now.length ? (
            <JobGroup title={t('jobs.sections.now')}>
              {sections.now.map((job) => (
                <JobRow key={job.id} job={job} timeZone={timeZone} now={now} highlight />
              ))}
            </JobGroup>
          ) : null}
          {sections.today.length ? (
            <JobGroup title={t('jobs.sections.today')} count={sections.today.length}>
              {sections.today.map((job) => (
                <JobRow key={job.id} job={job} timeZone={timeZone} now={now} />
              ))}
            </JobGroup>
          ) : null}
          {sections.upcoming.length ? (
            <JobGroup title={t('jobs.sections.upcoming')}>
              {sections.upcoming.map(({ day, jobs: dayJobs }) => (
                <View key={day} style={styles.day}>
                  <Text variant="label" tone="secondary" accessibilityRole="header" style={styles.dayLabel}>
                    {day === tomorrow ? t('jobs.sections.tomorrow') : formatDayLabel(locale, day)}
                  </Text>
                  {dayJobs.map((job) => (
                    <JobRow key={job.id} job={job} timeZone={timeZone} now={now} />
                  ))}
                </View>
              ))}
            </JobGroup>
          ) : null}
          {sections.unscheduled.length ? (
            <JobGroup title={t('jobs.sections.unscheduled')} count={sections.unscheduled.length}>
              {sections.unscheduled.map((job) => (
                <JobRow key={job.id} job={job} timeZone={timeZone} now={now} />
              ))}
            </JobGroup>
          ) : null}
          {sections.waiting.length ? (
            <JobGroup title={t('jobs.sections.waiting')} count={sections.waiting.length}>
              {sections.waiting.map((job) => (
                <JobRow key={job.id} job={job} timeZone={timeZone} now={now} />
              ))}
            </JobGroup>
          ) : null}
        </>
      ) : null}

      {list ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('jobs.doneLink', { count: list.done.length })}
          onPress={() => router.push('/jobs/done')}
          style={({ pressed }) => [styles.link, { borderColor: theme.border, backgroundColor: pressed ? theme.muted : theme.card }]}
        >
          <Icon name="done" color={theme.primary} size={18} />
          <Text variant="label" style={styles.linkText}>
            {t('jobs.doneLink', { count: list.done.length })}
          </Text>
          <Icon name="chevron" color={theme.textSecondary} size={16} />
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: Spacing.sm },
  profile: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  profileText: { flexShrink: 1 },
  center: { alignItems: 'center' },
  badge: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: { gap: Spacing.sm },
  dayLabel: { paddingHorizontal: Spacing.xs, marginTop: Spacing.xs },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  linkText: { flex: 1 },
});
