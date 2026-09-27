# Admin Panel — Architecture & Implementation Plan

Complete reference for the `admin.html` panel of **Twins & Nanban Crackers** (Vercel + vanilla JS + GitHub-as-database).

Read this top-to-bottom to rebuild the same system on another site. Sections 1–10 explain *how the current code works*; sections 11–14 are the *actionable plan* for a new site.

---

## Table of contents

1. [The big idea](#1-the-big-idea)
2. [File tree](#2-file-tree)
3. [Data models](#3-data-models)
4. [Auth design (stateless HMAC cookie)](#4-auth-design-stateless-hmac-cookie)
5. [API reference](#5-api-reference)
6. [GitHub-as-database layer](#6-github-as-database-layer)
7. [admin.html anatomy](#7-adminhtml-anatomy)
8. [Pricing math](#8-pricing-math)
9. [Invoice PDF generation](#9-invoice-pdf-generation)
10. [Responsive strategy](#10-responsive-strategy)
11. [Implementation plan for a new site](#11-implementation-plan-for-a-new-site)
12. [Env vars &amp; Vercel deployment](#12-env-vars--vercel-deployment)
13. [Find &amp; replace checklist when cloning to another site](#13-find--replace-checklist-when-cloning-to-another-site)
14. [Testing checklist](#14-testing-checklist)
15. [Known weaknesses &amp; how to improve them](#15-known-weaknesses--how-to-improve-them)

---

## 1. The big idea

There is **no database**. The Git repository *is* the database.

- Product catalogue and customer orders are stored as JSON files committed to the repo
  (`assets/products.json`, `assets/orders.json`).
- Vercel serverless functions in `api/` read/write those files through the **GitHub Contents API**.
- `admin.html` is a plain static HTML file (no framework, no build step) that talks to those functions.
- Login is a **signed, HTTP-only cookie** — no session store, no JWT library, zero npm dependencies.

```
┌──────────────────────┐
│  Browser (visitor)   │──GET  /assets/products.json (static, CDN-cached)──▶ products.json in git
│  products.html/cart  │──POST /api/orders  (PUBLIC, no auth)──────────────▶ api/orders.js
└──────────────────────┘                                                         │
                                                                                 ▼
┌──────────────────────┐   POST /api/login  (credentials in env)      ┌──────────────────────┐
│  Browser (admin)     │────────────────────────────────────────────▶│  api/login.js         │
│  admin.html          │◀─── Set-Cookie: tn_admin_session (HMAC) ─────│  api/_auth.js         │
│                      │   GET  /api/me  (is my cookie still valid?)  └──────────────────────┘
│  no token in JS      │   POST/PATCH/DELETE /api/products            ┌──────────────────────┐
│  cookie is HttpOnly  │   GET/PATCH/DELETE    /api/orders            │  api/products.js      │
└──────────────────────┘                                             │  api/orders.js        │
                                                                      └──────────┬───────────┘
                                                                                 │
                                                        GitHub Contents API (GET sha + base64 content)
                                                        GitHub Contents API (PUT base64 content + sha)
                                                                                 ▼
                                                                       git repo → Vercel auto-redeploy
                                                                                 │
                                                                       static files served again
```

**Why this design works for a small business site:** zero cost, zero DB maintenance, every change is
a git commit with a meaningful message (`Order ORD-0002 status pending -> confirmed (admin)`) so the
whole history of the shop is auditable, and the static front-end picks up new data on the next deploy.

**When to abandon it:** more than a few writes per minute, or when you need relational queries,
full-text search, per-user accounts, or instant rollback without a redeploy.

---

## 2. File tree

```
twins_nanban_crackers/
├── admin.html                  ← the whole admin panel (HTML + <style> + <script>, ~1640 lines)
├── vercel.json                 ← { "version": 2, "cleanUrls": true, "trailingSlash": false }
├── assets/
│   ├── products.json           ← THE product catalogue (git = database)
│   ├── orders.json             ← THE order log (git = database)
│   ├── twins_nanban_logo.png   ← used by login card + invoice watermark
│   └── products/<file>.jpg     ← product images; products.json stores only the FILENAME
├── js/main.js                  ← storefront: fetches products.json, cart, checkout → POST /api/orders
├── css/styles.css, css/responsive.css
├── footer.html                 ← contains the "Admin Panel" link (footer.html:17)
└── api/                        ← Vercel Node serverless functions (CommonJS, zero deps)
    ├── _auth.js                ← shared HMAC session helpers (underscore = not a route)
    ├── login.js                ← POST /api/login
    ├── logout.js               ← POST /api/logout
    ├── me.js                   ← GET  /api/me
    ├── products.js             ← GET/POST/DELETE /api/products
    └── orders.js               ← GET/POST/PATCH/DELETE /api/orders
```

Notes:

- There is **no `package.json`** and **no `node_modules`**. Everything uses Node built-ins
  (`crypto`) and global `fetch` (Node 18+), which Vercel provides by default.
- Files starting with `_` in `api/` are ignored as routes by Vercel — that's why `_auth.js` is a
  helper and not an endpoint.
- No framework, no bundler, no CSS preprocessor. `admin.html` is intentionally self-contained so it
  can be dropped into any static site as-is.

---

## 3. Data models

### 3.1 `assets/products.json`

```json
{
  "products": [
    {
      "id": 1,
      "name": "2.75' Kuruvi",
      "category": "One Sound Crackers",
      "content": "1 Pkt",
      "rate": 80,
      "discount": 0.9,
      "finalRate": 8,
      "image": "Kuruvi.jpg"
    },
    { "id": 5, "name": "4' Gold Lakshmi", "category": "One Sound Crackers",
      "content": "1 Pkt", "rate": 340, "discount": 0.9, "finalRate": 34, "image": null }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `id` | number | Auto-increment, `max(id) + 1` on insert, never reused |
| `name` | string | Display name. Uniqueness is enforced case-insensitively on create |
| `category` | string | Free text. The admin's category dropdown is **derived** from the data, never a hard-coded list |
| `content` | string | Pack size, e.g. `1 Pkt`, `Box(2pcs)`, `1 Case`. Defaults to `"1 Pkt"` when blank |
| `rate` | number | MRP / list price (₹) |
| `discount` | number | ⚠️ **A factor, not a percentage.** `0.9` means the customer pays 90% of MRP (i.e. 10% off). `0.1` means 90% off. `0` means no discount |
| `finalRate` | number | Selling price = `rate × discount`, rounded to 2 dp |
| `image` | string \| null | Bare **filename** only. The storefront builds the path as `assets/products/<filename>` |

> **Naming trap — read this before you touch the code.** The field named `discount` holds a
> *multiplier*, while the *form input* the admin types into is a *percentage off*. So
> `discount: 0.9` in JSON ⇄ "10" in the Discount box. The conversion happens in
> `api/products.js:validateProduct()` and its inverse in `admin.html:renderTable()`.

### 3.2 `assets/orders.json`

```json
{
  "orders": [
    {
      "id": "ORD-0001",
      "customerName": "gs",
      "mobile": "8754919201",
      "items": [
        { "name": "1K Chilly", "content": "1 Box", "qty": 2,
          "rate": 2200, "finalRate": 220, "lineTotal": 440 }
      ],
      "total": 4700,
      "savings": 42300,
      "status": "delivered",
      "createdAt": "2026-09-14T15:27:52.183Z"
    }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `id` | string | `PREFIX-0001`, zero-padded to 4 digits. Prefix `ORD` = Twins & Nanban Crackers. `max(digits) + 1` |
| `customerName` | string | Required |
| `mobile` | string | Required, validated `/^[6-9]\d{9}$/` (10 digits, Indian mobile, starts 6–9) |
| `items[]` | array | `name`, `content` (nullable), `qty > 0`, `rate` (MRP), `finalRate` (unit sell price), `lineTotal = finalRate × qty` |
| `total` | number | Σ `lineTotal`, normalised to 2 dp |
| `savings` | number | `max(0, Σ(rate × qty) − total)` — marketing number for the WhatsApp message |
| `status` | enum | `pending` \| `confirmed` \| `delivered`. Always created as `pending` |
| `createdAt` | ISO string | Server-generated `new Date().toISOString()` — never trusted from the client |

Order items are a **denormalised snapshot** of name/content/price at purchase time. Editing a product
later never rewrites historical orders — this is deliberate and important for invoices.

---

## 4. Auth design (stateless HMAC cookie)

`api/_auth.js` — 95 lines, no dependencies, no session store.

### 4.1 Token format

```
token  = base64url( {"u":"<username>","exp":<epoch ms>} )  +  "."  +  base64url( HMAC-SHA256(payload, AUTH_SECRET) )
```

- `base64url` = `+`→`-`, `/`→`_`, strip `=` padding, so the token is cookie-safe.
- Signature comparison uses `crypto.timingSafeEqual` with an explicit length pre-check, so there is
  no timing leak and no throw on mismatched lengths.
- `exp = Date.now() + SESSION_TTL_MS` where `SESSION_TTL_MS = 8 * 60 * 60 * 1000` (8 hours).

### 4.2 Exported helpers

| Function | Purpose |
|---|---|
| `getAuthUser(req)` | Parse cookie → verify → return `username` or `null`. **The single gate used by every protected route.** |
| `setSessionCookie(res, username)` | Mints a token and sets the `Set-Cookie` header |
| `clearSessionCookie(res)` | Sets the same cookie name with `Max-Age=0` |
| `createToken` / `verifyToken` | Exposed for reuse/testing |
| `SESSION_COOKIE` | Cookie name, currently `tn_admin_session` |

### 4.3 The cookie

```
tn_admin_session=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800
```

- `HttpOnly` → JavaScript can never read the token, so XSS cannot exfiltrate the session.
- `SameSite=Lax` → blocks cross-site POST CSRF on state-changing routes.
- `Max-Age` mirrors the 8 h TTL, so the browser drops it at the same time the server would.

> `Secure` is intentionally **omitted** so the panel works over plain `http://localhost` during
> development. For a production-only deployment, add `; Secure` and serve only over HTTPS.

### 4.4 Credential check (`api/login.js`)

```js
const safeEqual = (a, b) => {
    const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
};
```

- Credentials come from env vars `ADMIN_USERNAME` / `ADMIN_PASSWORD` — **never from the repo**.
- Both fields are compared with a constant-time compare, and the error message
  (`"Invalid username or password"`) never reveals which field was wrong.
- If the env vars are missing the route returns `500 Admin credentials not configured` — a loud,
  obvious failure instead of a silent lockout.
- Method guard: anything other than `POST` → `405` + `Allow: POST`.

### 4.5 Client-side flow (`admin.html`)

```
init()
  └─ GET /api/me  ──► { authenticated: true }  → showDashboard()
                   └─ { authenticated: false} / throw → showLogin()

handleLogin()  ──► POST /api/login {username, password}
                   ok  → showDashboard()  (cookie is set by the server, JS never touches it)
                   401 → show .login-error, clear the password field

logout()       ──► POST /api/logout → showLogin() + toast("Logged out", "warn")
```

The 401 handling lives centrally in the `api()` fetch wrapper:

```js
if (res.status === 401) { showLogin(); throw new Error('Session expired or unauthorized'); }
```

so an expired session drops you back to the login screen from *any* failed request, not just on load.

### 4.6 Dev bypass

```js
const ADMIN_MODE = 'prod';   // or 'dev'
// override with ?mode=dev / ?mode=prod in the URL
```

In `dev` mode the client skips the login screen and renders the dashboard immediately. The server
still enforces auth on every write, so this is a **UI convenience for styling work, not a security
hole** for writes — but see §15 for the GET leak.

---

## 5. API reference

All responses are JSON. All protected routes answer `401 { "error": "Unauthorized" }` without a valid
cookie. All functions live in `api/*.js` and default-export `async (req, res) => {}` (Vercel style).

### 5.1 `POST /api/login` — `api/login.js`

| | |
|---|---|
| Auth | none |
| Body | `{ "username": "string", "password": "string" }` |
| `200` | `{ "ok": true }` + `Set-Cookie: tn_admin_session=…` |
| `401` | `{ "error": "Invalid username or password" }` |
| `405` | non-POST |
| `500` | `{ "error": "Admin credentials not configured" }` |

### 5.2 `POST /api/logout` — `api/logout.js`

| | |
|---|---|
| Auth | none (idempotent) |
| `200` | `{ "ok": true }` + cookie cleared (`Max-Age=0`) |
| `405` | non-POST |

### 5.3 `GET /api/me` — `api/me.js`

| | |
|---|---|
| Auth | cookie (optional — this is the check) |
| `200` | `{ "authenticated": true, "username": "admin" }` |
| `401` | `{ "authenticated": false }` |

### 5.4 `/api/products` — `api/products.js`

| Method | Auth | Request | Success | Errors |
|---|---|---|---|---|
| `GET` | ⚠️ **none** | — | `200 { products: [...] }` | `500` on read failure |
| `POST` | ✅ | `{ id?, name, category, content?, rate, discountPct?, finalRate?, image? }` | `200 { ok:true, products:[…] }` | `400`/`500` validation, `401`, `404` unknown id, `409` duplicate name, `409` CONFLICT |
| `DELETE` | ✅ | `?id=123` | `200 { ok:true, products:[…] }` | `400` missing id, `401`, `404`, `409` CONFLICT |

- `POST` with an `id` → **update in place**; without → **append** with `id = max(id)+1`.
- Duplicate check on create: `p.name.toLowerCase() === name.toLowerCase()` → `409`.
- `content` blanks default to `"1 Pkt"`; blank `image` is stored as `null`.
- Response returns the **full new array**, so the client can render without a second round-trip.
  (`admin.html` still calls `loadProducts()` to keep one single render path — simpler than
  trusting the response.)

### 5.5 `/api/orders` — `api/orders.js`

| Method | Auth | Request | Success | Errors |
|---|---|---|---|---|
| `POST` | ⚠️ **public** | `{ customerName, mobile, items:[{name, content?, qty, rate?, finalRate}] }` | `201 { ok:true, order:{…} }` | `500` validation message, `409` CONFLICT |
| `GET` | ✅ | — | `200 { orders:[…] }` | `401` |
| `PATCH` | ✅ | `{ id, status }` | `200 { ok:true, orders:[…] }` | `400` bad/missing status, `401`, `404`, `409` |
| `DELETE` | ✅ | `?id=ORD-0001` | `200 { ok:true, orders:[…] }` | `400` missing id, `401`, `404`, `409` |

- `STATUSES = ['pending', 'confirmed', 'delivered']` is a hard allow-list; anything else → `400`.
- `status` is always forced to `pending` on create — a client cannot pre-confirm its own order.
- The server computes `total`, `savings`, `lineTotal`, and `createdAt`. Prices come from the client
  (see §15 for the trust caveat).
- Commit message on status change is diff-aware: `Order ORD-0002 status pending -> confirmed (admin)`.

### 5.6 Body parsing (copy this everywhere)

Vercel usually pre-parses JSON, but local invocation may not. The idempotent pattern used in all
three POST/PATCH handlers:

```js
let body;
try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}');
} catch (e) {
    body = {};
}
```

### 5.7 Error taxonomy

| Status | Meaning | Client reaction |
|---|---|---|
| `400` | Bad input (missing id, invalid status, out-of-range discount) | Show `data.error` in a toast |
| `401` | No / expired session | `showLogin()` (handled centrally in `api()`) |
| `404` | Target row gone | Show error toast |
| `409` (duplicate) | Product name clash | Show `data.error` |
| `409` (`CONFLICT:`) | GitHub SHA mismatch — someone else wrote first | **Auto-retry the identical request once** |
| `500` | Config missing or upstream failure | Show `err.message` |

---

## 6. GitHub-as-database layer

Identical block duplicated in `api/products.js` and `api/orders.js` (only `REPO_FILE` differs).
**Extract it into `api/_github.js` when you clone the project** — see §11.

```js
const REPO_FILE = 'assets/products.json';          // or 'assets/orders.json'

function env() {
    return {
        owner:  process.env.GITHUB_OWNER,
        repo:   process.env.GITHUB_REPO,
        branch: process.env.GITHUB_BRANCH || 'main',
        token:  process.env.GITHUB_TOKEN
    };
}

/** Read current content + the blob SHA (the optimistic-concurrency token). */
async function getGitHubFile() {
    const { owner, repo, branch, token } = env();
    if (!owner || !repo || !token) throw new Error(configError());
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${REPO_FILE}?ref=${encodeURIComponent(branch)}`;
    const res = await fetch(url, { headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'twins-nanban-admin'     // GitHub rejects requests without a UA
    }});
    if (!res.ok) throw new Error(`GitHub read failed (${res.status}): ${await res.text()}`);
    const data = await res.json();
    return {
        sha: data.sha,
        content: JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'))
    };
}

/** Atomic replace + commit. */
async function putGitHubFile(sha, content, message) {
    const { owner, repo, branch, token } = env();
    if (!owner || !repo || !token) throw new Error(configError());
    const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${REPO_FILE}`,
        { method: 'PUT', headers: { /* same + 'Content-Type': 'application/json' */ },
          body: JSON.stringify({
            message,
            content: Buffer.from(JSON.stringify(content)).toString('base64'),
            sha,                                   // ← this is what makes the write conditional
            branch
        })}
    );
    if (res.status === 409) throw new Error('CONFLICT: Another update just changed <file>. Please retry.');
    if (!res.ok)         throw new Error(`GitHub write failed (${res.status}): ${await res.text()}`);
    return res.json();
}
```

### 6.1 Optimistic concurrency, end to end

1. Client sends a mutation.
2. Function **re-reads the file from GitHub** (never from a cache, never from the request body) →
   gets `{ sha, content }`. This eliminates stale writes from the client's point of view.
3. Function mutates the fresh array and `PUT`s it back **with that same `sha`**.
4. If another writer committed in between, GitHub answers `409` and the blob SHA no longer matches.
5. The function converts that into `Error('CONFLICT: …')`; the top-level `catch` maps
   `/CONFLICT/.test(err.message)` → HTTP `409 { error: 'CONFLICT: …' }`.
6. The client's `api()` throws, and the caller sees `/CONFLICT/.test(msg)` → it **silently replays
   the identical request**. The server re-reads again, so the retry is safe and correct.

Because step 2 re-reads on *every* request, the client's retry does not need to re-merge anything —
that is the design trick that makes a one-line retry correct.

### 6.2 Commit messages (your audit trail)

| Action | Message |
|---|---|
| Add / update product | `Update products.json (admin) via /api/products` |
| Delete product | `Remove product id 12 (admin) via /api/products` |
| New order | `New order ORD-0002 via /api/orders` |
| Status change | `Order ORD-0002 status pending -> confirmed (admin)` |
| Delete order | `Remove order ORD-0002 (admin)` |

Keep the `(admin)` / `via /api/...` markers — they let you distinguish panel edits from
hand-edits in `git log`.

### 6.3 Triggering a redeploy

Committing to the default branch makes Vercel redeploy automatically. There is no webhook, no cache
invalidation, no build hook. The next visitor gets fresh JSON from the CDN (respect your own
cache-busting needs — the storefront caches in `localStorage` and revalidates in the background, see
`js/main.js:505`).

---

## 7. `admin.html` anatomy

~1640 lines, three blocks: `<style>` (design tokens + components + responsive), `<body>` markup, one
inline `<script>`.

### 7.1 Two screens, toggled by inline style

```html
<div id="login-screen">     … fixed, full-viewport, gradient backdrop … </div>
<div id="dashboard-screen" style="display:none"> … </div>
```

`showLogin()` / `showDashboard()` flip `style.display` between `flex`/`none` and `none`/`block`.
`showDashboard()` immediately calls `loadProducts()`.

### 7.2 Design tokens

```css
:root {
    --primary: #E61C24;  --secondary: #FF9000;  --accent: #FFF200;
    --dark: #0B1325;     --card: #ffffff;       --text: #2c2c2c;
    --muted: #666666;    --border: #e2e2e7;     --bg: #f5f5f7;
    --success: #16a34a;  --danger: #dc2626;
}
```

`--primary/--dark/--accent` are the brand colours and are the only values you must change to
reskin the panel. Everything else is neutral.

### 7.3 Dashboard layout

```
.topbar          sticky, 60px, --dark, brand left / Logout right
.layout          display:flex
  .sidebar       230px, --dark, vertical nav buttons
  .container-admin  flex:1, max-width:1200px, margin:auto, holds the <section>s
#view-products   stats + add/edit form + products table
#view-orders     stats + orders table
```

Navigation is two `<section>`s plus `data-view` buttons — no router, no history API:

```js
function switchView(view) {
    viewButtons.forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $('view-products').style.display = view === 'products' ? '' : 'none';
    $('view-orders').style.display   = view === 'orders'   ? '' : 'none';
    if (view === 'orders' && !ordersLoaded) loadOrders();   // lazy-load orders once
}
```

`ordersLoaded` means the (potentially large) orders payload is only fetched the first time an admin
opens the Orders tab.

### 7.4 State

```js
let authenticated = false;
let products = [];          // full catalogue in memory
let editingId = null;       // null = insert mode, number = update mode
let orders = [];
let ordersLoaded = false;
const $ = (id) => document.getElementById(id);   // the only DOM helper used
```

Everything is a **full re-render from state** — no virtual DOM, no diffing. One `loadProducts()` →
`renderStats() + renderCategoryFilter() + renderTable()`. Keep this model; it is why the whole panel
fits in one file.

### 7.5 The `api()` wrapper (copy verbatim)

```js
async function api(path, options = {}) {
    const res = await fetch(path, {
        ...options,
        credentials: 'same-origin',                    // send the session cookie
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}     // tolerate empty bodies
    if (res.status === 401) { showLogin(); throw new Error('Session expired or unauthorized'); }
    if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
    return data;
}
```

Three jobs: attach cookies, tolerate non-JSON, and centralise the 401 → login bounce.

### 7.6 XSS defence

```js
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function escapeAttr(s) {
    return String(s).replace(/[&"]/g, m => ({'&':'&amp;','"':'&quot;'}[m]));
}
```

Rules that must hold everywhere you touch the markup:
- `escapeHtml()` for any value interpolated into text or an attribute **value**.
- `escapeAttr()` for values interpolated into `data-*` attributes and `<option value>`.
- Never interpolate unescaped. `admin.html` has a couple of loose spots (raw `o.id` in
  `data-view-items`, raw `p.id`) — safe today because both come from the server, but escape them
  in your version.

### 7.7 Derived UI (no hard-coded taxonomy)

```js
function renderCategoryFilter() {
    const cats = [...new Set(products.map(p => p.category).filter(c => c && c.trim()))].sort();
    // rebuild <select> for the table filter AND the add/edit form dropdown,
    // then restore the previously selected value in both (sel.value = current)
}
```

The category list is *always* computed from the data. Adding a product with a brand-new category
makes it appear in the filter and the form dropdown on the very next render — no config anywhere.

### 7.8 Search & filter

```js
function getFilteredProducts() {
    const q   = $('search').value.trim().toLowerCase();
    const cat = $('filter-cat').value;
    return products.filter(p => {
        const catOk = !cat || p.category === cat;                       // exact match
        const qOk = !q ||
            (p.name    || '').toLowerCase().includes(q) ||
            (p.category|| '').toLowerCase().includes(q) ||
            (p.content || '').toLowerCase().includes(q);                // OR across 3 fields
        return catOk && qOk;
    });
}
```

Pure client-side filtering over the in-memory array — no debounce needed, no request per keystroke.
`input`/`change` listeners just call `renderTable()` / `renderOrders()` again.

Orders add item-name search plus a deterministic sort:

```js
.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))   // newest first
            || num(b.id) - num(a.id));                                    // tie-break on id
// where num = id => parseInt(String(id).match(/(\d+)/)[1], 10)
```

### 7.9 Event delegation after render

Because rows are innerHTML, listeners are (re)bound after every render, using `data-*` hooks:

```js
tbody.querySelectorAll('[data-edit]').forEach(b =>
    b.addEventListener('click', () => startEdit(Number(b.dataset.edit))));
```

### 7.10 Add / Edit via one form

The form doubles as create and update, discriminated by `editingId`:

| | Add mode | Edit mode |
|---|---|---|
| `editingId` | `null` | product `id` |
| `#form-title` | `➕ Add New Product` | `✏️ Edit Product` |
| `#submit-btn` | `Add Product` | `Update Product` |
| `#cancel-edit` | hidden | visible |
| Payload `id` | `undefined` (omitted by `JSON.stringify`) | the id |
| After save | scroll to top on edit | `resetForm()` then `loadProducts()` |

`startEdit(id)` also **back-computes the discount input** from stored data:

```js
const discPct = Math.round((1 - (Number(p.finalRate) / Number(p.rate))) * 100);
```

`resetForm()` calls `form.reset()`, blanks `#p-finalrate`, and restores the add-mode labels. The
delete handler calls `resetForm()` when the row currently being edited is deleted.

### 7.11 Buttons: loading / disabled state

Consistent pattern on every mutating action — disable, change the label, restore in `finally`:

```js
const originalText = btn.textContent;
btn.disabled = true;  btn.textContent = 'Saving...';
try { … } finally { btn.disabled = false; btn.textContent = originalText; }
```

### 7.12 CONFLICT auto-retry (copy this shape)

```js
catch (err) {
    const msg = String(err.message);
    if (/CONFLICT/.test(msg)) {
        toast('Another change was detected. Retrying with latest data...', 'warn');
        try { await api(path, options); /* + success toast + reload */ }
        catch (e2) { toast(e2.message, 'error'); }
    } else {
        toast(msg, 'error');
    }
}
```

The identical block appears in `handleSubmit`, `deleteProduct`, and `updateOrderStatus`. Because the
server re-reads the file on every call (§6.1), replaying the same payload is correct. **Limit it to
one retry** to avoid a hot loop against a persistently failing upstream.

### 7.13 Toast

```js
let toastTimer;
function toast(msg, type) {           // type: 'success' | 'error' | 'warn'
    const t = $('toast');
    t.textContent = msg;
    t.className = 'show ' + (type || 'success');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.className = '', 3500);
}
```

`#toast` is `position: fixed`, `opacity: 0` → `.show { opacity: 1; transform: none }`, with
`pointer-events: none` so it never blocks clicks. The timer is a **module-level singleton** so rapid
successive toasts don't cut each other off.

### 7.14 Orders table specifics

- **Status is a `<select class="status-select">`**, and a `change` immediately `PATCH`es. There is no
  Save button — a status change is a single atomic action. On failure the whole list reloads
  (`loadOrders()`), so the dropdown snaps back to the server truth.
- **Items preview**: first 3 lines inline, then a "View N more…" button that toggles a hidden
  `.order-items-extra` div and flips its own label to "View less".
- **`totalQty`** (sum of `qty`, i.e. units, not line count) is shown as the "N items" caption.
- **View-items modal** (mobile only, see §10): `#items-modal` with `.modal-overlay.active`
  toggling `display: flex`. Clicking the backdrop (`e.target.id === 'items-modal'`) or the `×`
  closes it.

### 7.15 DOM reference

| Element | Purpose |
|---|---|
| `#login-form`, `#username`, `#password`, `#password-toggle` | Login + show/hide eye (swaps two inline SVGs via a `.visible` class) |
| `#login-btn`, `#login-error` | Button state, generic error banner |
| `#logout-btn` | `POST /api/logout` |
| `.nav-item[data-view]` | Products / Orders tabs |
| `#stat-count`, `#stat-cats`, `#stat-listed` | Product count, distinct categories, items with images |
| `#stat-orders`, `#stat-pending`, `#stat-confirmed` | Order counts per status |
| `#product-form`, `#product-id` (hidden) | Create/update discriminator |
| `#p-name`, `#p-category`, `#p-content`, `#p-rate`, `#p-discount`, `#p-finalrate` (readonly), `#p-image` | Product fields |
| `#form-title`, `#submit-btn`, `#cancel-edit` | Add/edit mode UI |
| `#search`, `#filter-cat` | Product search + category filter |
| `#product-tbody` | Product rows (8 columns) |
| `#order-search`, `#order-filter`, `#orders-tbody` | Order search + status filter (8 columns) |
| `#items-modal`, `#items-list`, `#modal-close` | Mobile items modal |
| `#toast` | Notifications |

---

## 8. Pricing math

Three places, all consistent, all worth copying exactly.

**a) Live preview while typing** — `input` listeners on `#p-rate` and `#p-discount`:

```js
function recalcFinal() {
    const rate = Number($('p-rate').value);
    const disc = Number($('p-discount').value);
    if (!isNaN(rate) && !isNaN(disc) && disc >= 0 && disc <= 100) {
        $('p-finalrate').value = formatPrice(rate * (100 - disc) / 100);
    } else if (!isNaN(rate)) {
        $('p-finalrate').value = formatPrice(rate);   // blank/invalid discount → full price
    } else {
        $('p-finalrate').value = '';
    }
}
```

The rate/discount fields are percent-**off** inputs. `0..100` is validated here so the user cannot
type nonsense; the server re-validates anyway (`api/products.js:125`).

**b) Percent → factor → price on the server** — `api/products.js:validateProduct()`:

```js
function normalizePrice(v) {
    const n = Math.round((Number(v) + Number.EPSILON) * 100) / 100;   // kill float dust
    return isNaN(n) ? 0 : n;
}
const pct    = Number(body.discountPct);
if (isNaN(pct) || pct < 0 || pct > 100) throw new Error('Discount must be a percentage between 0 and 100');
const factor = normalizePrice((100 - pct) / 100);
const finalRate = normalizePrice(rate * factor);
```

There is also a **direct `finalRate` branch**: if the client sends `finalRate` and *no*
`discountPct`, the factor is back-derived as `finalRate / rate`. That keeps the stored schema
(`rate` + `discount` factor + `finalRate`) invariant for other producers. The admin form always uses
the percent branch.

`normalizePrice` is copy-pasted in both `api/products.js` and `api/orders.js` — fold it into
`api/_util.js` in your version.

**c) Discount back to a percentage for display** — `admin.html:renderTable()`:

```js
const discPct = (p.rate > 0 && p.finalRate !== undefined)
    ? Math.round((1 - (Number(p.finalRate) / Number(p.rate))) * 100)
    : 0;
```

**d) Currency formatting** — Indian digit grouping everywhere:

```js
function formatPrice(v) { return '₹' + (Number(v) || 0).toLocaleString('en-IN'); }
```

**e) Date formatting** — `en-IN` with `2-digit` day/month for stable width:

```js
new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
  + ' ' +
new Date(iso).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
```

**f) Order totals** — always recomputed server-side from the items, never accepted from the client:

```js
lineTotal = normalizePrice(finalRate * qty);
total     = normalizePrice(Σ lineTotal);
savings   = normalizePrice(max(0, Σ(rate * qty) − total));
```

---

## 9. Invoice PDF generation

`downloadOrderInvoice(orderId)` — ~250 lines, all client-side, no server, no npm.

### 9.1 Lazy CDN load of jsPDF

```js
let jspdfPromise = null;
function loadJspdf() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    if (!jspdfPromise) {
        jspdfPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload  = () => resolve();
            script.onerror = () => { jspdfPromise = null; reject(new Error('Failed to load jsPDF')); };
            document.head.appendChild(script);
        });
    }
    return jspdfPromise;
}
```

- Cached in a module-level promise, so N clicks = 1 network request.
- On failure the cached promise is **nulled** so a later click can retry.
- Caller shows `Could not load invoice library. Please check your internet connection.` — the only
  place the panel depends on a third party. If you need offline invoices, vendor the file into
  `assets/` and load it from there instead.

### 9.2 Page geometry

```js
const doc = new jsPDF({ unit: 'pt', format: 'a4' });
const pageWidth  = doc.internal.pageSize.getWidth();    // 595.28
const pageHeight = doc.internal.pageSize.getHeight();   // 841.89
const margin = 44, contentWidth = pageWidth - margin * 2;
```

`pt` units throughout (jsPDF's native) so you reason in typographic points, not mm.

### 9.3 Layout blocks, in order

1. **Header band** — business name 20pt bold, tagline 9pt, two address lines 8.5pt; `INVOICE` 24pt
   bold right-aligned; a 2pt `PRIMARY`-red rule under the band.
2. **Meta box** — one `roundedRect(..., 'FD')` filled `#f9f9fb` with a light border, 72pt tall.
   Left: `BILL TO` label, customer name, `Mob : +91 …`, `Order : <id>`. Right: `Date` / `Time` /
   `Status` labels with right-aligned values.
3. **Items table** — a column descriptor array drives everything:

```js
const cols = [
    { label: '#',       width: 24, align: 'right' },
    { label: 'Product',       align: 'left'  },   // width computed below
    { label: 'MRP',    width: 65, align: 'right' },
    { label: 'Disc',   width: 42, align: 'right' },
    { label: 'Rate',   width: 65, align: 'right' },
    { label: 'Qty',    width: 36, align: 'right' },
    { label: 'Amount', width: 90, align: 'right' }
];
cols[1].width = contentWidth - cols.reduce((s, c) => s + (c.width || 0), 0);
```

   Only the `Product` column flexes; every numeric column has a fixed width and right alignment
   (8pt inner padding). Header = dark `roundedRect` with white 8.5pt bold text. Rows are 28pt tall
   with a zebra fill (`#f7f7fa`) on odd indices. The product name wraps via
   `doc.splitTextToSize(name, nameWidth)` and only its **first line** is drawn (with
   `content` as a 7.5pt grey sub-line) — a deliberate one-line-per-item look, so rows never grow.

4. **Pagination** — before drawing each row, `if (y > pageHeight - 100) newPage();`. `newPage()`
   adds a page, paints a 28pt dark band with a 2pt red underline containing the business name and
   the invoice number, resets `y = 64`, and re-draws the table header. `drawTableHead` is a named
   function precisely so it can be reused on every continuation page. Same guard before the totals
   block with a 120pt reserve.

5. **Totals** — `GRAND TOTAL :` 12pt bold in `PRIMARY` on the left, value right-aligned; then
   `AMOUNT IN WORDS` 8.5pt bold with the converted amount 9.5pt; then `Total Items : N`.

6. **Logo watermark** — a 400×400pt centred PNG at 8% opacity, wrapped in `try/catch` so a missing
   or CORS-blocked image never breaks the download:

```js
doc.setGState(new doc.GState({ opacity: 0.08 }));
doc.addImage(logoUrl, 'PNG', centerX - 200, centerY - 200, 400, 400);
doc.setGState(new doc.GState({ opacity: 1 }));
```

7. **Footer** — 0.7pt rule at `pageHeight - 58`, a thank-you line, then a **second pass over all
   pages** to stamp `Page i of n` (you only know the total after everything is drawn):

```js
const pages = doc.internal.getNumberOfPages();
for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.text(`Page ${i} of ${pages}`, …); }
```

8. **Save** — `doc.save('TwinsNanbanCrackers-<id>.pdf')` then `toast('Invoice downloaded!')`.

### 9.4 Amount in Indian words (Crore / Lakh / Thousand)

```js
function numberToIndianWords(num) {
    const ones = ['', 'One', …, 'Nineteen'];
    const tens = ['', '', 'Twenty', …, 'Ninety'];
    const two = n => n < 20 ? ones[n] : tens[Math.floor(n/10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (!num) return 'Zero Rupees Only';
    let n = Math.round(num), words = '';
    if (n >= 10000000) { words += two(Math.floor(n/10000000)) + ' Crore ';     n %= 10000000; }
    if (n >= 100000)   { words += two(Math.floor(n/100000))   + ' Lakh ';      n %= 100000;   }
    if (n >= 1000)     { words += two(Math.floor(n/1000))     + ' Thousand ';  n %= 1000;     }
    if (n >= 100)      { words += ones[Math.floor(n/100)]    + ' Hundred ';   n %= 100;      }
    if (n) words += two(n);
    return words.trim() + ' Rupees Only';
}
```

Standard greedy decomposition with a two-digit helper. Note the `Lakh` (5) / `Crore` (7) grouping —
this is Indian numbering, **not** million/billion, and it is the reason a Western snippet can't be
copy-pasted in.

### 9.5 Things to change when cloning

- Logo path `/assets/twins_nanban_logo.png` (used by both the login card and the watermark).
- Address / phone / email lines in the header block.
- `PRIMARY` / `DARK` / `GRAY` / `LIGHT_BORDER` RGB triplets — mirror your CSS tokens.
- Invoice filename prefix and the `'INVOICE'` title.
- Consider adding a GSTIN / HSN column if you need a compliant invoice.

---

## 10. Responsive strategy

Two breakpoints, and the trick is that **tables never become cards** — low-value columns are simply
`display: none` at each breakpoint, chosen by `nth-child`.

| Breakpoint | Sidebar | Form grid | Products table | Orders table | Toast |
|---|---|---|---|---|---|
| `> 768px` | 230px vertical, dark | `auto-fit minmax(180px,1fr)` | all 8 cols | all 8 cols | top-right, auto width |
| `≤ 768px` | becomes a **horizontal row** of nav buttons across the top; title hidden | 2 columns | hides `Content` (col 4) | hides `Date` (col 7) | full width, centred |
| `≤ 480px` | same | 1 column, stacked; `.form-actions` goes vertical, buttons 100% | shows only ID, Name, Rate, Actions (hides 3,4,5,6) | shows ID, Customer, Total, Status, Actions (hides 3,4,7) + the eye button appears | 10px inset |

Key mechanics:

```css
@media (max-width: 768px) {
    .layout   { flex-direction: column; }
    .sidebar  { width: 100%; padding: 8px 10px; }
    .sidebar-nav { flex-direction: row; gap: 4px; }
    .nav-item   { flex: 1; justify-content: center; }
}

/* Hide one column of one specific table */
@media (max-width: 768px) {
    #view-products .table-wrap table thead th:nth-child(4),
    #view-products .table-wrap table tbody td:nth-child(4) { display: none; }
}
```

- Selectors are scoped by view id (`#view-products` / `#view-orders`) so one rule never touches the
  wrong table. **Column indices are positional** — if you add/remove a `<th>`, you must renumber
  every `nth-child` rule. This is the single most fragile part of the CSS; keep the column order
  identical or rewrite the mobile rules.
- The long text column gets `overflow-wrap: anywhere; word-break: break-word;` and the actions cell
  gets `white-space: nowrap;` so buttons never wrap or squash.
- `.icon-view-items { display: none; }` by default, then
  `#view-orders .row-actions .icon-view-items { display: inline-flex; }` at `≤ 480px` — the eye
  button only exists on phones, because that's the only place the items column is hidden.
- `.table-wrap { overflow-x: auto; }` is the final safety net for any width you didn't anticipate.
- Every form field and button keeps a touch-friendly size: `.icon-btn` 32→30px, `.pill` font
  shrinks, `.form-actions .btn { min-width: 130px }` on desktop → `width: 100%` on mobile.

---

## 11. Implementation plan for a new site

Follow in order; each step is independently testable.

### Step 0 — Prerequisites

- [ ] Vercel account, repo pushed to GitHub (or GitLab — see §15 for swapping the storage layer).
- [ ] Product images already committed to `assets/products/<folder>/`.
- [ ] Decide your **`ORDER_ID_PREFIX`** (3 letters is the convention) and your brand colours.

### Step 1 — Data files

- [ ] Create `assets/products.json` → `{ "products": [ … ] }`. Write the first rows by hand or
      convert a spreadsheet; keep the exact field set from §3.1 (`discount` = **factor**).
- [ ] Create `assets/orders.json` → `{ "orders": [] }` and commit it **empty** so the API has a file
      to PUT against from day one.
- [ ] Validate both parse: `node -e "JSON.parse(require('fs').readFileSync('assets/products.json'))"`.

### Step 2 — Backend: shared helpers

- [ ] `api/_auth.js` — copy verbatim from the source repo. Change only `SESSION_COOKIE`
      (`<prefix>_admin_session`) and optionally add `; Secure` to the cookie string.
- [ ] `api/_github.js` — **new file**, extract `env()`, `configError()`, `getGitHubFile(path)`,
      `putGitHubFile(path, sha, content, message)` from `api/products.js`. Accept the repo file
      path as a parameter instead of hard-coding `REPO_FILE`; this removes the duplication between
      the two data routes. Keep the `409 → Error('CONFLICT: …')` mapping inside it.
- [ ] `api/_util.js` — **new file**, hold `normalizePrice()` and a `parseBody(req)` helper
      (the `typeof req.body === 'object' ? req.body : JSON.parse(...)` dance), plus
      `conflictResponse(res, err)`.

### Step 3 — Backend: auth routes

- [ ] `api/login.js` — copy; keeps `safeEqual`, env-var credentials, generic error, 405 guard.
- [ ] `api/logout.js` — copy verbatim.
- [ ] `api/me.js` — copy verbatim.

### Step 4 — Backend: products route

- [ ] `api/products.js` — copy, then:
  - `REPO_FILE = 'assets/products.json'`
  - `validateProduct()` — keep the dual `discountPct` / `finalRate` branches, or simplify to
    percent-only if nothing else writes the file.
  - `products[idx] = { id, ...product, id }` in the original has a **duplicated `id` key**; write
    `{ ...product, id }` in yours.
  - Add a length cap on `name` / `category` / `content` / `image` (e.g. 120 chars) — the original
    has none, so a runaway value breaks the table layout.
  - Reuse `_util.js` instead of local copies of `normalizePrice`.
- [ ] Decide whether `GET /api/products` should require auth (the original does **not**).

### Step 5 — Backend: orders route

- [ ] `api/orders.js` — copy, then:
  - `REPO_FILE = 'assets/orders.json'`
  - `ORDER_ID_PREFIX = 'ABC'` (your brand)
  - `STATUSES` — add your own lifecycle if needed (e.g. `['pending','confirmed','packed','shipped','delivered','cancelled']`); keep it a hard allow-list.
  - Reuse the shared `parseBody` / `normalizePrice` / conflict mapper.

### Step 6 — Front-end: storefront wiring

- [ ] Ensure the public catalogue loads from the same file the admin writes:
      `fetch('assets/products.json')` (see `js/main.js:481`). Keep the localStorage
      cache-then-revalidate pattern (`:505`) but make sure the cache key is namespaced per site.
- [ ] Point checkout at `POST /api/orders` with `{ customerName, mobile, items:[{ name, content, qty, rate, finalRate }] }`
      (see `js/main.js:1249`). Keep the graceful degradation: if the order POST fails, still send the
      WhatsApp message (`:1272`) — never block a sale on the API.
- [ ] Add an admin link (e.g. `footer.html:17`) — and consider not linking it in production at all.

### Step 7 — Front-end: `admin.html`

- [ ] Start from the source file and run through the rename checklist in §13.
- [ ] Confirm the two screens, the `api()` wrapper, `escapeHtml`/`escapeAttr`, `toast`, and the
      CONFLICT retry all survived the copy.
- [ ] Re-check every `nth-child` responsive rule against your final column order.
- [ ] Replace the business constants in the invoice block (logo path, address, phone, email, colours,
      filename prefix, `INVOICE` title).
- [ ] Keep `const ADMIN_MODE = 'prod';`.

### Step 8 — Deploy & configure

- [ ] `vercel.json` → `{ "version": 2, "cleanUrls": true, "trailingSlash": false }`
- [ ] Add the six environment variables in the Vercel dashboard (§12) and redeploy.
- [ ] Confirm `/api/me` returns `401` and the login screen appears at `/admin`.

### Step 9 — Smoke test with a real write

- [ ] Log in → add a throwaway product → confirm the commit appears in `git log` with the
      `(admin) via /api/products` message → confirm it appears in the storefront.
- [ ] Place a test order from the storefront → confirm `New order ABC-0001 via /api/orders` in
      `git log` → confirm it shows up in the Orders tab.
- [ ] Change the status twice → confirm the `pending -> confirmed -> delivered` diff-style messages.
- [ ] Download the invoice; check pagination by adding 25+ items to a test order.
- [ ] Log out, then hit any API route with `curl` and confirm `401`.

---

## 12. Env vars &amp; Vercel deployment

### 12.1 Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (all environments, then
redeploy — env changes need a redeploy to take effect).

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `AUTH_SECRET` | ✅ | `openssl rand -hex 32` | HMAC key for session tokens. **Never commit.** Losing it invalidates all sessions |
| `ADMIN_USERNAME` | ✅ | `admin` | Login username |
| `ADMIN_PASSWORD` | ✅ | *(strong, unique)* | Login password |
| `GITHUB_TOKEN` | ✅ | `github_pat_…` (fine-grained) | Needs **Contents: read & write** on that one repo |
| `GITHUB_OWNER` | ✅ | `PraveenKumar017` | Repo owner/org |
| `GITHUB_REPO` | ✅ | `twins_nanban_crackers` | Repo name |
| `GITHUB_BRANCH` | optional | `main` | Defaults to `main` |

`ADMIN_SESSION_SECRET` is accepted as an alias for `AUTH_SECRET` (`_auth.js:17`).

> Use a **fine-grained PAT** scoped to a single repository with only the *Contents* →
> *Read and write* permission. A classic PAT with `repo` scope can rewrite your entire account.

Generate the secret once and store it in a password manager; you cannot recover it from Vercel logs.

### 12.2 Deployment

Push to the default branch and Vercel deploys. No build command, no output directory, no
dependencies. The `api/*.js` files are auto-detected as Node serverless functions (Node 18+ for
global `fetch`).

### 12.3 Local development

- Run the panel in `?mode=dev` against a Vercel **preview** deployment (serverless functions don't
  run from `file://` or a plain static server).
- Or use the Vercel CLI: `vercel dev` (pulls env vars from the project) then open the printed URL.
- For pure CSS/layout iteration, `?mode=dev` on any static server works — only the GET calls fail.

### 12.4 Operational notes

- Every admin action is a git commit → automatic redeploy → brief window where the CDN may serve the
  previous `products.json`. Acceptable for this scale; if it matters, read `products.json` through an
  API route with `Cache-Control: no-store` instead of serving the file statically.
- `git log -- assets/products.json` is your product change history, and `git show <sha>` gives you a
  one-click rollback (`git revert <sha>`). This is the main operational advantage of the design —
  document it so whoever maintains the site knows it.

---

## 13. Find &amp; replace checklist when cloning to another site

Do these deliberately, one at a time, then re-test.

| What | Where | Change to |
|---|---|---|
| Session cookie name | `api/_auth.js` `SESSION_COOKIE` | `'<prefix>_admin_session'` |
| Session TTL | `api/_auth.js` `SESSION_TTL_MS` | keep 8 h or change |
| Order id prefix | `api/orders.js` `ORDER_ID_PREFIX` | `'ABC'` |
| JSON file paths | `api/products.js`, `api/orders.js` | your `assets/*.json` |
| Commit-message agent | `User-Agent` header in `_github.js` / both routes | `'your-site-admin'` |
| Brand colours | `admin.html` `:root` | your `--primary/--dark/--accent` |
| Login logo | `admin.html` login card `img src` + `onerror` fallback | your logo path |
| Topbar brand | `admin.html` `.topbar .brand` | your name + `ADMIN` |
| Page title | `admin.html` `<title>` | `'Admin Panel - <Business>'` |
| Login copy | `admin.html` `h1` + `.login-sub` | your business name |
| Invoice header | `downloadOrderInvoice()` | name, tagline, address, phone, email |
| Invoice logo | `downloadOrderInvoice()` `logoUrl` | your logo path |
| Invoice PDF name | `doc.save('TwinsNanbanCrackers-…')` | `'<Business>-<id>.pdf'` |
| Invoice colours | `PRIMARY/DARK/GRAY/LIGHT_BORDER` RGB arrays | mirror your tokens |
| Admin link | `footer.html` | optional — consider removing in production |
| Storefront cache key | `js/main.js` `PRODUCTS_CACHE_KEY` | namespace per site |
| Site-localStorage keys | `cart`, `twins_bill_customer`, `activeFilters` | prefix per site |
| `ADMIN_MODE` | `admin.html` init | `'prod'` |

**Do NOT change:** the HMAC token format, the `api()` wrapper's 401 handling, the SHA-based write
pattern, the percent↔factor conversion, or the `nth-child` column indices (unless you change columns).

---

## 14. Testing checklist

**Auth**
- [ ] Unauthenticated `GET /api/products` write attempt → `401`.
- [ ] `/api/me` before login → `{authenticated:false}`; after login → `true`.
- [ ] Cookie is `HttpOnly` (devtools → Application → Cookies) and not readable from
      `document.cookie`.
- [ ] Bad password → generic error, password field cleared, form still usable.
- [ ] `POST /api/login` with `GET` → `405` + `Allow: POST`.
- [ ] Missing `ADMIN_PASSWORD` → `500 Admin credentials not configured`.
- [ ] Wait 8 h (or temporarily shorten the TTL) → next request bounces to the login screen via the
      central 401 handler.
- [ ] Logout clears the cookie (`Max-Age=0`) and the panel re-locks.

**Products**
- [ ] Add → row appears, ids increment, `git log` has one new commit.
- [ ] Duplicate name (different case) → `409`, message names the product.
- [ ] Edit → same `id` retained, no new row, `resetForm()` returns to Add mode.
- [ ] Delete → `confirm()` dialog, row gone, commit message includes the id.
- [ ] Delete the product currently being edited → form resets.
- [ ] Blank discount → final rate equals MRP; `90` → 10% of MRP; `100` → ₹0; `0` → full MRP.
- [ ] `101` or `-5` → rejected.
- [ ] Blank image → stored as `null`; storefront shows the no-image placeholder.
- [ ] Blank content → defaults to `1 Pkt`.
- [ ] Category dropdown auto-populates with a brand-new category after saving it.
- [ ] Search matches name, category, **and** content; category filter composes with search.
- [ ] Product name containing `<img src=x onerror=alert(1)>` renders as text.

**Orders**
- [ ] Checkout creates `ABC-0001`, then `ABC-0002` (no `ABC-0000`).
- [ ] `status` forced to `pending` even if the client sends `delivered`.
- [ ] Mobile `1234567890` rejected, `9876543210` accepted.
- [ ] Status dropdown persists; an illegal status via `curl` → `400`.
- [ ] "View N more…" expands/collapses and swaps its own label.
- [ ] Stats match the table (total = pending + confirmed + delivered + any custom states).
- [ ] Two browsers hitting the panel simultaneously → both writes land, no silent data loss
      (exercises the 409 → retry path).

**Invoice**
- [ ] Correct grand total, amount in words (check a value ≥ 1,00,000 and one with paise).
- [ ] 25+ items paginate, header repeats, `Page x of y` correct on every page.
- [ ] Missing logo → PDF still downloads (watermark `try/catch`).
- [ ] Offline → friendly error toast, no broken panel state.

**Responsive**
- [ ] 1280 / 1024 / 768 / 480 / 360 px, in both browser devtools and a real phone.
- [ ] Sidebar becomes a horizontal row ≤ 768 px; eye button appears ≤ 480 px.
- [ ] No horizontal page scroll at any width (only `.table-wrap` may scroll).
- [ ] All buttons ≥ 44 px touch target on mobile.

**Deployment**
- [ ] Fresh clone + env vars + deploy → login works with zero code edits.
- [ ] A commit to the JSON file shows up on the live storefront after redeploy.

---

## 15. Known weaknesses &amp; how to improve them

Honest list — the current system is fine for a small shop but these are the real limits.

| # | Issue | Where | Fix |
|---|---|---|---|
| 1 | **Prices come from the client.** `POST /api/orders` trusts `rate`/`finalRate` in the request body. A crafted request sets its own price. | `api/orders.js:119` | Re-read `products.json`, match items by name (or send product `id` from the cart), and use the server's prices. The `items[]` snapshot then stores trusted values. |
| 2 | **`GET /api/products` is unauthenticated** — anyone can read the catalogue, and `?mode=dev` renders the admin table without logging in. | `api/products.js:141` | Require auth (the storefront reads the static file, so nothing breaks), and drop the `dev` mode before going live. |
| 3 | **No rate limiting / brute-force protection** on `/api/login`. | `api/login.js` | Vercel WAF rule or a simple in-memory attempt counter with exponential backoff. |
| 4 | **No `Secure` flag** on the session cookie. | `api/_auth.js:79` | Add `; Secure` when the deployment is HTTPS-only. |
| 5 | **Single shared admin account** — no roles, no audit of *who* did what. | `api/login.js` | Put `u: username` in the token (already there) and prepend it to commit messages, e.g. `Order ORD-0002 → confirmed by admin`. For real multi-user, add a `users.json` + hashed passwords. |
| 6 | **Whole-file rewrite per write.** One write = one commit of the full JSON, and Vercel redeploys on every commit. Fine for hundreds of orders; degrades fast. | GitHub Contents API | Move to a hosted DB (Neon, Supabase, Vercel Postgres, Airtable, Google Sheets) and keep the same API contract so `admin.html` is unchanged. |
| 7 | **Duplicated helper code** — `getGitHubFile`/`putGitHubFile` in both routes, `normalizePrice` in both, GitHub commits in `git log` as a side effect of a read-modify-write. | `api/*.js` | Extract to `api/_github.js` + `api/_util.js`. |
| 8 | **`downloadOrderInvoice` is synchronous and heavy** — a 200-item order will freeze the tab. | `admin.html` | Same on a `requestAnimationFrame`/idle callback, or move to a Web Worker. |
| 9 | **No pagination or virtual scrolling** — 5,000 orders means 5,000 `<tr>`s. | `admin.html` | Server-side pagination once you're past a few hundred rows. |
| 10 | **`escapeAttr` only escapes `&` and `"`**, and a few interpolations skip escaping entirely (`o.id` in `data-view-items`, `p.id`, `it.qty`, `o.total`). Safe today only because those values are server-generated numbers. | `admin.html:941` | Route every interpolated value through `escapeHtml`/`escapeAttr` defensively. |
| 11 | **The public order POST can 409 against an admin write** and the storefront does not retry — it silently falls back to a WhatsApp-only order. | `js/main.js:1266` | Retry once, and queue failed submissions in `localStorage` to flush on the next visit. |
| 12 | **CDN staleness window** — the commit triggers a redeploy; visitors may briefly see the old JSON. | — | Read through an API route with `Cache-Control: no-store`, or append a version query string from the commit SHA. |
| 13 | **Image upload is not supported** — the admin types a *filename* that must already exist in `assets/products/`. Typo = broken image, no validation. | `admin.html` `#p-image` | Add a preflight `HEAD` request validating the file exists before saving, or add a signed-upload endpoint. |
| 14 | **`ADMIN_MODE = 'dev'` + `?mode=dev` ships in the file.** | `admin.html:1609` | Strip it in a production build step, or keep it knowing the server still protects writes. |
| 15 | **No input length caps or sanitisation** on product fields; no test suite. | `api/products.js` | Add length caps and a small `node --test` suite for `validateProduct` / `validateOrder` / `verifyToken`. |

### When to upgrade the storage layer

The GitHub-as-database approach is the right call while **writes are rare** (a handful per day) and
**reads are heavy** (every visitor loads the catalogue). Migrate to a real database when you hit any
of: more than ~5 writes/minute, need per-customer accounts, need to query across orders
(revenue by month, top products), or need to delete a customer's PII on request without a git
rewrite. Because all of it is behind 5 route files, the migration touches `api/` only —
`admin.html` keeps calling the same endpoints.
