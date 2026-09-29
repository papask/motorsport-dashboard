import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueSession, readCookie, SESSION_MAX_AGE_MS, verifySession } from '../src/adminSession';

const now = Date.parse('2026-09-29T12:00:00Z');

test('a session holds for 30 days, and only under the ADMIN_TOKEN that signed it', () => {
  const token = issueSession('secret-a', now);
  assert.equal(verifySession(token, 'secret-a', now), true);
  assert.equal(verifySession(token, 'secret-a', now + SESSION_MAX_AGE_MS - 1000), true);
  assert.equal(verifySession(token, 'secret-a', now + SESSION_MAX_AGE_MS + 1000), false); // expired
  assert.equal(verifySession(token, 'secret-b', now), false); // ADMIN_TOKEN changed: signed out
});

test('a tampered or forged session is refused', () => {
  const [header, payload, signature] = issueSession('secret-a', now).split('.');
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  // a later expiry with the old signature
  const longer = b64({ sub: 'admin', iat: 0, exp: 9999999999 });
  assert.equal(verifySession(`${header}.${longer}.${signature}`, 'secret-a', now), false);
  // "alg: none" with no signature
  assert.equal(verifySession(`${b64({ alg: 'none', typ: 'JWT' })}.${payload}.`, 'secret-a', now), false);
  assert.equal(verifySession(`${header}.${payload}`, 'secret-a', now), false);
  assert.equal(verifySession(`${header}.${payload}.${signature}.x`, 'secret-a', now), false);
  assert.equal(verifySession('', 'secret-a', now), false);
});

test('the session cookie is found among others', () => {
  assert.equal(readCookie('a=1; admin_session=x.y.z; b=2', 'admin_session'), 'x.y.z');
  assert.equal(readCookie('admin_session_old=1', 'admin_session'), undefined);
  assert.equal(readCookie(undefined, 'admin_session'), undefined);
});
