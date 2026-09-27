const { setSessionCookie, safeEqual } = require('./_auth');
const { parseBody, allowMethods, sendError } = require('./_util');

module.exports = async (req, res) => {
    if (!allowMethods(req, res, ['POST'])) return;

    // Credentials: env vars win. The fallbacks below are the panel's built-in
    // login so it works without any Vercel configuration — anyone who can read
    // this repo can read them, so keep the repo private.
    const username = process.env.ADMIN_USERNAME || 'kotravel';
    const password = process.env.ADMIN_PASSWORD || 'sivakasi';
    if (!username || !password) {
        return sendError(res, 500, 'Admin credentials not configured');
    }

    const body = parseBody(req);
    const okUser = safeEqual(body.username || '', username);
    const okPass = safeEqual(body.password || '', password);

    if (!okUser || !okPass) {
        return sendError(res, 401, 'Invalid username or password');
    }

    setSessionCookie(res, username);
    res.status(200).json({ ok: true, username });
};
