/**
 * export-products.js — Regenerates products.json from the Google Sheet.
 *
 * Run (from project root):   node scripts/export-products.js
 * Then deploy products.json alongside the site.
 *
 * products.json contains the RAW sheet rows ({ exportedAt, rows: [...] }).
 * The same parsing used by the live API path (js/data.js) is applied at load,
 * so there is only one source of parsing logic.
 */
const fs = require('fs');
const path = require('path');

// Keep in sync with js/data.js
const GOOGLE_SHEET_ID = '1fVKmBQNx9BLI0uTuXf1-26uWdkt8AP4yMaGzn7tfns4';
const GOOGLE_API_KEY = 'AIzaSyDNsaBBMlV-d-8vYgMiEpW7JneE1bxRtSE';

async function main() {
  if (GOOGLE_API_KEY === 'PASTE_YOUR_API_KEY_HERE') {
    throw new Error('Google Sheets API key not set');
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

  const out = { exportedAt: new Date().toISOString(), rows: objects };
  const target = path.join(__dirname, '..', 'products.json');
  fs.writeFileSync(target, JSON.stringify(out));
  console.log(`Wrote ${target}: ${objects.length} rows, ${(fs.statSync(target).size / 1024).toFixed(1)} KB`);
}

main().catch(err => {
  console.error('[export-products.js]', err.message);
  process.exit(1);
});
