/**
 * One-time migration: Google-Sheets export shape -> clean admin-panel schema.
 * Source: { exportedAt, rows: [{ 'S.No', 'Category', 'Tag', 'Item Name',
 *         'Contents / Packing Details', 'MRP (\u20b9)', 'Discount (%)',
 *         'Final Price (\u20b9)', 'Rating', 'Image' }] }
 * Target: { exportedAt, products: [{ id, name, category, tag, content,
 *         rate, discount, finalRate, image, fallbackImage, rating }] }
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'products.json');

const CATEGORY_CODE = {
  'Single Sound Crackers': 'SSC',
  'Double Sound Crackers': 'DSC',
  'Ground Chakkars': 'GCH',
  'Flower Pots': 'FPT',
  'Rockets': 'RKT',
  'Sky Shots': 'SKY',
  'Fancy Crackers': 'FNC',
  'Garland Crackers': 'GLC',
  'Repeating Fountain': 'RPF',
  'Sparklers': 'SPK',
  'Party Crackers': 'PTY',
  'Deluxe Premium': 'DLX',
  'Gift Boxes': 'GBX',
  'Kids Special': 'KID',
  'Colour Fountain': 'CLF',
  'Waterfall': 'WTF',
  'Shot Guns': 'SHG',
  'Aerial Shots': 'AER',
  'Mine Crackers': 'MIN',
  'Bomb Crackers': 'BMB',
  'Chinese Crackers': 'CHN',
  'Electric Crackers': 'ELE',
  'Tube Crackers': 'TUB',
  'Wheel Crackers': 'WHL',
};

const CATEGORY_FALLBACK_IMAGES = {
  'Single Sound Crackers': 'images/categories/sound-crackers.webp',
  'Double Sound Crackers': 'images/categories/sound-crackers.webp',
  'Ground Chakkars': 'images/categories/ground-chakkars.webp',
  'Flower Pots': 'images/categories/flower-pots.webp',
  'Rockets': 'images/categories/rockets.webp',
  'Sky Shots': 'images/categories/sky-shots.webp',
  'Fancy Crackers': 'images/categories/fancy-crackers.webp',
  'Garland Crackers': 'images/categories/garland-crackers.webp',
  'Repeating Fountain': 'images/categories/repeating-fountains.webp',
  'Sparklers': 'images/categories/sparklers.webp',
  'Party Crackers': 'images/categories/party-crackers.webp',
  'Deluxe Premium': 'images/categories/deluxe-premium.webp',
  'Gift Boxes': 'images/categories/gift-boxes.webp',
  'Kids Special': 'images/categories/kids-special.webp',
};

const TAG_RATING = {
  bestseller: 4.8, premium: 4.7, new: 4.5, eco: 4.4,
  value: 4.3, combo: 4.6, hot: 4.7,
};

const parseMoney = (v) => {
  if (v == null) return NaN;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));

if (Array.isArray(raw.products)) {
    console.log('products.json is already in the clean schema — nothing to do.');
    console.log(`${raw.products.length} products present.`);
    process.exit(0);
}

const rows = Array.isArray(raw.rows) ? raw.rows : [];
const manifest = fs.existsSync(path.join(ROOT, 'image-manifest.json'))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, 'image-manifest.json'), 'utf8'))
  : { products: [], giftbox: [] };

function resolveImage(row, name, category) {
  const fallbackImage = CATEGORY_FALLBACK_IMAGES[category] || 'images/placeholder.webp';
  const explicit = String(row['Image'] || '').trim();
  if (explicit) {
    if (/^https?:\/\//i.test(explicit)) return { image: explicit, fallbackImage };
    return {
      image: explicit.startsWith('images/') ? explicit : `images/${explicit}`,
      fallbackImage,
    };
  }
  const bag = category === 'Gift Boxes' ? manifest.giftbox : manifest.products;
  const flat = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const n = flat(name);
  let best = null;
  for (const f of bag || []) {
    const ff = flat(f.replace(/\.[a-z0-9]+$/i, ''));
    if (ff && n.includes(ff) && (!best || ff.length > best.len)) best = { f, len: ff.length };
  }
  const dir = category === 'Gift Boxes' ? 'images/giftbox/' : 'images/products/';
  return { image: best ? dir + best.f : fallbackImage, fallbackImage };
}

const products = [];
let skipped = 0;
for (const row of rows) {
  const name = row['Item Name'];
  const category = row['Category'];
  const sno = row['S.No'];
  if (!name || !category || sno == null) { skipped++; continue; }

  const rate = parseMoney(row['MRP (\u20b9)']);
  const finalRate = parseMoney(row['Final Price (\u20b9)']);
  if (!Number.isFinite(rate) || !Number.isFinite(finalRate)) { skipped++; continue; }

  const tag = String(row['Tag'] || '').trim();
  const sheetRating = parseFloat(row['Rating']);
  const { image, fallbackImage } = resolveImage(row, name, category);
  const factor = rate > 0 ? round2(Math.min(1, finalRate / rate)) : 1;

  products.push({
    id: `${CATEGORY_CODE[category] || 'PRD'}${String(sno).padStart(3, '0')}`,
    name: String(name).trim(),
    category: String(category).trim(),
    tag: tag || null,
    content: String(row['Contents / Packing Details'] || '').trim() || '1 box',
    rate: round2(rate),
    discount: factor,
    finalRate: round2(finalRate),
    image,
    fallbackImage,
    rating: Number.isFinite(sheetRating) ? round2(sheetRating) : (TAG_RATING[tag] || 4.2),
    inStock: true,
  });
}

const out = {
  exportedAt: new Date().toISOString(),
  count: products.length,
  products,
};
fs.writeFileSync(SRC, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`migrated ${products.length} products (skipped ${skipped}) -> products.json`);
const cats = [...new Set(products.map(p => p.category))];
console.log(`categories (${cats.length}):`, cats.join(', '));
const ids = products.map(p => p.id);
console.log('unique ids:', new Set(ids).size === ids.length ? 'yes' : 'NO — DUPLICATES');
