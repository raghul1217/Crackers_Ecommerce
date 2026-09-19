/**
 * generate-image-manifest.js — Lists the real image files under images/
 * so js/data.js can match each product to an existing file by name (no 404s).
 *
 * Run (from project root):   node scripts/generate-image-manifest.js
 * Output: image-manifest.json (fetched once at load time by js/data.js)
 */
const fs = require('fs');
const path = require('path');

const IMAGE_RE = /\.(webp|jpg|jpeg|png|gif|avif)$/i;
const ROOT = path.join(__dirname, '..');
const PRODUCTS_DIR = path.join(ROOT, 'images', 'products');
const GIFTBOX_DIR = path.join(ROOT, 'images', 'giftbox');

function listImages(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => IMAGE_RE.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  } catch (e) {
    return [];
  }
}

const manifest = {
  generatedAt: new Date().toISOString(),
  products: listImages(PRODUCTS_DIR),
  giftbox: listImages(GIFTBOX_DIR),
};

const target = path.join(ROOT, 'image-manifest.json');
fs.writeFileSync(target, JSON.stringify(manifest));
console.log(
  `Wrote ${target}: ${manifest.products.length} product images, ${manifest.giftbox.length} giftbox images`
);