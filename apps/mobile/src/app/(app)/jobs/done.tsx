import { RefreshControl, StyleSheet, View } from 'react-native';

import { BackButton } from '@/components/back-button';
import { JobRow } from '@/components/jobs/job-row';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';
import { useJobs } from '@/providers/jobs-provider';
import { useTranslation } from '@/providers/preferences-provider';

/** Jobs the technician completed in the last 7 days, newest first. Each opens read-only. */
export default function DoneScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { state } = useAuth();
  const jobs = useJobs();
  const now = useNow();
  if (state.status !== 'ready') return null;
  const timeZone = state.session.organization.timezone;
  const done = jobs.list?.done ?? [];

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={jobs.refreshing} onRefresh={() => void jobs.refresh()} tintColor={theme.primary} colors={[theme.primary]} />
      }
    >
      <BackButton label={t('common.back')} />
      <View style={styles.heading}>
        <Text variant="title">{t('done.title')}</Text>
        <Text tone="secondary">{t('done.subtitle')}</Text>
      </View>
      {done.length ? (
        <View style={styles.list}>
          {done.map((job) => (
            <JobRow key={job.id} job={job} timeZone={timeZone} now={now} completed />
          ))}
        </View>
      ) : (
        <Card>
          <Text tone="secondary">{t('done.empty')}</Text>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: Spacing.sm },
  list: { gap: Spacing.sm },
});
