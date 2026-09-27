const { getAuthUser } = require('./_auth');
const { allowMethods } = require('./_util');

module.exports = async (req, res) => {
    if (!allowMethods(req, res, ['GET'])) return;
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ authenticated: false });
    res.status(200).json({ authenticated: true, username: user });
};
