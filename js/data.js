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
      image: `images/${base}-${((idx - 1) % count) + 1}.jpg`,
      description: `${contents || 'Premium quality product'}. A best-value pick from our ${category} collection, priced for the festive season.`,
      unit: contents || '1 box',
      rating: TAG_RATING[tag] || 4.2,
      inStock: true,
      badge: TAG_BADGE[tag] || null,
    });
  }

  return products;
}

const GOOGLE_SHEET_ID = '1fVKmBQNx9BLI0uTuXf1-26uWdkt8AP4yMaGzn7tfns4';
const GOOGLE_API_KEY = 'AIzaSyDNsaBBMlV-d-8vYgMiEpW7JneE1bxRtSE';

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

/**
 * Fetch products from the Google Sheet via the Sheets API v4
 * @returns {Promise<Array<Object>>}
 */
async function _fetchProductsFromGoogleSheets() {
  if (GOOGLE_API_KEY === 'PASTE_YOUR_API_KEY_HERE') {
    throw new Error('Google Sheets API key not set. Edit GOOGLE_API_KEY in js/data.js');
  }

  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}?key=${GOOGLE_API_KEY}`
  );
  if (!metaRes.ok) throw new Error('Sheets API metadata: HTTP ' + metaRes.status);
  const meta = await metaRes.json();

  const title = meta.sheets && meta.sheets[0] && meta.sheets[0].properties
    ? meta.sheets[0].properties.title
    : 'Sheet1';

  const valuesRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/${encodeURIComponent(title)}?key=${GOOGLE_API_KEY}`
  );
  if (!valuesRes.ok) throw new Error('Sheets API values: HTTP ' + valuesRes.status);
  const data = await valuesRes.json();

  return _parseProductsFromRows(_rowsToObjects(data.values));
}

/**
 * Load all products from the Google Sheet
 * Returns array of product objects (cached after first load)
 */
async function loadProducts() {
  if (_allProducts.length > 0) return _allProducts;

  try {
    _allProducts = await _fetchProductsFromGoogleSheets();
    return _allProducts;
  } catch (err) {
    console.error('[data.js] Error loading products:', err);
    return [];
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
