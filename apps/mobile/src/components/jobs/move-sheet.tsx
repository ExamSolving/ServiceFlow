import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { moveLabelKey, moveSheet } from '@/lib/jobs/labels';
import type { JobMove, JobStatus } from '@/lib/jobs/types';
import { useTranslation } from '@/providers/preferences-provider';

const SHEET_TEXT = {
  decline: { title: 'job.sheet.decline.title', body: 'job.sheet.decline.body' },
  cantMakeIt: { title: 'job.sheet.cantMakeIt.title', body: 'job.sheet.cantMakeIt.body' },
  hold: { title: 'job.sheet.hold.title', body: 'job.sheet.hold.body' },
  quote: { title: 'job.sheet.quote.title', body: 'job.sheet.quote.body' },
  complete: { title: 'job.sheet.complete.title', body: 'job.sheet.complete.body' },
  generic: { title: 'job.sheet.generic.title', body: 'job.sheet.generic.body' },
} as const;

interface MoveSheetProps {
  from: JobStatus;
  move: JobMove;
  busy: boolean;
  /** A message from the last attempt, such as a missing reason. */
  error: string | null;
  onConfirm(words: string | undefined): void;
  onClose(): void;
}

/**
 * Confirms a move that needs more than a tap: Decline, Can't make it and Put on
 * hold ask for a reason; Needs a quote and Complete job take an optional note.
 */
export function MoveSheet({ from, move, busy, error, onConfirm, onClose }: MoveSheetProps) {
  const { t } = useTranslation();
  const [words, setWords] = useState('');
  const [missing, setMissing] = useState(false);
  const kind = moveSheet(from, move) ?? 'generic';
  const text = SHEET_TEXT[kind];
  const needsReason = move.input === 'reason';
  const action = t(moveLabelKey(from, move.to));

  function confirm() {
    const value = words.trim();
    if (needsReason && !value) {
      setMissing(true);
      return;
    }
    onConfirm(value || undefined);
  }

  return (
    <Sheet visible title={t(text.title)} onClose={busy ? () => undefined : onClose}>
      <Text tone="secondary">{t(text.body)}</Text>
      <TextField
        label={needsReason ? t('job.sheet.reason') : t('job.sheet.note')}
        placeholder={needsReason ? t('job.sheet.reasonPlaceholder') : kind === 'quote' ? t('job.sheet.notePlaceholderQuote') : t('job.notePlaceholder')}
        value={words}
        onChangeText={(value) => {
          setWords(value);
          if (missing && value.trim()) setMissing(false);
        }}
        error={missing ? t('job.sheet.reasonRequired') : error}
        multiline
        maxLength={500}
        editable={!busy}
        autoFocus={needsReason}
      />
      <View style={styles.actions}>
        <Button title={action} loading={busy} onPress={confirm} />
        <Button title={t('job.sheet.back')} variant="ghost" disabled={busy} onPress={onClose} />
      </View>
    </Sheet>
  );
}

interface MoreSheetProps {
  from: JobStatus;
  moves: readonly JobMove[];
  onPick(move: JobMove): void;
  onClose(): void;
}

/** The job's other moves, behind the main button's More options. */
export function MoreSheet({ from, moves, onPick, onClose }: MoreSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet visible title={t('job.moreTitle')} onClose={onClose}>
      <View style={styles.actions}>
        {moves.map((move) => (
          <Button key={move.to} title={t(moveLabelKey(from, move.to))} variant="secondary" onPress={() => onPick(move)} />
        ))}
        <Button title={t('job.sheet.back')} variant="ghost" onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: Spacing.sm },
});
