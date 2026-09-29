import crypto from 'crypto';

// Keeps the admin signed in: after one login with ADMIN_TOKEN the browser
// holds a signed, expiring session token (HS256 JWT) in an HttpOnly cookie,
// so page scripts - the site's ad and analytics ones included - can't read it,
// and ADMIN_TOKEN itself never stays in the browser. The signing key comes
// from ADMIN_TOKEN, so changing ADMIN_TOKEN signs every session out.

export const SESSION_COOKIE = 'admin_session';
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const b64url = (s: string) => Buffer.from(s).toString('base64url');
// Only this exact header is accepted, so a token can't pick its own algorithm
const HEADER = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const signingKey = (secret: string) => crypto.createHash('sha256').update(`admin-session:${secret}`).digest();
const sign = (data: string, secret: string) => crypto.createHmac('sha256', signingKey(secret)).update(data).digest('base64url');

export function issueSession(secret: string, now = Date.now()) {
  const payload = b64url(JSON.stringify({
    sub: 'admin',
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + SESSION_MAX_AGE_MS) / 1000),
  }));
  return `${HEADER}.${payload}.${sign(`${HEADER}.${payload}`, secret)}`;
}

export function verifySession(token: string, secret: string, now = Date.now()) {
  const [header, payload, signature, extra] = token.split('.');
  if (header !== HEADER || !payload || !signature || extra !== undefined) return false;
  const expected = Buffer.from(sign(`${header}.${payload}`, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return false;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return sub === 'admin' && typeof exp === 'number' && exp * 1000 > now;
  } catch {
    return false;
  }
}

/** One cookie's value from a Cookie header. */
export function readCookie(header: string | undefined, name: string) {
  for (const part of header?.split(';') ?? []) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}
