/**
 * data.js — Product data loading and querying
 * Reads products from a Google Sheet (published CSV export, via SheetJS)
 * and exposes query helpers
 */

let _allProducts = [];

/* ── Sheet → Product schema mapping ─────────────────── */

const CATEGORY_IMAGE_BASE = {
  'Gift Boxes': 'gift-box',
  'Sky Shots': 'sky-shot',
  'Sparklers': 'sparklers',
  'Ground Chakkars': 'chakkar',
  'Flower Pots': 'flower-pot',
  'Rockets': 'rocket',
  'Sound Crackers': 'sound-cracker',
  'Fancy Crackers': 'fancy',
  'Party Crackers': 'party',
  'Kids Special': 'kids',
  'Garland Crackers': 'garland',
  'Repeating Fountains': 'fountain',
  'Deluxe Premium': 'deluxe',
};

const CATEGORY_IMAGE_COUNT = {
  'Gift Boxes': 5,
  'Sky Shots': 5,
  'Sparklers': 4,
  'Ground Chakkars': 2,
  'Flower Pots': 3,
  'Rockets': 2,
  'Sound Crackers': 3,
  'Fancy Crackers': 4,
  'Party Crackers': 3,
  'Kids Special': 3,
  'Garland Crackers': 2,
  'Repeating Fountains': 3,
  'Deluxe Premium': 3,
};

const CATEGORY_CODE = {
  'Gift Boxes': 'GB',
  'Sky Shots': 'SS',
  'Sparklers': 'SP',
  'Ground Chakkars': 'GC',
  'Flower Pots': 'FP',
  'Rockets': 'RK',
  'Sound Crackers': 'SC',
  'Fancy Crackers': 'FC',
  'Party Crackers': 'PC',
  'Kids Special': 'KS',
  'Garland Crackers': 'GL',
  'Repeating Fountains': 'RF',
  'Deluxe Premium': 'DP',
};

const TAG_BADGE = {
  'New Arrival': 'New',
  'Bestseller': 'Bestseller',
  'Popular': 'Popular',
  'Trending': 'Trending',
  'Premium': 'Premium',
  'Deluxe': 'Deluxe',
  'Kids Pack': 'Kids Pack',
};

const TAG_RATING = {
  'Bestseller': 4.8,
  'Popular': 4.6,
  'Trending': 4.4,
  'Premium': 4.7,
  'Deluxe': 4.7,
  'Kids Pack': 4.3,
  'New Arrival': 4.2,
};

function _round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Parse a rating value from the sheet (supports several common headers)
 * Returns a number 0–5, or null if absent/invalid
 * @param {Object} row
 * @returns {number|null}
 */
function _getRowRating(row) {
  const keys = [
    'Rating',
    'Ratings',
  ];
  for (const key of keys) {
    const v = row[key];
    if (v == null || v === '') continue;
    const n = Number(String(v).replace(/[^\d.]/g, ''));
    if (isFinite(n)) return Math.min(5, Math.max(0, n));
  }
  return null;
}

/**
 * Parse money values that may be formatted, e.g. "₹2,500.00"
 * @param {*} value
 * @returns {number}
 */
function _parseMoney(value) {
  if (typeof value === 'number') return isFinite(value) ? value : NaN;
  const cleaned = String(value == null ? '' : value).replace(/[^\d.-]/g, '');
  if (!cleaned) return NaN;
  return Number(cleaned);
}

/**
 * Parse percent values, e.g. "10%" → 10
 * @param {*} value
 * @returns {number}
 */
function _parsePercent(value) {
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  const cleaned = String(value == null ? '' : value).replace(/[^\d.-]/g, '');
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
}

/**
 * Parse spreadsheet rows into product objects
 * @param {Array<Object>} rows — objects keyed by header names
 * @returns {Array<Object>}
 */
function _parseProductsFromRows(rows) {
  const perCat = {};
  const products = [];

  for (const row of rows) {
    const name = row['Item Name'];
    const category = row['Category'];
    const sno = row['S.No'];

    if (!name || !category || sno == null) continue;

    const mrp = _parseMoney(row['MRP (₹)']);
    const price = _parseMoney(row['Final Price (₹)']);
    if (!isFinite(mrp) || !isFinite(price)) continue;

    const tag = row['Tag'];
    const contents = String(row['Contents / Packing Details'] || '');
    const discountPercent = Math.round(_parsePercent(row['Discount (%)']));
    const sheetRating = _getRowRating(row);

    const base = CATEGORY_IMAGE_BASE[category] || 'placeholder';
    const count = CATEGORY_IMAGE_COUNT[category] || 1;
    const idx = (perCat[category] = (perCat[category] || 0) + 1);

    products.push({
      id: `${CATEGORY_CODE[category] || 'P'}${String(sno).padStart(3, '0')}`,
      name,
      category,
      price: _round2(price),
      mrp: _round2(mrp),
      discountPercent,
      image: `images/${base}-${((idx - 1) % count) + 1}.webp`,
      description: `${contents || 'Premium quality product'}. A best-value pick from our ${category} collection, priced for the festive season.`,
      unit: contents || '1 box',
      rating: sheetRating != null ? _round2(sheetRating) : (TAG_RATING[tag] || 4.2),
      inStock: true,
      badge: TAG_BADGE[tag] || null,
    });
  }

  return products;
}

const GOOGLE_SHEET_ID = '1fVKmBQNx9BLI0uTuXf1-26uWdkt8AP4yMaGzn7tfns4';
const GOOGLE_API_KEY = 'AIzaSyDNsaBBMlV-d-8vYgMiEpW7JneE1bxRtSE';

const PRODUCTS_JSON_URL = 'products.json';
const PRODUCTS_CACHE_KEY = 'productsCache';
const PRODUCTS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

let _loadedExportedAt = null;

function _readProductsCache() {
  try {
    const raw = localStorage.getItem(PRODUCTS_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached || !cached.savedAt || !Array.isArray(cached.products) || !cached.products.length) return null;
    if (Date.now() - cached.savedAt > PRODUCTS_CACHE_TTL) return null;
    return cached;
  } catch (e) {
    return null;
  }
}

function _writeProductsCache(products, exportedAt) {
  try {
    localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      exportedAt: exportedAt || null,
      products,
    }));
  } catch (e) {
    /* storage full or unavailable — ignore */
  }
}

/**
 * Fetch the static products.json snapshot
 * @param {boolean} cacheBust — append a timestamp to bypass HTTP caching
 * @returns {Promise<{exportedAt: string, rows: Array<Object>}>}
 */
async function _fetchProductsJson(cacheBust) {
  const url = cacheBust ? `${PRODUCTS_JSON_URL}?t=${Date.now()}` : PRODUCTS_JSON_URL;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`products.json HTTP ${res.status}`);
  const payload = await res.json();
  if (!payload || !Array.isArray(payload.rows)) throw new Error('products.json missing rows');
  return payload;
}

/**
 * Convert a 2D array of values (first row = headers) into row objects
 * @param {Array<Array<*>>} rows
 * @returns {Array<Object>}
 */
function _rowsToObjects(rows) {
  if (!rows || rows.length < 2) return [];
  const headers = rows[0].map(h => String(h == null ? '' : h));
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = r[i] != null ? r[i] : null;
    });
    return obj;
  });
}

const SHEET_TITLE_KEY = 'productsSheetTitle';

function _getCachedSheetTitle() {
  try {
    return localStorage.getItem(SHEET_TITLE_KEY);
  } catch (e) {
    return null;
  }
}

function _setCachedSheetTitle(title) {
  try {
    localStorage.setItem(SHEET_TITLE_KEY, title);
  } catch (e) { /* ignore */ }
}

/**
 * Fetch products from the Google Sheet via the Sheets API v4
 * @param {string} [knownTitle] — cached sheet name, skips the metadata call
 * @returns {Promise<Array<Object>>}
 */
async function _fetchProductsFromGoogleSheets(knownTitle) {
  if (GOOGLE_API_KEY === 'PASTE_YOUR_API_KEY_HERE') {
    throw new Error('Google Sheets API key not set. Edit GOOGLE_API_KEY in js/data.js');
  }

  let title = knownTitle || _getCachedSheetTitle();
  if (!title) {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}?key=${GOOGLE_API_KEY}`
    );
    if (!metaRes.ok) throw new Error('Sheets API metadata: HTTP ' + metaRes.status);
    const meta = await metaRes.json();

    title = meta.sheets && meta.sheets[0] && meta.sheets[0].properties
      ? meta.sheets[0].properties.title
      : 'Sheet1';
    _setCachedSheetTitle(title);
  }

  const valuesRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/${encodeURIComponent(title)}?key=${GOOGLE_API_KEY}`
  );
  if (!valuesRes.ok) throw new Error('Sheets API values: HTTP ' + valuesRes.status);
  const data = await valuesRes.json();

  return _parseProductsFromRows(_rowsToObjects(data.values));
}

/**
 * Load all products.
 * Source priority: 1) live Google Sheets API (always fresh),
 *                  2) in-memory (if live is unavailable),
 *                  3) static products.json, 4) localStorage cache.
 * @returns {Promise<Array<Object>>}
 */
async function loadProducts() {
  try {
    _allProducts = await _fetchProductsFromGoogleSheets(_getCachedSheetTitle());
    _loadedExportedAt = null;
    _writeProductsCache(_allProducts, null);
    return _allProducts;
  } catch (apiErr) {
    console.warn('[data.js] Google Sheets load failed, using local snapshot:', apiErr);
  }

  if (_allProducts.length > 0) return _allProducts;

  try {
    const payload = await _fetchProductsJson(false);
    _allProducts = _parseProductsFromRows(payload.rows);
    _loadedExportedAt = payload.exportedAt || null;
    _writeProductsCache(_allProducts, _loadedExportedAt);
    return _allProducts;
  } catch (jsonErr) {
    console.warn('[data.js] products.json load failed, using cache:', jsonErr);
  }

  const cached = _readProductsCache();
  if (cached) {
    _allProducts = cached.products;
    _loadedExportedAt = cached.exportedAt || null;
    return _allProducts;
  }

  _allProducts = [];
  return _allProducts;
}

/**
 * Check whether products.json is newer than the currently-loaded snapshot.
 * If so, reload products (memory + cache) and return true.
 * Called in the background so sheet updates reflect without a page reload.
 * @returns {Promise<boolean>}
 */
async function checkForProductUpdates() {
  try {
    const payload = await _fetchProductsJson(true);
    const next = payload.exportedAt || '';
    if (String(next) === String(_loadedExportedAt || '')) return false;
    _allProducts = _parseProductsFromRows(payload.rows);
    _loadedExportedAt = next;
    _writeProductsCache(_allProducts, next);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Force-reload products from products.json, bypassing all caches.
 * @returns {Promise<boolean>}
 */
async function forceReloadProducts() {
  try {
    const payload = await _fetchProductsJson(true);
    _allProducts = _parseProductsFromRows(payload.rows);
    _loadedExportedAt = payload.exportedAt || null;
    _writeProductsCache(_allProducts, _loadedExportedAt);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Check the LIVE Google Sheet for changes.
 * This is what makes sheet edits reflect automatically — no export script needed.
 * If the data changed, updates memory + cache and returns true.
 * @returns {Promise<boolean>}
 */
async function checkForLiveUpdates() {
  try {
    const live = await _fetchProductsFromGoogleSheets(_getCachedSheetTitle());
    if (JSON.stringify(live) === JSON.stringify(_allProducts)) return false;
    _allProducts = live;
    _loadedExportedAt = null;
    _writeProductsCache(_allProducts, null);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Get a single product by ID
 * @param {string} id
 */
function getProductById(id) {
  return _allProducts.find(p => p.id === id) || null;
}

/**
 * Get products by category (case-insensitive)
 * @param {string} category
 */
function getByCategory(category) {
  if (!category || category === 'All') return _allProducts;
  return _allProducts.filter(
    p => p.category.toLowerCase() === category.toLowerCase()
  );
}

/**
 * Get products matching any of the given categories (multi-select)
 * @param {Array<string>} categories
 */
function getByCategories(categories) {
  if (!Array.isArray(categories) || categories.length === 0) return _allProducts;
  const set = categories.map(c => c.toLowerCase());
  return _allProducts.filter(p => set.includes(p.category.toLowerCase()));
}

/**
 * Search products by name or category
 * @param {string} query
 */
function searchProducts(query) {
  if (!query || !query.trim()) return _allProducts;
  const q = query.trim().toLowerCase();
  return _allProducts.filter(
    p =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q))
  );
}

/**
 * Sort products array
 * @param {Array} products
 * @param {'popular'|'price-asc'|'price-desc'} sortBy
 */
function sortProducts(products, sortBy) {
  const arr = [...products];
  switch (sortBy) {
    case 'price-asc':
      return arr.sort((a, b) => a.price - b.price);
    case 'price-desc':
      return arr.sort((a, b) => b.price - a.price);
    case 'popular':
    default:
      return arr.sort((a, b) => b.rating - a.rating);
  }
}

/**
 * Get unique category list from all products
 */
function getCategories() {
  const cats = _allProducts.map(p => p.category);
  return ['All', ...new Set(cats)];
}

/**
 * Get featured/bestseller products
 * @param {number} limit
 */
function getBestsellers(limit = 8) {
  return _allProducts
    .filter(p => p.badge === 'Bestseller' && p.inStock)
    .slice(0, limit);
}

/**
 * Get combo/bundle products
 * @param {number} limit
 */
function getCombos(limit = 8) {
  return _allProducts
    .filter(p => p.badge === 'Combo' && p.inStock)
    .slice(0, limit);
}

/**
 * Get related products (same category, different id)
 * @param {string} productId
 * @param {number} limit
 */
function getRelatedProducts(productId, limit = 6) {
  const product = getProductById(productId);
  if (!product) return [];
  return _allProducts
    .filter(p => p.category === product.category && p.id !== productId)
    .slice(0, limit);
}
