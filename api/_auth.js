/**
 * Stateless session auth: signed HMAC-SHA256 token in an HttpOnly cookie.
 * No session store, no dependencies.
 */
const crypto = require('crypto');

const SESSION_COOKIE = 's66_admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function secret() {
    return process.env.AUTH_SECRET || process.env.ADMIN_SESSION_SECRET || '';
}

function b64url(buf) {
    return Buffer.from(buf).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function fromB64url(str) {
    let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return Buffer.from(s, 'base64');
}

function sign(payload) {
    return b64url(crypto.createHmac('sha256', secret()).update(payload).digest());
}

function createToken(username, ttlMs) {
    const payload = { u: String(username), exp: Date.now() + (ttlMs || SESSION_TTL_MS) };
    const body = b64url(JSON.stringify(payload));
    return body + '.' + sign(body);
}

function verifyToken(token) {
    if (!token) return null;
    const parts = String(token).split('.');
    if (parts.length !== 2) return null;

    const [body, given] = parts;
    const expected = sign(body);
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;

    let payload;
    try {
        payload = JSON.parse(fromB64url(body).toString('utf8'));
    } catch (e) {
        return null;
    }
    if (!payload || typeof payload.u !== 'string') return null;
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
    return payload.u;
}

function parseCookies(req) {
    const out = {};
    const raw = (req.headers && (req.headers.cookie || req.headers.Cookie)) || '';
    String(raw).split(';').forEach(pair => {
        const i = pair.indexOf('=');
        if (i < 0) return;
        const k = pair.slice(0, i).trim();
        if (k) out[k] = decodeURIComponent(pair.slice(i + 1).trim());
    });
    return out;
}

/** The single gate used by every protected route. Returns username or null. */
function getAuthUser(req) {
    if (!secret()) return null;
    return verifyToken(parseCookies(req)[SESSION_COOKIE]);
}

function cookieString(token) {
    // Secure is omitted so the panel also works over http://localhost during dev.
    return SESSION_COOKIE + '=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' +
        Math.floor(SESSION_TTL_MS / 1000);
}

function setSessionCookie(res, username) {
    res.setHeader('Set-Cookie', cookieString(createToken(username)));
}

function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', SESSION_COOKIE + '=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

module.exports = {
    SESSION_COOKIE,
    SESSION_TTL_MS,
    createToken,
    verifyToken,
    getAuthUser,
    setSessionCookie,
    clearSessionCookie,
    safeEqual,
};

function safeEqual(a, b) {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
}
