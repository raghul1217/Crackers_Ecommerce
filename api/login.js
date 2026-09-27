const { setSessionCookie, safeEqual } = require('./_auth');
const { parseBody, allowMethods, sendError } = require('./_util');

module.exports = async (req, res) => {
    if (!allowMethods(req, res, ['POST'])) return;

    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;
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
