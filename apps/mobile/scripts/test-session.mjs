// Unit tests for opening the app offline: which saved account checks may be
// used, how failed checks are treated, retry waits and when to check again.
// Run with: npm test
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./helpers/module-hooks.mjs', import.meta.url);
process.env.EXPO_PUBLIC_API_URL = 'https://serviceflow.example';

const { ApiError } = await import('../src/lib/api/client.ts');
const {
  OFFLINE_SESSION_MAX_AGE_MS,
  RECHECK_AFTER_MS,
  classifyCheckError,
  isCheckDue,
  isSignInEnded,
  readCachedSession,
  retryDelay,
  serializeCachedSession,
} = await import('../src/lib/auth/session-sync.ts');
const { formatCheckedAt } = await import('../src/lib/format.ts');

const NOW = Date.parse('2026-10-05T04:00:00Z');
const session = (overrides = {}) => ({
  user: { uid: 'user-1', email: 'tess@example.com', displayName: 'Tess Fernandes' },
  organization: { id: 'org-1', name: 'Greenleaf Services', timezone: 'Asia/Kolkata' },
  role: 'TECHNICIAN',
  access: 'ALLOWED',
  technician: { id: 'tech-1', displayName: 'Tess Fernandes', employeeNumber: 'EMP-014', status: 'AVAILABLE' },
  ...overrides,
});
const saved = (overrides = {}) => serializeCachedSession({ uid: 'user-1', checkedAt: NOW - 60_000, session: session(), ...overrides });

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('uses a recent saved check for the same user', () => {
  const entry = readCachedSession(saved(), 'user-1', NOW);
  assert.equal(entry?.uid, 'user-1');
  assert.equal(entry?.checkedAt, NOW - 60_000);
  assert.equal(entry?.session.technician.employeeNumber, 'EMP-014');
});

test('never shows another user’s saved details', () => {
  assert.equal(readCachedSession(saved(), 'user-2', NOW), null);
  const mismatched = saved({ session: session({ user: { uid: 'user-2', email: 'x@example.com', displayName: 'X' } }) });
  assert.equal(readCachedSession(mismatched, 'user-1', NOW), null, 'the session inside must belong to the same user');
  assert.equal(readCachedSession(saved(), '', NOW), null);
});

test('stops opening offline after 7 days, and ignores checks dated in the future', () => {
  assert.equal(OFFLINE_SESSION_MAX_AGE_MS, 7 * 24 * 60 * 60 * 1000);
  assert.ok(readCachedSession(saved({ checkedAt: NOW - OFFLINE_SESSION_MAX_AGE_MS }), 'user-1', NOW));
  assert.equal(readCachedSession(saved({ checkedAt: NOW - OFFLINE_SESSION_MAX_AGE_MS - 1 }), 'user-1', NOW), null);
  assert.ok(readCachedSession(saved({ checkedAt: NOW + 4 * 60_000 }), 'user-1', NOW), 'small clock differences are fine');
  assert.equal(readCachedSession(saved({ checkedAt: NOW + 60 * 60_000 }), 'user-1', NOW), null);
});

test('only saved checks that allowed access can open the app', () => {
  for (const access of ['ROLE_NOT_SUPPORTED', 'PROFILE_MISSING']) {
    assert.equal(readCachedSession(saved({ session: session({ access, technician: null }) }), 'user-1', NOW), null, access);
  }
  const inactive = session({ access: 'PROFILE_INACTIVE', technician: { ...session().technician, status: 'INACTIVE' } });
  assert.equal(readCachedSession(saved({ session: inactive }), 'user-1', NOW), null);
});

test('rejects damaged or unexpected saved data', () => {
  for (const raw of [null, '', 'not json', '"text"', '{}', '{"uid":"user-1","checkedAt":"yesterday","session":{}}',
    JSON.stringify({ uid: 'user-1', checkedAt: NOW, session: { access: 'ALLOWED' } }),
    JSON.stringify({ uid: 'user-1', checkedAt: Number.NaN, session: session() })]) {
    assert.equal(readCachedSession(raw, 'user-1', NOW), null, String(raw));
  }
});

test('only the account summary is saved — no tokens', () => {
  const text = saved();
  assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ['checkedAt', 'session', 'uid']);
  assert.ok(!/token/i.test(text));
});

test('sorts failed checks into sign out, account messages, or keep showing saved details', () => {
  assert.deepEqual(classifyCheckError(new ApiError(401, 'SESSION_REVOKED', 'x')), { kind: 'ended' });
  assert.deepEqual(classifyCheckError(new ApiError(401, 'UNAUTHENTICATED', 'x')), { kind: 'ended' });
  assert.deepEqual(classifyCheckError(new ApiError(403, 'EMAIL_NOT_VERIFIED', 'x')), { kind: 'unverified' });
  assert.deepEqual(classifyCheckError(new ApiError(403, 'ACCOUNT_UNAVAILABLE', 'x', 'MEMBERSHIP_INACTIVE')),
    { kind: 'unavailable', reason: 'MEMBERSHIP_INACTIVE' });
  assert.deepEqual(classifyCheckError(new ApiError(0, 'NETWORK', 'x')), { kind: 'transient', reason: 'network' });
  assert.deepEqual(classifyCheckError(new ApiError(500, null, 'x')), { kind: 'transient', reason: 'server' });
  assert.deepEqual(classifyCheckError(new ApiError(503, 'MAINTENANCE', 'x')), { kind: 'transient', reason: 'server' });
  assert.deepEqual(classifyCheckError(new ApiError(502, 'INVALID_RESPONSE', 'x')), { kind: 'transient', reason: 'unexpected' });
  assert.deepEqual(classifyCheckError({ code: 'auth/network-request-failed' }), { kind: 'transient', reason: 'network' });
  assert.deepEqual(classifyCheckError({ code: 'auth/user-disabled' }), { kind: 'ended' });
  assert.deepEqual(classifyCheckError({ code: 'auth/user-token-expired' }), { kind: 'ended' });
  assert.deepEqual(classifyCheckError(new Error('boom')), { kind: 'transient', reason: 'unexpected' });
  assert.equal(isSignInEnded({ code: 'auth/invalid-user-token' }), true);
  assert.equal(isSignInEnded({ code: 'auth/network-request-failed' }), false);
});

test('retries after 30 s, 1 min, 2 min, then every 5 min', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 10, -1].map(retryDelay), [30_000, 60_000, 120_000, 300_000, 300_000, 300_000, 30_000]);
});

test('checks again on return when offline or after 5 minutes', () => {
  assert.equal(RECHECK_AFTER_MS, 5 * 60_000);
  assert.equal(isCheckDue({ checkedAt: NOW - 60_000, connection: 'online' }, NOW), false);
  assert.equal(isCheckDue({ checkedAt: NOW - RECHECK_AFTER_MS, connection: 'online' }, NOW), true);
  assert.equal(isCheckDue({ checkedAt: NOW - 1_000, connection: 'offline' }, NOW), true);
  assert.equal(isCheckDue({ checkedAt: NOW - 1_000, connection: 'unavailable' }, NOW), true);
});

test('shows when details were last confirmed, in the workspace time zone', () => {
  const morning = new Date('2026-10-05T03:45:00Z'); // 09:15 in India
  assert.equal(formatCheckedAt('Asia/Kolkata', 'en-GB', morning, new Date('2026-10-05T06:00:00Z')), '9:15');
  assert.equal(formatCheckedAt('Asia/Kolkata', 'en-GB', morning, new Date('2026-10-06T06:00:00Z')), '5 Oct, 9:15');
  assert.match(formatCheckedAt('Asia/Kolkata', 'hi-IN', morning, new Date('2026-10-05T06:00:00Z')), /9:15/);
  assert.match(formatCheckedAt('Asia/Kolkata', 'te-IN', morning, new Date('2026-10-05T06:00:00Z')), /9:15/);
  assert.equal(formatCheckedAt('Not/AZone', 'en-GB', morning, morning).length > 0, true);
});

let failed = 0;
for (const { name, run } of tests) {
  try {
    await run();
    console.log(`✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${name}\n`, error);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} offline session tests passed`);
if (failed) process.exitCode = 1;
