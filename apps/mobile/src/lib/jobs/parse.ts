import { isRecord } from '@/lib/api/client';

import {
  JOB_PRIORITIES,
  JOB_STATUSES,
  MOVE_INPUTS,
  type JobDetail,
  type JobEvent,
  type JobList,
  type JobMove,
  type JobNote,
  type JobPriority,
  type JobStatus,
  type JobSummary,
} from './types';

/**
 * Check the server's answers field by field, so a malformed response (or a
 * damaged saved copy) never reaches the screens.
 */

function oneOf<T extends string>(values: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? (value as T) : null;
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const filled = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);
const instant = (value: unknown): string | null => (typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null);
const optionalInstant = (value: unknown): string | null | undefined => (value === null ? null : (instant(value) ?? undefined));

export const parseStatus = (value: unknown): JobStatus | null => oneOf(JOB_STATUSES, value);
const parsePriority = (value: unknown): JobPriority | null => oneOf(JOB_PRIORITIES, value);

export function parseJobSummary(value: unknown): JobSummary | null {
  if (!isRecord(value)) return null;
  const id = filled(value.id);
  const jobNumber = filled(value.jobNumber);
  const title = filled(value.title);
  const status = parseStatus(value.status);
  const priority = parsePriority(value.priority);
  const scheduledAt = optionalInstant(value.scheduledAt);
  const completedAt = optionalInstant(value.completedAt);
  const updatedAt = instant(value.updatedAt);
  const customerName = text(value.customerName);
  const serviceAddress = text(value.serviceAddress);
  const serviceTypeName = text(value.serviceTypeName);
  const duration = value.estimatedDurationMinutes;
  const estimatedDurationMinutes = duration === null ? null : Number.isInteger(duration) && (duration as number) > 0 ? (duration as number) : undefined;
  const version = value.version;
  if (!id || !jobNumber || !title || !status || !priority || scheduledAt === undefined || completedAt === undefined || !updatedAt) return null;
  if (customerName === null || serviceAddress === null || serviceTypeName === null || estimatedDurationMinutes === undefined) return null;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) return null;
  return {
    id,
    jobNumber,
    title,
    status,
    priority,
    scheduledAt,
    estimatedDurationMinutes,
    customerName,
    serviceAddress,
    serviceTypeName,
    completedAt,
    updatedAt,
    version,
  };
}

function parseMove(value: unknown): JobMove | null {
  if (!isRecord(value)) return null;
  const to = parseStatus(value.to);
  const input = oneOf(MOVE_INPUTS, value.input);
  return to && input ? { to, input } : null;
}

export function parseJobNote(value: unknown): JobNote | null {
  if (!isRecord(value)) return null;
  const id = filled(value.id);
  const body = filled(value.body);
  const authorName = text(value.authorName);
  const createdAt = instant(value.createdAt);
  if (!id || !body || authorName === null || !createdAt || typeof value.mine !== 'boolean') return null;
  return { id, body, authorName, mine: value.mine, createdAt };
}

function parseEvent(value: unknown): JobEvent | null {
  if (!isRecord(value)) return null;
  const id = filled(value.id);
  const at = instant(value.at);
  const to = parseStatus(value.to);
  const from = value.from === null ? null : parseStatus(value.from);
  const note = value.note === null ? null : filled(value.note);
  const technicianName = value.technicianName === null ? null : filled(value.technicianName);
  if (!id || !at || !to || (value.from !== null && !from) || (value.note !== null && !note)) return null;
  if ((value.technicianName !== null && !technicianName) || typeof value.declined !== 'boolean') return null;
  return { id, at, from, to, note, technicianName, declined: value.declined };
}

/** Every item must be valid; one bad entry means the whole answer is rejected. */
function all<T>(value: unknown, parse: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const items: T[] = [];
  for (const item of value) {
    const parsed = parse(item);
    if (!parsed) return null;
    items.push(parsed);
  }
  return items;
}

export function parseJobDetail(value: unknown): JobDetail | null {
  const summary = parseJobSummary(value);
  if (!summary || !isRecord(value)) return null;
  const description = text(value.description);
  const customerNumber = text(value.customerNumber);
  const customerPhone = value.customerPhone === null ? null : filled(value.customerPhone);
  const notes = all(value.notes, parseJobNote);
  const history = all(value.history, parseEvent);
  const moves = all(value.moves, parseMove);
  if (description === null || customerNumber === null || (value.customerPhone !== null && !customerPhone)) return null;
  if (!notes || !history || !moves || typeof value.canAddNote !== 'boolean') return null;
  return { ...summary, description, customerNumber, customerPhone, notes, history, moves, canAddNote: value.canAddNote };
}

export function parseJobList(value: unknown): JobList | null {
  if (!isRecord(value)) return null;
  const open = all(value.open, parseJobSummary);
  const done = all(value.done, parseJobSummary);
  const generatedAt = instant(value.generatedAt);
  if (!open || !done || !generatedAt || typeof value.truncated !== 'boolean') return null;
  return { open, done, truncated: value.truncated, generatedAt };
}
