/**
 * data.js — Product data loading and querying
 *
 * Single source of truth: products.json (the repo file the admin panel writes
 * through the GitHub Contents API). No Google Sheets, no API key.
 *
 * products.json shape:
 *   { exportedAt, count, products: [{ id, name, category, tag, content,
 *     rate, discount, finalRate, image, fallbackImage, rating, inStock }] }
 *
 *   `rate`      MRP / list price
 *   `discount`  FACTOR, not a percent (0.8 = customer pays 80% of MRP)
 *   `finalRate` selling price = rate * discount
 *
 * Those are mapped to the runtime shape the renderers expect (price, mrp,
 * discountPercent, unit, badge, …) in _toProduct().
 */

let _allProducts = [];

/* ── Static lookup tables ─────────────────────────────── */

/** Category → artwork in images/categories/, used as the image fallback. */
const CATEGORY_FALLBACK_IMAGES = {
  'Gift Boxes':          'images/categories/gift-boxes.webp',
  'Sky Shots':           'images/categories/sky-shots.webp',
  'Sparklers':           'images/categories/sparklers.webp',
  'Ground Chakkars':     'images/categories/ground-chakkars.webp',
  'Flower Pots':         'images/categories/flower-pots.webp',
  'Rockets':             'images/categories/rockets.webp',
  'Sound Crackers':      'images/categories/sound-crackers.webp',
  'Fancy Crackers':      'images/categories/fancy-crackers.webp',
  'Party Crackers':      'images/categories/party-crackers.webp',
  'Kids Special':        'images/categories/kids-special.webp',
  'Garland Crackers':    'images/categories/garland-crackers.webp',
  'Repeating Fountains': 'images/categories/repeating-fountains.webp',
  'Deluxe Premium':      'images/categories/deluxe-premium.webp',
  'Single Sound Crackers': 'images/categories/sound-crackers.webp',
  'Bombs':               'images/categories/sound-crackers.webp',
  'Bijili':              'images/categories/sparklers.webp',
  'Color Matches':       'images/categories/sparklers.webp',
  'Chakkaram - Spinners':'images/categories/ground-chakkars.webp',
  'Mini Fountains':      'images/categories/repeating-fountains.webp',
  'Mega Fountains':      'images/categories/repeating-fountains.webp',
  'Special Fountains':   'images/categories/repeating-fountains.webp',
  'Fountain with Bomb':  'images/categories/repeating-fountains.webp',
  'Fancy Novelties':     'images/categories/fancy-crackers.webp',
  'Ariel Shots Continuous Functions': 'images/categories/sky-shots.webp',
  'Rider Shots':         'images/categories/sky-shots.webp',
  'Musical Shots':       'images/categories/sky-shots.webp',
  'Special Function Shots': 'images/categories/sky-shots.webp',
  '2026 Special':        'images/categories/deluxe-premium.webp',
  'Festival Crackers':   'images/categories/deluxe-premium.webp',
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

const PLACEHOLDER_IMAGE = 'images/placeholder.webp';

const PRODUCTS_JSON_URL = 'products.json';
const PRODUCTS_CACHE_KEY = 's66_products_cache';
const PRODUCTS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

let _loadedExportedAt = null;

function _round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function _num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
}

/* ── LocalStorage cache ───────────────────────────────── */

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

/* ── Schema mapping ───────────────────────────────────── */

/**
 * Map a stored product record to the runtime shape the renderers consume.
 * @param {Object} p
 * @returns {Object|null}
 */
function _toProduct(p) {
  if (!p || !p.name || !p.category || p.id == null) return null;

  const rate = _round2(_num(p.rate, 0));
  const finalRate = _round2(_num(p.finalRate, 0));
  if (rate <= 0) return null;

  // `discount` is stored as a factor; derive the percentage for display.
  const discountPercent = p.discount != null
    ? Math.round((1 - _num(p.discount, 1)) * 100)
    : (rate > 0 ? Math.round((1 - finalRate / rate) * 100) : 0);

  const content = String(p.content || '1 box');
  const category = String(p.category);

  return {
    id: String(p.id),
    name: String(p.name),
    category,
    price: finalRate > 0 ? finalRate : rate,
    mrp: rate,
    discountPercent: Math.min(100, Math.max(0, discountPercent)),
    image: p.image || CATEGORY_FALLBACK_IMAGES[category] || PLACEHOLDER_IMAGE,
    fallbackImage: p.fallbackImage || CATEGORY_FALLBACK_IMAGES[category] || PLACEHOLDER_IMAGE,
    description: `${content}. A best-value pick from our ${category} collection, priced for the festive season.`,
    unit: content,
    rating: _round2(_num(p.rating, 4.2)),
    inStock: p.inStock === undefined ? true : !!p.inStock,
    badge: p.badge || TAG_BADGE[p.tag] || null,
  };
}

/**
 * Fetch the static products.json snapshot.
 * @param {boolean} cacheBust — append a timestamp to bypass HTTP caching
 * @returns {Promise<{exportedAt: string, products: Array<Object>}>}
 */
async function _fetchProductsJson(cacheBust) {
  const url = cacheBust ? `${PRODUCTS_JSON_URL}?t=${Date.now()}` : PRODUCTS_JSON_URL;
  const res = await fetch(url, { cache: cacheBust ? 'reload' : 'default' });
  if (!res.ok) throw new Error(`products.json HTTP ${res.status}`);
  const payload = await res.json();
  if (!payload || !Array.isArray(payload.products)) throw new Error('products.json missing products');
  return payload;
}

function _hydrate(payload) {
  const list = [];
  const seen = new Set();
  for (const raw of payload.products) {
    const p = _toProduct(raw);
    if (!p) continue;
    if (seen.has(p.id)) p.id = p.id + '-' + list.length; // guard against id clashes
    seen.add(p.id);
    list.push(p);
  }
  _allProducts = list;
  _loadedExportedAt = payload.exportedAt || null;
  _writeProductsCache(list, _loadedExportedAt);
  return list;
}

/* ── Loaders ──────────────────────────────────────────── */

/**
 * Load all products.
 * Priority: 1) static products.json, 2) in-memory, 3) localStorage cache.
 * @returns {Promise<Array<Object>>}
 */
async function loadProducts() {
  try {
    return _hydrate(await _fetchProductsJson(false));
  } catch (err) {
    console.warn('[data.js] products.json load failed:', err);
  }

  if (_allProducts.length > 0) return _allProducts;

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
 * Reload products.json, bypassing HTTP caching, if it changed since the last load.
 * @returns {Promise<boolean>} true when the catalogue was replaced
 */
async function checkForProductUpdates() {
  try {
    const payload = await _fetchProductsJson(true);
    if (String(payload.exportedAt || '') === String(_loadedExportedAt || '')) return false;
    _hydrate(payload);
    return true;
  } catch (e) {
    return false;
  }
}

/** Reload products.json regardless of whether it looks changed. */
async function forceReloadProducts() {
  try {
    _hydrate(await _fetchProductsJson(true));
    return true;
  } catch (e) {
    return false;
  }
}

/** Kept for js/main.js — products.json is now the only live source. */
async function checkForLiveUpdates() {
  return checkForProductUpdates();
}

/* ── Query helpers ────────────────────────────────────── */

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
 * Get unique category list from all products (alphabetical, "All" first)
 */
function getCategories() {
  const cats = _allProducts.map(p => p.category);
  return ['All', ...new Set(cats)].sort((a, b) => {
    if (a === 'All') return -1;
    if (b === 'All') return 1;
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });
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
