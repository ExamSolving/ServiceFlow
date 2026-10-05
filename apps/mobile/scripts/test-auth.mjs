// Unit tests for the technician app's sign-in plumbing: the session contract
// with GET /api/mobile/session, API errors, error messages and formatting.
// Run with: npm test
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./helpers/module-hooks.mjs', import.meta.url);
process.env.EXPO_PUBLIC_API_URL = 'https://serviceflow.example/';

const { ApiError, apiRequest } = await import('../src/lib/api/client.ts');
const { fetchMobileSession, parseMobileSession } = await import('../src/lib/auth/mobile-session.ts');
const { authErrorCode, authErrorKey } = await import('../src/lib/auth/auth-errors.ts');
// Resolved to scripts/stubs/firebase-client.mjs, the same module auth-errors.ts sees.
const { AppConfigError } = await import('@/lib/firebase/client');
const { formatToday, greetingKey, initials } = await import('../src/lib/format.ts');
const { isEmail } = await import('../src/lib/validation.ts');

/** A payload shaped exactly like readMobileSession() in apps/web. */
function payload(overrides = {}) {
  return {
    user: { uid: 'user-1', email: 'ravi@example.com', displayName: 'Ravi Kumar' },
    organization: { id: 'org-1', name: 'Acme Services', timezone: 'Asia/Kolkata' },
    role: 'TECHNICIAN',
    access: 'ALLOWED',
    technician: { id: 'tech-1', displayName: 'Ravi Kumar', employeeNumber: 'EMP-7', status: 'AVAILABLE' },
    ...overrides,
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function fakeUser() {
  const calls = [];
  return {
    calls,
    async getIdToken(forceRefresh = false) {
      calls.push(forceRefresh);
      return forceRefresh ? 'fresh.id.token' : 'cached.id.token';
    },
  };
}

function mockFetch(...responses) {
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('Unexpected request');
    return typeof next === 'function' ? next(url, init) : next;
  };
  return requests;
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('parses every access state the server returns and ignores extra fields', () => {
  assert.deepEqual(parseMobileSession({ ...payload(), extra: true }), payload());
  for (const access of ['ROLE_NOT_SUPPORTED', 'PROFILE_MISSING']) {
    const role = access === 'ROLE_NOT_SUPPORTED' ? 'DISPATCHER' : 'TECHNICIAN';
    assert.equal(parseMobileSession(payload({ access, role, technician: null }))?.access, access);
  }
  const inactive = payload({ access: 'PROFILE_INACTIVE', technician: { ...payload().technician, status: 'INACTIVE' } });
  assert.equal(parseMobileSession(inactive)?.technician?.status, 'INACTIVE');
  assert.equal(parseMobileSession(payload({ technician: { ...payload().technician, employeeNumber: '' } }))?.technician?.employeeNumber, '');
});

test('rejects malformed or inconsistent session payloads', () => {
  const bad = [
    null,
    'session',
    payload({ role: 'SUPERUSER' }),
    payload({ access: 'MAYBE' }),
    payload({ technician: null }),
    payload({ access: 'PROFILE_INACTIVE', technician: null }),
    payload({ technician: { ...payload().technician, status: 'SLEEPING' } }),
    payload({ technician: { ...payload().technician, displayName: '' } }),
    payload({ user: { uid: '', email: 'a@b.co', displayName: '' } }),
    payload({ organization: { id: 'org-1', name: 'Acme', timezone: 7 } }),
  ];
  for (const value of bad) assert.equal(parseMobileSession(value), null, JSON.stringify(value));
});

test('sends the ID token as a Bearer token to the configured server', async () => {
  const requests = mockFetch(json(200, { session: payload() }));
  const user = fakeUser();
  const session = await fetchMobileSession(user);
  assert.equal(session.technician.id, 'tech-1');
  assert.equal(requests[0].url, 'https://serviceflow.example/api/mobile/session');
  assert.equal(requests[0].init.method, 'GET');
  assert.equal(requests[0].init.headers.authorization, 'Bearer cached.id.token');
  assert.equal(requests[0].init.credentials, 'omit');
  assert.deepEqual(user.calls, [false]);
});

test('retries once with a fresh token when the server says it expired', async () => {
  const requests = mockFetch(json(401, { message: 'Expired', code: 'TOKEN_EXPIRED' }), json(200, { session: payload() }));
  const user = fakeUser();
  await fetchMobileSession(user);
  assert.deepEqual(user.calls, [false, true]);
  assert.equal(requests[1].init.headers.authorization, 'Bearer fresh.id.token');

  mockFetch(json(401, { code: 'TOKEN_EXPIRED' }), json(401, { message: 'Still expired', code: 'TOKEN_EXPIRED' }));
  const again = fakeUser();
  await assert.rejects(fetchMobileSession(again), (error) => error instanceof ApiError && error.code === 'TOKEN_EXPIRED');
  assert.deepEqual(again.calls, [false, true], 'never loops');
});

test('reports revoked sessions, unavailable accounts and bad responses with their codes', async () => {
  mockFetch(json(401, { message: 'Sign in to continue.', code: 'SESSION_REVOKED' }));
  const user = fakeUser();
  await assert.rejects(fetchMobileSession(user), (error) => error.status === 401 && error.code === 'SESSION_REVOKED');
  assert.deepEqual(user.calls, [false], 'no retry for a revoked session');

  mockFetch(json(403, { message: 'Unavailable', code: 'ACCOUNT_UNAVAILABLE', reason: 'MEMBERSHIP_INACTIVE' }));
  await assert.rejects(fetchMobileSession(fakeUser()), (error) => error.code === 'ACCOUNT_UNAVAILABLE' && error.reason === 'MEMBERSHIP_INACTIVE');

  mockFetch(json(200, { session: { access: 'ALLOWED' } }));
  await assert.rejects(fetchMobileSession(fakeUser()), (error) => error.code === 'INVALID_RESPONSE');

  mockFetch(new Response('<html>Bad gateway</html>', { status: 502 }));
  await assert.rejects(fetchMobileSession(fakeUser()), (error) => error.status === 502 && error.code === null && /try again/i.test(error.message));
});

test('turns network failures and timeouts into a connection error', async () => {
  mockFetch(() => Promise.reject(new TypeError('Network request failed')));
  await assert.rejects(apiRequest('/api/mobile/session', { token: 'a.b.c' }), (error) => error.status === 0 && error.code === 'NETWORK');

  mockFetch((url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))));
  const started = Date.now();
  await assert.rejects(apiRequest('/api/mobile/session', { timeoutMs: 25 }), (error) => error.code === 'NETWORK');
  assert.ok(Date.now() - started < 2000);
});

test('maps Firebase and configuration errors to translated messages', () => {
  assert.equal(authErrorCode({ code: 'auth/too-many-requests' }), 'auth/too-many-requests');
  assert.equal(authErrorCode(new Error('x')), null);
  assert.equal(authErrorKey({ code: 'auth/invalid-credential' }), 'errors.invalidCredential');
  assert.equal(authErrorKey({ code: 'auth/user-not-found' }), 'errors.invalidCredential', 'never reveals whether an account exists');
  assert.equal(authErrorKey({ code: 'auth/too-many-requests' }), 'errors.tooManyRequests');
  assert.equal(authErrorKey({ code: 'auth/invalid-email' }), 'validation.emailInvalid');
  assert.equal(authErrorKey({ code: 'auth/something-new' }), 'errors.unknownAuth');
  assert.equal(authErrorKey({ code: 'toString' }), 'errors.generic');
  assert.equal(authErrorKey({ code: 'auth/toString' }), 'errors.unknownAuth', 'ignores inherited properties');
  assert.equal(authErrorKey(new Error('boom')), 'errors.generic');
  assert.equal(authErrorKey(new AppConfigError(['EXPO_PUBLIC_API_URL'])), 'errors.config');
});

test('formats greetings and dates in the workspace time zone', () => {
  const early = new Date('2026-10-04T02:30:00Z');
  assert.equal(greetingKey('Asia/Kolkata', early), 'home.greetingMorning'); // 08:00 in India
  assert.equal(greetingKey('America/Los_Angeles', early), 'home.greetingEvening'); // 19:30 the day before
  assert.equal(greetingKey('Not/AZone', new Date(2026, 9, 4, 14)), 'home.greetingAfternoon'); // falls back to the phone
  assert.equal(formatToday('Asia/Kolkata', 'en-GB', new Date('2026-10-04T20:00:00Z')), 'Monday, 5 October');
  assert.equal(initials('Ravi Kumar Teja'), 'RT');
  assert.equal(initials('  priya  '), 'P');
  assert.equal(initials(''), '?');
  assert.ok(isEmail(' tech@acme.co '));
  assert.ok(!isEmail('tech@acme') && !isEmail('tech acme@x.co'));
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
console.log(`\n${tests.length - failed}/${tests.length} mobile auth tests passed`);
if (failed) process.exitCode = 1;
