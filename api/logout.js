const { clearSessionCookie } = require('./_auth');
const { allowMethods } = require('./_util');

module.exports = async (req, res) => {
    if (!allowMethods(req, res, ['POST'])) return;
    clearSessionCookie(res);
    res.status(200).json({ ok: true });
};
