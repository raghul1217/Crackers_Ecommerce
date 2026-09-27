/**
 * GET    /api/products  — public catalogue read (storefront may use it).
 * POST   /api/products  — create (no id) or update (with id).  Auth required.
 * DELETE /api/products  — ?id=...                                     Auth required.
 *
 * Storage: products.json in the repo, via the GitHub Contents API.
 */
const { getAuthUser } = require('./_auth');
const github = require('./_github');
const {
    parseBody, normalizePrice, allowMethods, sendError, handleError, cleanText,
} = require('./_util');

const REPO_FILE = 'products.json';

const readDoc = async () => {
    const { sha, content } = await github.getFile(REPO_FILE);
    const list = Array.isArray(content && content.products) ? content.products : [];
    return { sha, doc: content && typeof content === 'object' ? content : {}, list };
};

const writeDoc = (sha, doc, list, message) => {
    doc.products = list;
    doc.count = list.length;
    doc.exportedAt = new Date().toISOString();
    return github.putFile(REPO_FILE, sha, doc, message);
};

/** One past the highest numeric suffix currently in use, keeping its prefix. */
function nextId(list) {
    let max = 0;
    let prefix = 'PRD';
    for (const p of list) {
        const m = /^(.*?)(\d+)$/.exec(String(p.id || ''));
        if (!m) continue;
        const n = parseInt(m[2], 10);
        if (n > max) { max = n; prefix = m[1]; }
    }
    return prefix + String(max + 1).padStart(3, '0');
}

function validate(body, existing) {
    const name = cleanText(body.name, 'name');
    const category = cleanText(body.category, 'category');
    if (!name) throw new Error('Product name is required');
    if (!category) throw new Error('Category is required');

    const rate = Number(body.rate);
    if (!Number.isFinite(rate) || rate < 0) throw new Error('MRP / Rate must be a positive number');

    // discountPct is percent OFF; stored `discount` is a factor. The admin form
    // always sends percent, but a direct finalRate is honoured when no percent is given.
    let factor;
    let finalRate;
    if (body.discountPct !== undefined && body.discountPct !== null && body.discountPct !== '') {
        const pct = Number(body.discountPct);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
            throw new Error('Discount must be a percentage between 0 and 100');
        }
        factor = normalizePrice((100 - pct) / 100);
        finalRate = normalizePrice(rate * factor);
    } else if (body.finalRate !== undefined && body.finalRate !== null && body.finalRate !== '') {
        const fr = Number(body.finalRate);
        if (!Number.isFinite(fr) || fr < 0) throw new Error('Final rate must be a positive number');
        finalRate = normalizePrice(fr);
        factor = rate > 0 ? normalizePrice(Math.min(1, finalRate / rate)) : 1;
    } else {
        factor = 1;
        finalRate = normalizePrice(rate);
    }

    return {
        name,
        category,
        tag: cleanText(body.tag, 'tag') || null,
        content: cleanText(body.content, 'content') || '1 box',
        rate: normalizePrice(rate),
        discount: factor,
        finalRate,
        image: cleanText(body.image, 'image') || null,
        fallbackImage: cleanText(body.fallbackImage, 'image') || 'images/placeholder.webp',
        rating: Number.isFinite(Number(body.rating)) ? normalizePrice(body.rating) : 4.2,
        inStock: body.inStock === undefined ? true : !!body.inStock,
        ...(existing ? {} : { id: '' }),
    };
}

module.exports = async (req, res) => {
    try {
        if (req.method === 'GET') {
            const { list } = await readDoc();
            return res.status(200).json({ products: list });
        }

        if (req.method === 'POST') {
            if (!getAuthUser(req)) return sendError(res, 401, 'Unauthorized');
            const body = parseBody(req);
            const result = await github.withLock(async () => {
                const { sha, doc, list } = await readDoc();
                const id = body.id === undefined || body.id === null || body.id === '' ? null : String(body.id);

                if (id) {
                    const idx = list.findIndex(p => String(p.id) === id);
                    if (idx === -1) return { status: 404, error: 'Product ' + id + ' not found' };
                    const clash = list.some(p => p.name.trim().toLowerCase() === String(body.name || '').trim().toLowerCase()
                        && String(p.id) !== id);
                    if (clash) return { status: 409, error: 'A product named "' + body.name + '" already exists' };
                    const next = Object.assign({}, list[idx], validate(body, list[idx]));
                    list[idx] = next;
                    await writeDoc(sha, doc, list, 'Update product ' + id + ' (admin) via /api/products');
                    return { status: 200, body: { ok: true, products: list } };
                }

                const name = cleanText(body.name, 'name');
                if (list.some(p => String(p.name || '').trim().toLowerCase() === name.toLowerCase())) {
                    return { status: 409, error: 'A product named "' + name + '" already exists' };
                }
                const fresh = Object.assign(validate(body, null), { id: nextId(list) });
                list.push(fresh);
                await writeDoc(sha, doc, list, 'Add product ' + fresh.id + ' (admin) via /api/products');
                return { status: 200, body: { ok: true, products: list } };
            });

            if (result.error) return sendError(res, result.status, result.error);
            return res.status(result.status).json(result.body);
        }

        if (req.method === 'DELETE') {
            if (!getAuthUser(req)) return sendError(res, 401, 'Unauthorized');
            const id = String(req.query.id || '');
            if (!id) return sendError(res, 400, 'Product id is required');

            const result = await github.withLock(async () => {
                const { sha, doc, list } = await readDoc();
                const idx = list.findIndex(p => String(p.id) === id);
                if (idx === -1) return { status: 404, error: 'Product ' + id + ' not found' };
                const [removed] = list.splice(idx, 1);
                await writeDoc(sha, doc, list, 'Remove product ' + id + ' ' + (removed.name || '') + ' (admin)');
                return { status: 200, body: { ok: true, products: list } };
            });

            if (result.error) return sendError(res, result.status, result.error);
            return res.status(result.status).json(result.body);
        }

        return allowMethods(req, res, ['GET', 'POST', 'DELETE']);
    } catch (err) {
        return handleError(res, err);
    }
};
