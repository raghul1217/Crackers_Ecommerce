# Master Prompt: Crackers (Fireworks) E-Commerce Website

Copy everything below into Claude (Antigravity) to build the project.

---

## PROJECT BRIEF

Build a mobile-first, e-commerce style website for a fireworks/crackers retail shop. Customers browse products by category, add items to a cart, and place an order via **WhatsApp or Call** (no online payment gateway — this is a catalog + cart + "send order" flow, not a payment checkout, since fireworks sales are typically local/COD in India).

Build this using **plain HTML, CSS, and JavaScript only** — no frameworks, no build tools, no npm packages. Everything must run by simply opening `index.html` in a browser or serving the folder statically.

---

## TECH CONSTRAINTS

- Plain HTML5, CSS3, vanilla JS (ES6+). No React/Vue/Angular, no jQuery, no Bootstrap/Tailwind CDN — hand-write the CSS.
- No backend/server, no database. All product data comes from a local `products.json` file loaded via `fetch()`.
- Cart state managed in JS (use `localStorage` so the cart persists on page refresh).
- Must work fully client-side — no build step.
- Code should be clean, commented, and organized into separate files (not everything in one giant file).

---

## FILE STRUCTURE

```
/
├── index.html          (Home page — banner, categories, featured products)
├── shop.html           (All products, filter by category, search)
├── product.html        (Single product detail page)
├── cart.html           (Cart summary + "Place Order via WhatsApp/Call" button)
├── about.html          (Optional — shop info, safety note, address)
├── /css
│   └── style.css       (all styles, mobile-first, media queries for tablet/desktop)
├── /js
│   ├── data.js          (fetches/loads products.json)
│   ├── cart.js           (add/remove/update cart, localStorage sync)
│   ├── render.js          (renders product cards, category grids)
│   └── main.js            (page-specific init logic)
├── /data
│   └── products.json    (hardcoded demo product data — see schema below)
└── /images
    └── (placeholder image files or image URLs referenced in products.json)
```

---

## DESIGN REQUIREMENTS

- **Style reference:** Amazon / Flipkart mobile app — card-based product grids, sticky bottom cart bar, top search bar, category chips/tabs.
- **Mobile-first:** Design for a ~375–414px viewport first, then scale up with media queries for tablet (768px+) and desktop (1024px+).
- **Compact UI on mobile:** Small font sizes (product name ~13–14px, price ~15–16px bold, body text ~12–13px), tight card padding (8–10px), 2 product cards per row on mobile, 3–4 on tablet, 5–6 on desktop.
- **Color theme — Vibrant multicolor, cracker/festive themed:**
  - Primary accent: a warm gradient mix of deep red (#D32F2F / #C1121F), marigold orange (#FF6F00 / #FFA000), and gold (#FFC107) — used for the header, CTA buttons, and "Buy Now"/offer badges.
  - Secondary accents: a couple of festive pops — a teal/green (#00897B) and a magenta/pink (#D81B60) — used sparingly for category tags, discount badges, "New" labels, so the site feels colorful and festive like real cracker packaging, not flat/corporate.
  - Background: clean white / very light warm-grey (#FAFAFA) so the multicolor accents stand out and the UI doesn't look cluttered.
  - Text: dark charcoal (#212121) for readability, not pure black.
  - Use color deliberately (badges, buttons, category icons, price highlights) rather than covering large areas, so it stays usable and doesn't feel garish.
- **Product card:** image on top (fixed aspect ratio, `object-fit: cover`), name (2-line clamp), price with optional strikethrough MRP + discount %, star rating (static demo value), "Add to Cart" button, small stock/label badge (e.g. "Bestseller", "Combo", "New").
- **Sticky elements:** sticky header with logo + search icon + cart icon (with item-count badge); sticky "View Cart" bar at bottom of screen once items are added (mobile).
- **Category navigation:** horizontal scrollable chips/tabs on mobile (Gift Boxes, Sky Shots, Sparklers, Ground Chakkars, etc.), sidebar filter on desktop.
- Include empty states (empty cart, no search results) and a simple loading state while `products.json` loads.
- Include a small, tasteful safety/legal disclaimer in the footer (e.g. "Sale of fireworks is subject to local regulations. Please use crackers responsibly and follow local guidelines and timings.") — standard practice for cracker sites in India.

---

## CORE FEATURES

1. **Home page:** hero banner (festive offer banner), horizontally scrollable category chips, "Shop by Category" grid with icons, "Bestsellers" and "Combo Offers" product rows, footer with shop contact info.
2. **Shop/Category page:** grid of product cards, category filter chips at top, sort dropdown (Price: Low–High, High–Low, Popularity), search bar.
3. **Product detail page:** larger image, name, price, MRP + discount, description, quantity selector, "Add to Cart" and "Buy Now" (Buy Now = add to cart + go straight to cart page).
4. **Cart page:**
   - List of items with image, name, price, quantity +/- controls, remove button.
   - Auto-calculated subtotal, item count, and total.
   - **"Place Order on WhatsApp"** button — generates a pre-filled WhatsApp message (using `https://wa.me/<phone-number>?text=<encoded order summary>`) listing all cart items, quantities, and total, then opens WhatsApp.
   - **"Call to Order"** button — a `tel:` link with the shop's phone number, for one-tap calling on mobile.
   - No payment form, no card details, no online payment gateway anywhere in the flow.
5. **Search:** simple client-side filter across product name/category as the user types.
6. **Responsive nav:** hamburger menu on mobile if needed for About/Contact links.
7. **Persistent cart:** cart survives page reloads via `localStorage`.

---

## PRODUCT DATA — `products.json` SCHEMA

```json
[
  {
    "id": "SK001",
    "name": "Sky Shot 10 Shots Multicolor",
    "category": "Sky Shots",
    "price": 450,
    "mrp": 600,
    "discountPercent": 25,
    "image": "images/sky-shot-10.jpg",
    "description": "10-shot aerial cake with vibrant multicolor effects and crackling finish.",
    "rating": 4.3,
    "inStock": true,
    "badge": "Bestseller",
    "unit": "1 box"
  }
]
```

Generate **at least 30–40 demo products** spread across the categories below, with varied prices (₹50–₹3000), a mix of `badge` values ("New", "Bestseller", "Combo", "Limited Stock", or none), and realistic-sounding names. Use royalty-free placeholder image URLs (e.g. from Unsplash/Pexels or simple colored placeholder boxes) since real product photos aren't available for the demo.

---

## CRACKER CATEGORIES TO INCLUDE

Use these as the category list (standard categories for an Indian fireworks shop):

1. **Gift Boxes / Combo Packs** — curated assortment boxes (family packs, deluxe boxes)
2. **Sky Shots / Aerial Shots** — multi-shot cakes (5-shot, 10-shot, 25-shot, 100-shot)
3. **Sparklers** — electric sparklers, color sparklers, sparkler pencils
4. **Ground Chakkars (Wheels)** — spinning ground crackers
5. **Flower Pots (Anar)** — fountain-style crackers
6. **Rockets** — bottle/sky rockets, whistling rockets
7. **Sound Crackers / Bombs** — garland crackers, single-sound bombs
8. **Fancy / Novelty Crackers** — twinkling stars, color smoke, novelty items
9. **Party Crackers / Poppers** — confetti poppers, party popper strings (non-explosive, safe for indoor parties)
10. **Kids Special / Safe Crackers** — low-noise, safe-for-kids items (snake tablets, sparklers, poppers)
11. **Chorsa / Garland Crackers** — long strings of small crackers
12. **Repeating Shots / Fountains** — repeating fountain crackers
13. **Deluxe / Premium Collection** — high-end premium items, often bundled in gift boxes

Each product belongs to exactly one primary category; gift boxes can list their contents in the description.

---

## HOW OWNERS "SELL" ONLINE (BUSINESS FLOW TO IMPLEMENT)

Since this is catalog + cart + manual order (no payment gateway):

1. Customer browses categories → adds items to cart.
2. Customer reviews cart → taps **"Place Order on WhatsApp"**.
3. This opens WhatsApp Web/App with a pre-filled message to the shop's number, listing: item names, quantities, unit price, and total amount.
4. Shop owner receives the message, confirms stock/price, and arranges payment (UPI/cash) and delivery/pickup manually — outside the website.
5. Alternative: customer taps **"Call to Order"** to phone the shop directly.

This keeps the demo site simple and legally safe (no online payment/shipping claims for fireworks), while still feeling like a full e-commerce experience.

---

## ADDITIONAL NOTES FOR THE BUILDER

- Keep JS modular and readable; avoid inline `onclick` where possible — use `addEventListener`.
- Add basic form validation if a contact form is included.
- Ensure tap targets (buttons, quantity controls) are at least ~40px for comfortable mobile use.
- Test that the cart badge count and totals update instantly without page reload.
- Add simple CSS transitions (hover/tap feedback) for a polished feel, but keep it lightweight — no heavy animation libraries.
- Placeholder shop name: "Sparkle Crackers" (swap in the real client name/logo/phone number once provided).
