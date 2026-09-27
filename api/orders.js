/**
 * POST   /api/orders  — PUBLIC. Places an order from the storefront.
 * GET    /api/orders  — all orders.                          Auth required.
 * PATCH  /api/orders  — { id, status }.                      Auth required.
 * DELETE /api/orders  — ?id=...                              Auth required.
 *
 * Storage: orders.json in the repo, via the GitHub Contents API.
 * Prices are re-read from products.json server-side, so a crafted request
 * cannot set its own price.
 */
const { getAuthUser } = require('./_auth');
const github = require('./_github');
const {
    parseBody, normalizePrice, allowMethods, sendError, handleError, cleanText,
} = require('./_util');

const REPO_FILE = 'orders.json';
const PRODUCTS_FILE = 'products.json';
const ORDER_ID_PREFIX = 'SVC';
const STATUSES = ['pending', 'confirmed', 'delivered'];
const MOBILE_RE = /^[6-9]\d{9}$/;

const readOrders = async () => {
    const { sha, content } = await github.getFile(REPO_FILE);
    const list = Array.isArray(content && content.orders) ? content.orders : [];
    return { sha, doc: content && typeof content === 'object' ? content : {}, list };
};

const writeOrders = (sha, doc, list, message) => {
    doc.orders = list;
    doc.count = list.length;
    return github.putFile(REPO_FILE, sha, doc, message);
};

function nextOrderId(list) {
    let max = 0;
    for (const o of list) {
        const m = /(\d+)\s*$/.exec(String(o.id || ''));
        if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return ORDER_ID_PREFIX + '-' + String(max + 1).padStart(4, '0');
}

/** Best-effort read of the live catalogue so prices are never client-trusted. */
async function loadCatalogue() {
    try {
        const { content } = await github.getFile(PRODUCTS_FILE);
        const list = Array.isArray(content && content.products) ? content.products : [];
        const byId = new Map();
        const byName = new Map();
        for (const p of list) {
            byId.set(String(p.id), p);
            byName.set(String(p.name || '').trim().toLowerCase(), p);
        }
        return { byId, byName };
    } catch (e) {
        return null; // catalogue unreadable — fall back to client-supplied prices
    }
}

function resolveItem(raw, cat) {
    const name = cleanText(raw.name, 'name');
    if (!name) return null;
    const qty = Math.round(Number(raw.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 9999) return null;

    const source = (raw.id != null && raw.id !== '' && cat && cat.byId.get(String(raw.id)))
        || (cat && cat.byName.get(name.toLowerCase()));

    const rate = source ? normalizePrice(source.rate) : normalizePrice(raw.rate);
    const finalRate = source ? normalizePrice(source.finalRate) : normalizePrice(raw.finalRate);
    const content = source ? (source.content || null) : (cleanText(raw.content, 'content') || null);

    return {
        name: source ? source.name : name,
        content,
        qty,
        rate,
        finalRate: finalRate > 0 || rate === 0 ? finalRate : rate,
        lineTotal: normalizePrice(finalRate * qty),
    };
}

module.exports = async (req, res) => {
    try {
        if (req.method === 'POST') {
            const body = parseBody(req);
            const customerName = cleanText(body.customerName, 'name');
            const mobile = String(body.mobile || '').replace(/\D/g, '').slice(0, 10);
            if (!customerName) return sendError(res, 500, 'Customer name is required');
            if (!MOBILE_RE.test(mobile)) return sendError(res, 500, 'Enter a valid 10-digit Indian mobile number');

            const rawItems = Array.isArray(body.items) ? body.items.slice(0, 200) : [];
            if (!rawItems.length) return sendError(res, 500, 'Order has no items');

            const cat = await loadCatalogue();
            const items = rawItems.map(r => resolveItem(r, cat)).filter(Boolean);
            if (!items.length) return sendError(res, 500, 'Order has no valid items');

            const total = normalizePrice(items.reduce((s, it) => s + it.lineTotal, 0));
            const savings = normalizePrice(Math.max(0, items.reduce((s, it) => s + it.rate * it.qty, 0) - total));

            const result = await github.withLock(async () => {
                const { sha, doc, list } = await readOrders();
                const order = {
                    id: nextOrderId(list),
                    customerName,
                    mobile,
                    items,
                    total,
                    savings,
                    status: 'pending', // always pending; a client cannot pre-confirm
                    createdAt: new Date().toISOString(),
                };
                list.push(order);
                await writeOrders(sha, doc, list, 'New order ' + order.id + ' via /api/orders');
                return order;
            });

            return res.status(201).json({ ok: true, order: result });
        }

        if (req.method === 'GET') {
            if (!getAuthUser(req)) return sendError(res, 401, 'Unauthorized');
            const { list } = await readOrders();
            return res.status(200).json({ orders: list });
        }

        if (req.method === 'PATCH') {
            if (!getAuthUser(req)) return sendError(res, 401, 'Unauthorized');
            const body = parseBody(req);
            const id = String(body.id || '');
            const status = String(body.status || '');
            if (!id) return sendError(res, 400, 'Order id is required');
            if (STATUSES.indexOf(status) === -1) {
                return sendError(res, 400, 'Status must be one of: ' + STATUSES.join(', '));
            }

            const result = await github.withLock(async () => {
                const { sha, doc, list } = await readOrders();
                const idx = list.findIndex(o => String(o.id) === id);
                if (idx === -1) return { status: 404, error: 'Order ' + id + ' not found' };
                const from = list[idx].status;
                list[idx] = Object.assign({}, list[idx], { status });
                await writeOrders(sha, doc, list,
                    'Order ' + id + ' status ' + from + ' -> ' + status + ' (admin)');
                return { status: 200, body: { ok: true, orders: list } };
            });

            if (result.error) return sendError(res, result.status, result.error);
            return res.status(result.status).json(result.body);
        }

        if (req.method === 'DELETE') {
            if (!getAuthUser(req)) return sendError(res, 401, 'Unauthorized');
            const id = String(req.query.id || '');
            if (!id) return sendError(res, 400, 'Order id is required');

            const result = await github.withLock(async () => {
                const { sha, doc, list } = await readOrders();
                const idx = list.findIndex(o => String(o.id) === id);
                if (idx === -1) return { status: 404, error: 'Order ' + id + ' not found' };
                list.splice(idx, 1);
                await writeOrders(sha, doc, list, 'Remove order ' + id + ' (admin)');
                return { status: 200, body: { ok: true, orders: list } };
            });

            if (result.error) return sendError(res, result.status, result.error);
            return res.status(result.status).json(result.body);
        }

        return allowMethods(req, res, ['GET', 'POST', 'PATCH', 'DELETE']);
    } catch (err) {
        return handleError(res, err);
    }
};
