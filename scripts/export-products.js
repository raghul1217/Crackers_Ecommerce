/**
 * export-products.js — Regenerates products.json from the Google Sheet.
 *
 * Run (from project root):   node scripts/export-products.js
 * Then deploy products.json alongside the site.
 *
 * products.json contains the RAW sheet rows ({ exportedAt, rows: [...] }),
 * with an "Image" path resolved per row. If the sheet already has an Image
 * column it wins; otherwise the row is matched against the real files listed
 * in image-manifest.json (run generate-image-manifest.js first).
 *
 * The same parsing used by the live API path (js/data.js) is applied at load,
 * so there is only one source of parsing logic.
 */
const fs = require('fs');
const path = require('path');

// Keep in sync with js/data.js
const GOOGLE_SHEET_ID = '1fVKmBQNx9BLI0uTuXf1-26uWdkt8AP4yMaGzn7tfns4';
const GOOGLE_API_KEY = 'AIzaSyDNsaBBMlV-d-8vYgMiEpW7JneE1bxRtSE';

const MANIFEST_PATH = path.join(__dirname, '..', 'image-manifest.json');

// Keep in sync with js/data.js — category art used when no name match exists
const CATEGORY_IMAGES = {
  'Gift Boxes': 'images/categories/gift-boxes.webp',
  'Sky Shots': 'images/categories/sky-shots.webp',
  'Sparklers': 'images/categories/sparklers.webp',
  'Ground Chakkars': 'images/categories/ground-chakkars.webp',
  'Flower Pots': 'images/categories/flower-pots.webp',
  'Rockets': 'images/categories/rockets.webp',
  'Sound Crackers': 'images/categories/sound-crackers.webp',
  'Fancy Crackers': 'images/categories/fancy-crackers.webp',
  'Party Crackers': 'images/categories/party-crackers.webp',
  'Kids Special': 'images/categories/kids-special.webp',
  'Garland Crackers': 'images/categories/garland-crackers.webp',
  'Repeating Fountains': 'images/categories/repeating-fountains.webp',
  'Deluxe Premium': 'images/categories/deluxe-premium.webp',
  'Single Sound Crackers': 'images/categories/sound-crackers.webp',
  'Bombs': 'images/categories/sound-crackers.webp',
  'Bijili': 'images/categories/sparklers.webp',
  'Color Matches': 'images/categories/sparklers.webp',
  'Chakkaram - Spinners': 'images/categories/ground-chakkars.webp',
  'Mini Fountains': 'images/categories/repeating-fountains.webp',
  'Mega Fountains': 'images/categories/repeating-fountains.webp',
  'Special Fountains': 'images/categories/repeating-fountains.webp',
  'Fountain with Bomb': 'images/categories/repeating-fountains.webp',
  'Fancy Novelties': 'images/categories/fancy-crackers.webp',
  'Ariel Shots Continuous Functions': 'images/categories/sky-shots.webp',
  'Rider Shots': 'images/categories/sky-shots.webp',
  'Musical Shots': 'images/categories/sky-shots.webp',
  'Special Function Shots': 'images/categories/sky-shots.webp',
  '2026 Special': 'images/categories/deluxe-premium.webp',
  'Festival Crackers': 'images/categories/deluxe-premium.webp',
};

function _norm(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function _tokenize(value) {
  return String(value).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function _stripExt(file) {
  return String(file).replace(/(?:\.[a-z0-9]+)+$/i, '');
}

function _matchGiftBoxImage(name, files) {
  const nameSlug = _norm(name);
  let best = null;
  for (const file of files || []) {
    if (!file.toLowerCase().endsWith('.webp')) continue;
    const fileSlug = _norm(_stripExt(file));
    if (nameSlug.includes(fileSlug) && (!best || fileSlug.length > best.len)) {
      best = { file, len: fileSlug.length };
    }
  }
  return best ? `images/giftbox/${best.file}` : null;
}

function _wordStem(token) {
  return token.replace(/\d+$/, '');
}

function _matchProductImage(name, files) {
  const itemTokens = _tokenize(name);
  if (!itemTokens.length) return null;
  const itemNorm = itemTokens.join('');
  const itemSet = new Set(itemTokens);
  let best = null;

  for (const file of files || []) {
    const base = _stripExt(file);
    const baseNorm = _norm(base);
    const baseTokens = _tokenize(base);

    if (baseTokens.length === 1) {
      const t = baseTokens[0];
      const stem = _wordStem(t);
      if (itemSet.has(t) || itemSet.has(stem)) {
        const s = baseNorm === itemNorm ? 1 : 0.9;
        if (!best || s > best.score) best = { file, score: s, tokens: 1 };
      }
      continue;
    }

    let overlap = 0;
    for (const bt of baseTokens) {
      const stem = _wordStem(bt);
      if (itemSet.has(bt) || itemSet.has(stem)) overlap++;
    }
    if (overlap < 2) continue;

    const exact = baseNorm === itemNorm || baseNorm.includes(itemNorm);
    const score = exact ? 1 : overlap / Math.max(baseTokens.length, itemTokens.length);
    if (!best || score > best.score || (score === best.score && baseTokens.length > best.tokens)) {
      best = { file, score, tokens: baseTokens.length };
    }
  }

  return best && best.score >= 0.6 ? `images/products/${best.file}` : null;
}

async function main() {
  if (GOOGLE_API_KEY === 'PASTE_YOUR_API_KEY_HERE') {
    throw new Error('Google Sheets API key not set');
  }

  let manifest = { products: [], giftbox: [] };
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (e) {
    console.warn('[export-products.js] image-manifest.json missing — products.json will carry no Image paths.');
  }

  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}?key=${GOOGLE_API_KEY}`
  );
  if (!metaRes.ok) throw new Error('Metadata HTTP ' + metaRes.status);
  const meta = await metaRes.json();
  const title = meta.sheets && meta.sheets[0] && meta.sheets[0].properties
    ? meta.sheets[0].properties.title
    : 'Sheet1';

  const valuesRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/${encodeURIComponent(title)}?key=${GOOGLE_API_KEY}`
  );
  if (!valuesRes.ok) throw new Error('Values HTTP ' + valuesRes.status);
  const data = await valuesRes.json();

  const rows = data.values || [];
  if (rows.length < 2) throw new Error('Sheet looks empty');
  const headers = rows[0].map(h => String(h == null ? '' : h));
  const objects = rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i] != null ? r[i] : null; });
    return obj;
  });

  for (const row of objects) {
    const name = row['Item Name'] || '';
    const category = row['Category'] || '';

    const explicitImg = row['Image'] || row['image'] || row['Image URL'];
    if (explicitImg && String(explicitImg).trim()) continue;

    const fallbackImage = CATEGORY_IMAGES[category] || 'images/placeholder.webp';
    let image = fallbackImage;

    if (category === 'Gift Boxes') {
      const m = _matchGiftBoxImage(name, manifest.giftbox);
      if (m) image = m;
    } else {
      const m = _matchProductImage(name, manifest.products);
      if (m) image = m;
    }

    row['Image'] = image;
  }

  const out = { exportedAt: new Date().toISOString(), rows: objects };
  const target = path.join(__dirname, '..', 'products.json');
  fs.writeFileSync(target, JSON.stringify(out));
  console.log(`Wrote ${target}: ${objects.length} rows, ${(fs.statSync(target).size / 1024).toFixed(1)} KB`);
}

main().catch(err => {
  console.error('[export-products.js]', err.message);
  process.exit(1);
});
