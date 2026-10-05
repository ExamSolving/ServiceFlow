// Unit tests for the jobs screens' logic: checking server answers, the API
// calls, the saved copy, grouping the list, button wording and request IDs.
// Run with: npm test
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./helpers/module-hooks.mjs', import.meta.url);
process.env.EXPO_PUBLIC_API_URL = 'https://serviceflow.example';

const { ApiError } = await import('../src/lib/api/client.ts');
const { parseJobDetail, parseJobList, parseJobSummary } = await import('../src/lib/jobs/parse.ts');
const { classifyJobError, fetchJob, fetchJobList, sendMove, sendNote } = await import('../src/lib/jobs/api.ts');
const { JOBS_CACHE_KEY, emptySavedJobs, readSavedJobs, serializeSavedJobs, withDetail, withList, withoutJob } = await import('../src/lib/jobs/cache.ts');
const { groupJobs, isMissed } = await import('../src/lib/jobs/sections.ts');
const { moveLabelKey, moveSheet, waitingKey, jobStatusKey, priorityKey } = await import('../src/lib/jobs/labels.ts');
const { newRequestId } = await import('../src/lib/jobs/request-id.ts');
const { dayKey, formatDayLabel, nextDayKey } = await import('../src/lib/format.ts');
const { MESSAGES } = await import('../src/i18n/translate.ts');
const { JOB_STATUSES, JOB_PRIORITIES } = await import('../src/lib/jobs/types.ts');

const NOW = Date.parse('2026-10-05T04:00:00Z'); // 09:30 in India
const DAY = 24 * 60 * 60 * 1000;
const ZONE = 'Asia/Kolkata';

const summary = (overrides = {}) => ({
  id: 'job-1',
  jobNumber: 'JOB-000001',
  title: 'AC not cooling',
  status: 'ASSIGNED',
  priority: 'NORMAL',
  scheduledAt: '2026-10-05T05:30:00.000Z',
  estimatedDurationMinutes: 60,
  customerName: 'Greenleaf Apartments',
  serviceAddress: 'Flat 4B, 12 MG Road, Pune 411001',
  serviceTypeName: 'AC service',
  completedAt: null,
  updatedAt: '2026-10-04T10:00:00.000Z',
  version: 3,
  ...overrides,
});
const detail = (overrides = {}) => ({
  ...summary(),
  description: 'The bedroom unit is not cooling.',
  customerNumber: 'CUS-000001',
  customerPhone: '+91 98765 43210',
  notes: [{ id: 'n-1', body: 'Gate code 4321', authorName: 'Dina', mine: false, createdAt: '2026-10-04T09:00:00.000Z' }],
  history: [{ id: 'a-1', at: '2026-10-04T08:00:00.000Z', from: 'NEW', to: 'ASSIGNED', note: null, technicianName: null, declined: false }],
  moves: [
    { to: 'ACCEPTED', input: 'none' },
    { to: 'RESCHEDULED', input: 'reason' },
  ],
  canAddNote: true,
  ...overrides,
});
const listOf = (open = [summary()], done = []) => ({ open, done, truncated: false, generatedAt: '2026-10-05T04:00:00.000Z' });

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('server answers are checked field by field', () => {
  assert.equal(parseJobSummary(summary())?.id, 'job-1');
  assert.deepEqual(parseJobDetail(detail())?.moves, detail().moves);
  assert.equal(parseJobList(listOf())?.open.length, 1);
  for (const bad of [
    { status: 'PARTY' },
    { priority: 'SOON' },
    { scheduledAt: 'tomorrow' },
    { version: 0 },
    { version: 1.5 },
    { id: '' },
    { estimatedDurationMinutes: -5 },
    { customerName: undefined },
  ]) {
    assert.equal(parseJobSummary(summary(bad)), null, JSON.stringify(bad));
  }
  assert.equal(parseJobDetail(detail({ moves: [{ to: 'ACCEPTED', input: 'shout' }] })), null);
  assert.equal(parseJobDetail(detail({ customerPhone: '' })), null);
  assert.equal(parseJobDetail(detail({ canAddNote: 'yes' })), null);
  assert.equal(parseJobDetail(detail({ notes: [{ id: 'n', body: '', authorName: 'x', mine: true, createdAt: '2026-10-04T09:00:00Z' }] })), null);
  assert.equal(parseJobList(listOf([summary(), summary({ status: 'NOPE' })])), null, 'one bad job rejects the whole list');
  assert.equal(parseJobList({ ...listOf(), truncated: 'no' }), null);
});

test('API calls send the ID token as a Bearer token, never cookies, and refresh an expired token once', async () => {
  const calls = [];
  const replies = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const next = replies.shift();
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { 'content-type': 'application/json' } });
  };
  const tokens = [];
  const user = { getIdToken: async (force) => (tokens.push(Boolean(force)), force ? 'fresh-token' : 'old-token') };

  replies.push({ status: 200, body: { jobs: listOf() } });
  const list = await fetchJobList(user);
  assert.equal(list.open[0].id, 'job-1');
  assert.equal(calls[0].url, 'https://serviceflow.example/api/mobile/jobs');
  assert.equal(calls[0].init.headers.authorization, 'Bearer old-token');
  assert.equal(calls[0].init.credentials, 'omit');

  replies.push({ status: 401, body: { code: 'TOKEN_EXPIRED', message: 'refresh' } }, { status: 200, body: { job: detail({ id: 'a/b' }) } });
  const job = await fetchJob(user, 'a/b');
  assert.equal(job.id, 'a/b');
  assert.equal(calls[1].url, 'https://serviceflow.example/api/mobile/jobs/a%2Fb', 'IDs are encoded in the path');
  assert.equal(calls[2].init.headers.authorization, 'Bearer fresh-token');
  assert.deepEqual(tokens, [false, false, true]);

  replies.push({ status: 200, body: { job: null } });
  const move = { to: 'RESCHEDULED', version: 3, requestId: newRequestId(), reason: 'Van broke down' };
  assert.equal(await sendMove(user, 'job-1', move), null, 'a decline answers with no job');
  assert.equal(calls[3].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[3].init.body), move);

  replies.push({ status: 201, body: { note: { id: 'n-9', body: 'Side gate', authorName: 'Tess', mine: true, createdAt: '2026-10-05T04:00:00.000Z' } } });
  assert.equal((await sendNote(user, 'job-1', { body: 'Side gate', requestId: newRequestId() })).id, 'n-9');

  replies.push({ status: 200, body: { job: { id: 'job-1' } } });
  await assert.rejects(fetchJob(user, 'job-1'), (error) => error instanceof ApiError && error.code === 'INVALID_RESPONSE');
  replies.push({ status: 200, body: { job: detail({ id: 'other' }) } });
  await assert.rejects(fetchJob(user, 'job-1'), (error) => error.code === 'INVALID_RESPONSE', 'a different job is rejected');
  delete globalThis.fetch;
});

test('failed requests are sorted into what the screen should do', () => {
  const failure = (status, code) => classifyJobError(new ApiError(status, code, 'message'));
  assert.equal(failure(0, 'NETWORK'), 'offline');
  assert.equal(failure(409, 'CONFLICT'), 'changed');
  assert.equal(failure(409, 'STATE'), 'changed');
  assert.equal(failure(404, 'NOT_FOUND'), 'gone');
  assert.equal(failure(400, 'REASON_REQUIRED'), 'reasonRequired');
  assert.equal(failure(401, 'SESSION_REVOKED'), 'account');
  assert.equal(failure(403, 'TECHNICIAN_UNAVAILABLE'), 'account');
  assert.equal(failure(500, null), 'server');
  assert.equal(classifyJobError(new Error('boom')), 'server');
});

test('the saved copy is for one user, at most 7 days old, and drops anything damaged', () => {
  let saved = withList(emptySavedJobs('user-1'), listOf(), NOW - DAY);
  saved = withDetail(saved, parseJobDetail(detail()), NOW - DAY);
  const raw = serializeSavedJobs(saved);
  assert.equal(JOBS_CACHE_KEY, 'serviceflow.jobs.v1');
  assert.ok(!/token|password/i.test(raw), 'no secrets are saved');
  const back = readSavedJobs(raw, 'user-1', NOW);
  assert.equal(back.list.value.open[0].id, 'job-1');
  assert.equal(back.details['job-1'].value.customerPhone, '+91 98765 43210');
  assert.equal(readSavedJobs(raw, 'user-2', NOW), null, 'another user never sees them');
  assert.equal(readSavedJobs('{not json', 'user-1', NOW), null);
  assert.equal(readSavedJobs(null, 'user-1', NOW), null);
  const old = readSavedJobs(raw, 'user-1', NOW + 7 * DAY);
  assert.equal(old.list, null, 'older than 7 days');
  assert.deepEqual(old.details, {});
  const future = JSON.parse(raw);
  future.list.savedAt = NOW + 60 * 60 * 1000;
  assert.equal(readSavedJobs(JSON.stringify(future), 'user-1', NOW).list, null, 'dated in the future');
  const damaged = JSON.parse(raw);
  damaged.details['job-1'].value.status = 'BROKEN';
  damaged.details['job-2'] = { savedAt: NOW, value: detail({ id: 'job-3' }) };
  const cleaned = readSavedJobs(JSON.stringify(damaged), 'user-1', NOW);
  assert.deepEqual(Object.keys(cleaned.details), [], 'damaged or mislabelled jobs are left out');
  assert.equal(cleaned.list.value.open.length, 1);
});

test('updates to the saved copy keep the list in step', () => {
  let saved = withList(emptySavedJobs('user-1'), listOf([summary(), summary({ id: 'job-2', jobNumber: 'JOB-000002' })]), NOW);
  saved = withDetail(saved, parseJobDetail(detail()), NOW);
  saved = withDetail(saved, parseJobDetail(detail({ id: 'job-2', jobNumber: 'JOB-000002' })), NOW);
  const moved = withDetail(saved, parseJobDetail(detail({ status: 'ACCEPTED', version: 4 })), NOW);
  assert.equal(moved.list.value.open[0].status, 'ACCEPTED');
  assert.equal(moved.list.value.open[0].version, 4);
  const completed = withDetail(moved, parseJobDetail(detail({ status: 'COMPLETED', completedAt: '2026-10-05T06:00:00.000Z', moves: [] })), NOW);
  assert.deepEqual(completed.list.value.open.map((job) => job.id), ['job-2']);
  assert.deepEqual(completed.list.value.done.map((job) => job.id), ['job-1'], 'a completed job moves to Done');
  const declined = withoutJob(completed, 'job-2');
  assert.deepEqual(declined.list.value.open, []);
  assert.equal(declined.details['job-2'], undefined);
  const refetched = withList(completed, listOf([summary({ id: 'job-2', jobNumber: 'JOB-000002' })]), NOW);
  assert.deepEqual(Object.keys(refetched.details), ['job-2'], 'jobs no longer listed are dropped from the saved copy');
});

test('the list is grouped by status and by visit day in the workspace time zone', () => {
  const now = new Date(NOW);
  const job = (id, status, scheduledAt) => summary({ id, jobNumber: `JOB-${id}`, status, scheduledAt });
  const open = [
    job('later', 'ASSIGNED', '2026-10-07T04:30:00.000Z'),
    job('tonight', 'ACCEPTED', '2026-10-05T18:00:00.000Z'), // 23:30 in India: still today
    job('missed', 'ACCEPTED', '2026-10-03T05:00:00.000Z'),
    job('morning', 'ASSIGNED', '2026-10-05T05:30:00.000Z'),
    job('tomorrow', 'ASSIGNED', '2026-10-05T19:00:00.000Z'), // 00:30 tomorrow in India
    job('nodate', 'ASSIGNED', null),
    job('onsite', 'ARRIVED', '2026-10-05T03:00:00.000Z'),
    job('approved', 'APPROVED', '2026-10-01T03:00:00.000Z'),
    job('held', 'ON_HOLD', '2026-10-04T03:00:00.000Z'),
    job('quote', 'QUOTATION_REQUIRED', null),
    job('moving', 'RESCHEDULED', '2026-10-06T03:00:00.000Z'),
  ];
  const sections = groupJobs(open, ZONE, now);
  const ids = (jobs) => jobs.map((item) => item.id);
  assert.deepEqual(ids(sections.now), ['approved', 'onsite']);
  assert.deepEqual(ids(sections.today), ['missed', 'morning', 'tonight']);
  assert.deepEqual(sections.upcoming.map((day) => [day.day, ids(day.jobs)]), [
    ['2026-10-06', ['tomorrow']],
    ['2026-10-07', ['later']],
  ]);
  assert.deepEqual(ids(sections.unscheduled), ['nodate']);
  assert.deepEqual(ids(sections.waiting), ['held', 'moving', 'quote']);
  assert.equal(isMissed(open[2], ZONE, now), true);
  assert.equal(isMissed(open[3], ZONE, now), false);
  assert.equal(isMissed(open[7], ZONE, now), false, 'only visits not started yet count as missed');
  // The same instant is a different day in another time zone.
  assert.deepEqual(ids(groupJobs([open[1]], 'UTC', now).today), ['tonight']);
  assert.equal(groupJobs([open[4]], 'UTC', now).today.length, 1, '19:00 UTC is still today in UTC');
});

test('buttons are worded by move, and every word exists in English, Hindi and Telugu', () => {
  const moves = [
    ['ASSIGNED', 'ACCEPTED', 'jobs.move.accept', null],
    ['ASSIGNED', 'RESCHEDULED', 'jobs.move.decline', 'decline'],
    ['ACCEPTED', 'EN_ROUTE', 'jobs.move.onMyWay', null],
    ['ACCEPTED', 'RESCHEDULED', 'jobs.move.cantMakeIt', 'cantMakeIt'],
    ['EN_ROUTE', 'ARRIVED', 'jobs.move.arrived', null],
    ['ARRIVED', 'DIAGNOSING', 'jobs.move.startDiagnosis', null],
    ['ARRIVED', 'IN_PROGRESS', 'jobs.move.startWork', null],
    ['DIAGNOSING', 'IN_PROGRESS', 'jobs.move.startWork', null],
    ['DIAGNOSING', 'QUOTATION_REQUIRED', 'jobs.move.needsQuote', 'quote'],
    ['DIAGNOSING', 'ON_HOLD', 'jobs.move.hold', 'hold'],
    ['APPROVED', 'IN_PROGRESS', 'jobs.move.startWork', null],
    ['IN_PROGRESS', 'COMPLETED', 'jobs.move.complete', 'complete'],
    ['IN_PROGRESS', 'ON_HOLD', 'jobs.move.hold', 'hold'],
    ['ON_HOLD', 'IN_PROGRESS', 'jobs.move.resume', null],
  ];
  const inputs = { RESCHEDULED: 'reason', ON_HOLD: 'reason', COMPLETED: 'confirm', QUOTATION_REQUIRED: 'note' };
  for (const [from, to, label, sheet] of moves) {
    assert.equal(moveLabelKey(from, to), label, `${from} -> ${to}`);
    assert.equal(moveSheet(from, { to, input: inputs[to] ?? 'none' }), sheet, `${from} -> ${to}`);
  }
  assert.equal(moves.length, 14);
  const lookup = (messages, key) => key.split('.').reduce((node, part) => node?.[part], messages);
  const keys = [
    ...moves.map(([, , label]) => label),
    ...JOB_STATUSES.map(jobStatusKey),
    ...JOB_PRIORITIES.map(priorityKey),
    ...JOB_STATUSES.map(waitingKey).filter(Boolean),
  ];
  for (const [language, messages] of Object.entries(MESSAGES)) {
    for (const key of keys) {
      const text = lookup(messages, key);
      assert.equal(typeof text, 'string', `${language}: ${key}`);
      assert.ok(text.trim().length > 0, `${language}: ${key}`);
    }
  }
  assert.notEqual(lookup(MESSAGES.hi, 'jobs.move.arrived'), lookup(MESSAGES.en, 'jobs.move.arrived'));
  assert.ok(!/गया|गई/.test(lookup(MESSAGES.hi, 'jobs.move.arrived')), 'Hindi buttons avoid gendered verbs');
  assert.equal(waitingKey('IN_PROGRESS'), null);
  assert.equal(waitingKey('PAID'), 'job.waiting.done');
});

test('new messages keep the same placeholders in every language', () => {
  const leaves = (node, prefix = '') =>
    Object.entries(node).flatMap(([key, value]) => (typeof value === 'string' ? [[`${prefix}${key}`, value]] : leaves(value, `${prefix}${key}.`)));
  const holes = (text) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort().join(',');
  const english = new Map(leaves(MESSAGES.en));
  for (const language of ['hi', 'te']) {
    const other = new Map(leaves(MESSAGES[language]));
    for (const [key, text] of english) {
      if (!/^(jobs|job|done|jobStatus|jobPriority|settings)\./.test(key)) continue;
      assert.ok(other.has(key), `${language} is missing ${key}`);
      assert.equal(holes(other.get(key)), holes(text), `${language}: ${key}`);
      assert.ok(!other.get(key).includes("'"), `${language}: ${key} uses a straight quote`);
    }
  }
});

test('request IDs are version 4 UUIDs and do not repeat', () => {
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  try {
    const ids = new Set(Array.from({ length: 1000 }, newRequestId));
    assert.equal(ids.size, 1000);
    for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally {
    Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
  }
  assert.match(newRequestId(), /^[0-9a-f-]{36}$/);
});

test('day helpers handle month ends and unknown time zones', () => {
  assert.equal(nextDayKey('2026-10-31'), '2026-11-01');
  assert.equal(nextDayKey('2026-12-31'), '2027-01-01');
  assert.equal(formatDayLabel('en-GB', '2026-10-07'), 'Wed 7 Oct');
  assert.match(dayKey('Not/AZone', new Date(NOW)), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(dayKey(ZONE, new Date('2026-10-05T19:00:00Z')), '2026-10-06');
});

let failed = 0;
for (const { name, run } of tests) {
  try {
    await run();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed++;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}
if (failed) {
  console.error(`Jobs checks failed: ${failed}/${tests.length}.`);
  process.exit(1);
}
console.log(`Jobs checks passed: ${tests.length}/${tests.length}.`);
