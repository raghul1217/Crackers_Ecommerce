/**
 * data.js — Product data loading and querying
 * Reads products directly from data/crackers_list.xlsx (via SheetJS)
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
 * Parse the xlsx workbook buffer into product objects
 * @param {ArrayBuffer} buffer
 * @returns {Array<Object>}
 */
function _parseProductsFromXlsx(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

  const perCat = {};
  const products = [];

  for (const row of rows) {
    const name = row['Item Name'];
    const category = row['Category'];
    const sno = row['S.No'];

    if (!name || !category || sno == null) continue;

    const mrp = Number(row['MRP (₹)']);
    const price = Number(row['Final Price (₹)']);
    if (!isFinite(mrp) || !isFinite(price)) continue;

    const tag = row['Tag'];
    const contents = String(row['Contents / Packing Details'] || '');
    const discountPercent = Math.round((Number(row['Discount (%)']) || 0) * 100);

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

/**
 * Load all products from data/crackers_list.xlsx
 * Returns array of product objects (cached after first load)
 */
async function loadProducts() {
  if (_allProducts.length > 0) return _allProducts;

  try {
    if (typeof XLSX === 'undefined') throw new Error('SheetJS (XLSX) library not loaded');
    const res = await fetch('data/crackers_list.xlsx');
    if (!res.ok) throw new Error('Failed to load data/crackers_list.xlsx');
    const buffer = await res.arrayBuffer();
    _allProducts = _parseProductsFromXlsx(buffer);
    return _allProducts;
  } catch (err) {
    console.error('[data.js] Error loading xlsx:', err);
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
