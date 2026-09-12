/**
 * Generate sitemap.xml from products.json
 * Mirrors the product-id scheme in js/data.js:
 *   id = CATEGORY_CODE[category] + String(S.No).padStart(3, '0')
 *
 * Run: node scripts/generate-sitemap.js   (also runs automatically via update-data.cmd)
 */
const fs = require('fs');
const path = require('path');

const SITE = 'https://sivakasi666crackers.com';

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

function parseMoney(value) {
  if (typeof value === 'number') return value;
  const n = Number(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
  return n;
}

const STATIC_PAGES = [
  { loc: `${SITE}/`, priority: '1.0', changefreq: 'weekly' },
  { loc: `${SITE}/shop`, priority: '0.9', changefreq: 'weekly' },
  { loc: `${SITE}/giftbox`, priority: '0.8', changefreq: 'weekly' },
  { loc: `${SITE}/about`, priority: '0.6', changefreq: 'monthly' },
];

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function main() {
  const root = path.join(__dirname, '..');
  const productsPath = path.join(root, 'products.json');

  let lastmod = new Date().toISOString().slice(0, 10);

  if (fs.existsSync(productsPath)) {
    const raw = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
    if (raw.exportedAt) {
      lastmod = new Date(raw.exportedAt).toISOString().slice(0, 10);
    }
    console.log('products.json found â€” generating static pages only');
  } else {
    console.log('products.json not found â€” generating static pages only');
  }

  const urls = STATIC_PAGES.map((p) => ({ ...p, lastmod }));

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (u) =>
        `  <url>\n    <loc>${xmlEscape(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    ),
    '</urlset>',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(root, 'sitemap.xml'), xml);
  console.log(`sitemap.xml written: ${urls.length} URLs (lastmod ${lastmod})`);
}

main();
