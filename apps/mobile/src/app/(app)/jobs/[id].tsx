import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, StyleSheet, View } from 'react-native';

import { BackButton } from '@/components/back-button';
import { Icon, type IconName } from '@/components/icon';
import { JobStatusChip, PriorityTag } from '@/components/jobs/job-status-chip';
import { MoreSheet, MoveSheet } from '@/components/jobs/move-sheet';
import { SyncBanner } from '@/components/sync-banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { dayKey, formatCheckedAt, formatDayLabel, formatTime, nextDayKey } from '@/lib/format';
import { jobStatusKey, moveLabelKey, moveSheet, waitingKey } from '@/lib/jobs/labels';
import { newRequestId } from '@/lib/jobs/request-id';
import type { JobDetail, JobMove, JobSummary, MoveRequest } from '@/lib/jobs/types';
import { useAuth } from '@/providers/auth-provider';
import { failureOf, useJobs } from '@/providers/jobs-provider';
import { useTranslation } from '@/providers/preferences-provider';

/** One-tap moves wait this long, with an Undo button, before they are sent. */
const UNDO_MS = 4000;

interface Pending {
  request: MoveRequest;
  label: string;
}
interface Feedback {
  tone: 'info' | 'danger' | 'success';
  text: string;
  /** A failed request to send again unchanged, so the server can apply it once. */
  retry?: MoveRequest;
}
interface OpenSheet {
  move: JobMove;
  requestId: string;
  error: string | null;
}

function dial(phone: string) {
  Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() => {
    // No phone app on this device (for example a tablet): nothing to open.
  });
}

/** Open the phone's maps app with the service address (ServiceFlow stores addresses as text), or Google Maps on the web. */
async function openDirections(address: string) {
  const query = encodeURIComponent(address.replace(/\s+/g, ' ').trim());
  const web = `https://www.google.com/maps/dir/?api=1&destination=${query}`;
  const url = Platform.select({ ios: `http://maps.apple.com/?daddr=${query}`, android: `geo:0,0?q=${query}`, default: web });
  try {
    await Linking.openURL(url);
  } catch {
    // No maps app for that link: fall back to Google Maps in the browser.
    await Linking.openURL(web).catch(() => undefined);
  }
}

/** A job: visit, customer, address, work, notes and history, with its status moves pinned at the bottom. */
export default function JobScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const theme = useTheme();
  const { t, locale } = useTranslation();
  const { state, refresh: refreshAccount } = useAuth();
  const { savedJob, summaryOf, loadJob, move, addNote } = useJobs();
  const entry = savedJob(id);
  const job: JobDetail | null = entry?.job ?? null;
  const view: JobSummary | null = job ?? summaryOf(id);

  const [fetching, setFetching] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [outcome, setOutcome] = useState<'declined' | 'gone' | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const [sending, setSending] = useState(false);
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [note, setNote] = useState('');
  const [noteSending, setNoteSending] = useState(false);
  const [noteFeedback, setNoteFeedback] = useState<Feedback | null>(null);
  const failedNote = useRef<{ body: string; requestId: string } | null>(null);
  const now = useNow();

  const loaded = (failure: ReturnType<typeof failureOf> | null) => {
    if (failure === 'gone') setOutcome('gone');
    else setLoadFailed(failure !== null);
  };

  async function reload() {
    try {
      await loadJob(id);
      loaded(null);
    } catch (error) {
      loaded(failureOf(error));
    }
  }

  // Fetch the job when the screen opens; the saved copy (if any) shows meanwhile.
  useEffect(() => {
    let active = true;
    loadJob(id)
      .then(
        () => active && setLoadFailed(false),
        (error: unknown) => {
          if (!active) return;
          if (failureOf(error) === 'gone') setOutcome('gone');
          else setLoadFailed(true);
        },
      )
      .finally(() => {
        if (active) setFetching(false);
      });
    return () => {
      active = false;
    };
  }, [id, loadJob]);

  async function submit(request: MoveRequest) {
    pendingRef.current = null;
    setPending(null);
    setSending(true);
    setFeedback(null);
    try {
      const updated = await move(id, request);
      setSheet(null);
      if (!updated) {
        setOutcome('declined');
        return;
      }
      setFeedback({ tone: 'success', text: t('job.updated', { status: t(jobStatusKey(updated.status)) }) });
    } catch (error) {
      const failure = failureOf(error);
      if (failure === 'reasonRequired') {
        setSheet((current) => (current ? { ...current, error: t('job.sheet.reasonRequired') } : current));
        return;
      }
      setSheet(null);
      if (failure === 'gone') setOutcome('gone');
      else if (failure === 'changed') {
        setFeedback({ tone: 'info', text: t('job.changed') });
        void reload();
      } else setFeedback({ tone: 'danger', text: t('job.sendError'), retry: request });
    } finally {
      setSending(false);
    }
  }

  // Send a one-tap move once its Undo window ends.
  const sendPending = useEffectEvent((request: MoveRequest) => void submit(request));
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => sendPending(pending.request), UNDO_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  // Leaving the screen during the Undo window sends the move straight away.
  const flush = useCallback(() => {
    const queued = pendingRef.current;
    pendingRef.current = null;
    if (queued) void move(id, queued.request).catch(() => undefined);
  }, [id, move]);
  useEffect(() => flush, [flush]);

  if (state.status !== 'ready') return null;
  const timeZone = state.session.organization.timezone;
  const online = state.sync.connection === 'online';

  function start(chosen: JobMove) {
    if (!job) return;
    setShowMore(false);
    setFeedback(null);
    if (moveSheet(job.status, chosen)) {
      setSheet({ move: chosen, requestId: newRequestId(), error: null });
      return;
    }
    const next = { request: { to: chosen.to, version: job.version, requestId: newRequestId() }, label: t(moveLabelKey(job.status, chosen.to)) };
    pendingRef.current = next;
    setPending(next);
  }

  function undo() {
    pendingRef.current = null;
    setPending(null);
    setFeedback({ tone: 'info', text: t('job.notSent') });
  }

  async function sendNote() {
    const body = note.trim();
    if (!body || noteSending) return;
    // Resending the same text after a failure reuses its request ID, so it can't be saved twice.
    const requestId = failedNote.current?.body === body ? failedNote.current.requestId : newRequestId();
    setNoteSending(true);
    setNoteFeedback(null);
    try {
      await addNote(id, body, requestId);
      failedNote.current = null;
      setNote('');
      setNoteFeedback({ tone: 'success', text: t('job.noteSaved') });
    } catch (error) {
      if (failureOf(error) === 'gone') setOutcome('gone');
      else {
        failedNote.current = { body, requestId };
        setNoteFeedback({ tone: 'danger', text: t('job.noteError') });
      }
    } finally {
      setNoteSending(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      // While offline, check the connection (and the account) again first, so the banner clears.
      if (state.status === 'ready' && state.sync.connection !== 'online') await refreshAccount();
      await reload();
    } finally {
      setRefreshing(false);
    }
  }

  if (outcome) {
    return (
      <Screen>
        <BackButton label={t('common.back')} />
        <Notice tone={outcome === 'declined' ? 'success' : 'info'}>{outcome === 'declined' ? t('job.declined') : t('job.gone')}</Notice>
        <Button title={t('common.back')} variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </Screen>
    );
  }

  const visit = view?.scheduledAt ? new Date(view.scheduledAt) : null;
  const visitDay = visit ? dayKey(timeZone, visit) : null;
  const today = dayKey(timeZone, now);
  const visitLabel = visit
    ? `${visitDay === today ? t('jobs.sections.today') : visitDay === nextDayKey(today) ? t('jobs.sections.tomorrow') : formatDayLabel(locale, visitDay ?? today)} · ${formatTime(timeZone, locale, visit)}`
    : t('job.noVisit');
  const waiting = job ? waitingKey(job.status) : null;
  const moves = job?.moves ?? [];
  const [main, ...others] = moves;
  const bannerSync = entry ? { ...state.sync, checkedAt: entry.savedAt } : state.sync;

  const footer =
    job && main ? (
      pending ? (
        <View style={styles.footerRow} aria-live="polite">
          <Text variant="label" style={styles.flex} numberOfLines={2}>
            {t('job.sending', { action: pending.label })}
          </Text>
          <Button title={t('job.undo')} icon="undo" variant="secondary" onPress={undo} />
        </View>
      ) : (
        <View style={styles.footer}>
          {!online ? (
            <Text variant="caption" tone="secondary">
              {t('job.connect')}
            </Text>
          ) : null}
          <View style={styles.footerRow}>
            <Button title={t(moveLabelKey(job.status, main.to))} loading={sending} disabled={!online} onPress={() => start(main)} style={styles.flex} />
            {others.length ? (
              <Button title={t('job.more')} icon="more" variant="secondary" disabled={!online || sending} onPress={() => setShowMore(true)} />
            ) : null}
          </View>
        </View>
      )
    ) : null;

  return (
    <Screen
      footer={footer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
    >
      <BackButton label={t('common.back')} />
      <SyncBanner kind="job" sync={bannerSync} timeZone={timeZone} onRetry={onRefresh} />

      {!view ? (
        fetching ? (
          <Card style={styles.center}>
            <ActivityIndicator color={theme.primary} />
          </Card>
        ) : (
          <Card>
            <Text>{t('job.loadError')}</Text>
            <Button title={t('common.tryAgain')} variant="secondary" loading={refreshing} onPress={onRefresh} />
          </Card>
        )
      ) : (
        <>
          <View style={styles.heading}>
            <Text variant="eyebrow" tone="primary">
              {view.jobNumber}
            </Text>
            <Text variant="title">{view.title}</Text>
            <View style={styles.tags}>
              <JobStatusChip status={view.status} />
              <PriorityTag priority={view.priority} />
            </View>
          </View>

          {loadFailed && online ? <Notice tone="danger">{t('job.loadError')}</Notice> : null}
          {feedback ? <Notice tone={feedback.tone}>{feedback.text}</Notice> : null}
          {feedback?.retry ? (
            <Button title={t('common.tryAgain')} variant="secondary" loading={sending} onPress={() => feedback.retry && void submit(feedback.retry)} />
          ) : null}
          {waiting ? <Notice>{t(waiting)}</Notice> : null}

          <Card>
            <Section icon="clock" title={t('job.visit')} />
            <Text variant="heading">{visitLabel}</Text>
            {view.estimatedDurationMinutes ? (
              <Text variant="caption" tone="secondary">
                {t('jobs.duration', { minutes: view.estimatedDurationMinutes })}
              </Text>
            ) : null}
          </Card>

          <Card>
            <Section icon="person" title={t('job.customer')} />
            <View>
              <Text variant="heading">{view.customerName}</Text>
              {job?.customerNumber ? (
                <Text variant="caption" tone="secondary">
                  {job.customerNumber}
                </Text>
              ) : null}
            </View>
            {job?.customerPhone ? (
              <Button
                title={t('job.call')}
                accessibilityLabel={t('job.callLabel', { name: view.customerName })}
                icon="call"
                variant="secondary"
                onPress={() => job.customerPhone && dial(job.customerPhone)}
              />
            ) : null}
          </Card>

          <Card>
            <Section icon="location" title={t('job.address')} />
            <Text selectable>{view.serviceAddress}</Text>
            <Button title={t('job.directions')} icon="directions" variant="secondary" onPress={() => void openDirections(view.serviceAddress)} />
          </Card>

          <Card>
            <Section icon="jobs" title={t('job.work')} />
            <Text variant="label">{view.serviceTypeName}</Text>
            {job?.description ? <Text selectable>{job.description}</Text> : null}
          </Card>

          {job ? (
            <Card>
              <Section icon="note" title={t('job.notes')} />
              {job.notes.length ? (
                job.notes.map((item) => (
                  <View key={item.id} style={[styles.item, { borderColor: theme.border }]}>
                    <Text selectable>{item.body}</Text>
                    <Text variant="caption" tone="secondary">
                      {item.mine ? t('job.you') : item.authorName || t('job.byOffice')} · {formatCheckedAt(timeZone, locale, new Date(item.createdAt), now)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text tone="secondary">{t('job.notesEmpty')}</Text>
              )}
              {job.canAddNote ? (
                <View style={styles.composer}>
                  <TextField
                    label={t('job.noteLabel')}
                    placeholder={t('job.notePlaceholder')}
                    value={note}
                    onChangeText={setNote}
                    multiline
                    maxLength={2000}
                    editable={!noteSending}
                  />
                  {noteFeedback ? <Notice tone={noteFeedback.tone}>{noteFeedback.text}</Notice> : null}
                  {!online ? (
                    <Text variant="caption" tone="secondary">
                      {t('job.connect')}
                    </Text>
                  ) : null}
                  <Button title={t('job.sendNote')} icon="send" variant="secondary" loading={noteSending} disabled={!online || !note.trim()} onPress={() => void sendNote()} />
                </View>
              ) : null}
            </Card>
          ) : fetching ? (
            <Card style={styles.center}>
              <ActivityIndicator color={theme.primary} />
            </Card>
          ) : null}

          {job?.history.length ? (
            <Card>
              <Section icon="history" title={t('job.history')} />
              {job.history.map((event) => (
                <View key={event.id} style={[styles.item, { borderColor: theme.border }]}>
                  <Text variant="label">{t(jobStatusKey(event.to))}</Text>
                  {event.note ? <Text selectable>{event.note}</Text> : null}
                  <Text variant="caption" tone="secondary">
                    {event.technicianName ?? t('job.byOffice')} · {formatCheckedAt(timeZone, locale, new Date(event.at), now)}
                  </Text>
                </View>
              ))}
            </Card>
          ) : null}
        </>
      )}

      {sheet && job ? (
        <MoveSheet
          key={`${sheet.move.to}:${sheet.requestId}`}
          from={job.status}
          move={sheet.move}
          busy={sending}
          error={sheet.error}
          onClose={() => setSheet(null)}
          onConfirm={(words) =>
            void submit({
              to: sheet.move.to,
              version: job.version,
              requestId: sheet.requestId,
              ...(sheet.move.input === 'reason' ? { reason: words } : words ? { note: words } : {}),
            })
          }
        />
      ) : null}
      {showMore && job ? <MoreSheet from={job.status} moves={others} onPick={start} onClose={() => setShowMore(false)} /> : null}
    </Screen>
  );
}

function Section({ icon, title }: { icon: IconName; title: string }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Icon name={icon} color={theme.textSecondary} size={16} />
      <Text variant="eyebrow" tone="secondary" accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { gap: Spacing.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  center: { alignItems: 'center' },
  section: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs + 2 },
  item: { gap: Spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.md },
  composer: { gap: Spacing.md, marginTop: Spacing.sm },
  footer: { gap: Spacing.sm, width: '100%', maxWidth: 560, alignSelf: 'center' },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, width: '100%', maxWidth: 560, alignSelf: 'center' },
  flex: { flex: 1 },
});
