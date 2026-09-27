/**
 * Shared helpers: body parsing, price normalisation, method + error guards.
 */

function parseBody(req) {
    let body;
    try {
        body = (typeof req.body === 'object' && req.body !== null) ? req.body : JSON.parse(req.body || '{}');
    } catch (e) {
        body = {};
    }
    return body && typeof body === 'object' ? body : {};
}

function normalizePrice(v) {
    const n = Math.round((Number(v) + Number.EPSILON) * 100) / 100;
    return Number.isFinite(n) ? n : 0;
}

function sendError(res, status, message) {
    res.status(status).json({ error: message });
}

/** Only allows the listed methods; answers 405 + Allow otherwise. */
function allowMethods(req, res, methods) {
    if (methods.indexOf(req.method) !== -1) return true;
    res.setHeader('Allow', methods.join(', '));
    sendError(res, 405, `Method ${req.method} not allowed`);
    return false;
}

function methodNotAllowed(res) {
    return sendError(res, 405, 'Method not allowed');
}

/**
 * Maps an error thrown by the storage layer onto an HTTP response.
 * A GitHub SHA clash becomes 409 CONFLICT so the client can retry.
 */
function handleError(res, err) {
    const msg = String((err && err.message) || err || 'Unexpected error');
    if (/CONFLICT/.test(msg)) return sendError(res, 409, msg);
    return sendError(res, 500, msg);
}

const MAX_LEN = { name: 120, category: 80, content: 60, image: 200, tag: 40, address: 250 };

/** Trims and length-caps a free-text field. */
function cleanText(v, field) {
    if (v == null) return '';
    return String(v).trim().slice(0, MAX_LEN[field] || 120);
}

module.exports = {
    parseBody,
    normalizePrice,
    sendError,
    allowMethods,
    methodNotAllowed,
    handleError,
    cleanText,
    MAX_LEN,
};
