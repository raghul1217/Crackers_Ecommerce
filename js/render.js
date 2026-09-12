/**
 * render.js â€” DOM rendering helpers for product cards, categories, cart items
 * Icons: Lucide (https://lucide.dev) â€” call lucide.createIcons() after inserting HTML
 */

/* â”€â”€ Category Image Map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const CATEGORY_IMAGES = {
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
};

/* â”€â”€ Keep CATEGORY_ICONS for sidebar chips (small icon fallback) â”€ */
const CATEGORY_ICONS = {
  'Gift Boxes':          'gift',
  'Sky Shots':           'rocket',
  'Sparklers':           'sparkles',
  'Ground Chakkars':     'refresh-cw',
  'Flower Pots':         'flower-2',
  'Rockets':             'navigation',
  'Sound Crackers':      'zap',
  'Fancy Crackers':      'wand-2',
  'Party Crackers':      'party-popper',
  'Kids Special':        'baby',
  'Garland Crackers':    'link-2',
  'Repeating Fountains': 'droplets',
  'Deluxe Premium':      'crown',
};

const CATEGORY_COLORS = {
  'Gift Boxes':          '#D81B60',
  'Sky Shots':           '#1565C0',
  'Sparklers':           '#FFA000',
  'Ground Chakkars':     '#00897B',
  'Flower Pots':         '#E91E63',
  'Rockets':             '#C1121F',
  'Sound Crackers':      '#6A1B9A',
  'Fancy Crackers':      '#FF6F00',
  'Party Crackers':      '#00838F',
  'Kids Special':        '#2E7D32',
  'Garland Crackers':    '#AD1457',
  'Repeating Fountains': '#0277BD',
  'Deluxe Premium':      '#827717',
};

/* â”€â”€ Lucide helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/** Trigger Lucide icon rendering (safe â€” no-op if not loaded yet) */
function _applyIcons() {
  if (window.lucide) lucide.createIcons();
}

/* â”€â”€ Star Rating â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * Generate star rating HTML using Lucide star icons
 * @param {number} rating â€” 0 to 5
 */
function renderStars(rating) {
  const full  = Math.floor(rating);
  const half  = rating % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  let html = `<span class="stars" aria-label="Rating: ${rating} out of 5">`;
  for (let i = 0; i < full;  i++) html += `<span class="star full"><i data-lucide="star"></i></span>`;
  if (half)                         html += `<span class="star half"><i data-lucide="star-half"></i></span>`;
  for (let i = 0; i < empty; i++) html += `<span class="star empty"><i data-lucide="star"></i></span>`;
  html += `<span class="rating-num">${Number.isInteger(rating) ? rating : rating.toFixed(1)}</span></span>`;
  return html;
}

/* â”€â”€ Badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function renderBadge(badge) {
  if (!badge) return '';
  const classes = {
    'Bestseller':    'badge-bestseller',
    'New':           'badge-new',
    'Combo':         'badge-combo',
    'Limited Stock': 'badge-limited',
  };
  const cls = classes[badge] || 'badge-default';
  return `<span class="product-badge ${cls}">${badge}</span>`;
}

/* â”€â”€ Product Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * Render a product card element
 * @param {Object} product
 * @returns {HTMLElement}
 */
function renderProductCard(product) {
  const card = document.createElement('article');
  card.className = 'product-card';
  card.setAttribute('data-product-id', product.id);
  card.setAttribute('tabindex', '0');

  const discountBadge = product.discountPercent
    ? `<span class="discount-badge">-${product.discountPercent}%</span>`
    : '';

  const inCartQty = typeof getCartItemQty === 'function' ? getCartItemQty(product.id) : 0;
  const btnLabel  = inCartQty > 0 ? `In Cart (${inCartQty})` : 'Add to Cart';
  const btnClass  = inCartQty > 0 ? 'btn-add-cart in-cart' : 'btn-add-cart';

  card.innerHTML = `
    <div class="card-img-wrap">
      ${discountBadge}
      <img
        src="${product.image}"
        alt="${product.name}"
        loading="lazy"
        decoding="async"
        onerror="this.src='images/placeholder.svg'"
      />
      ${!product.inStock ? '<div class="out-of-stock-overlay">Out of Stock</div>' : ''}
    </div>
    <div class="card-body">
      <h3 class="card-name">${product.name}</h3>
      <div class="card-meta">
        ${renderStars(product.rating)}
      </div>
      <div class="card-pricing">
        <span class="card-price">&#8377;${product.price.toLocaleString('en-IN')}</span>
        ${product.mrp ? `<span class="card-mrp">&#8377;${product.mrp.toLocaleString('en-IN')}</span>` : ''}
      </div>
      <div class="card-unit">${product.unit || ''}</div>
      <button
        class="${btnClass}"
        data-product-id="${product.id}"
        ${!product.inStock ? 'disabled' : ''}
        aria-label="Add ${product.name} to cart"
        id="add-to-cart-${product.id}"
      >
        ${product.inStock ? btnLabel : 'Out of Stock'}
      </button>
    </div>
  `;

  return card;
}

/* â”€â”€ Category Grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * Render a category icon grid
 * @param {Array<string>} categories â€” list of category names
 * @param {string} containerId
 */
function renderCategoryGrid(categories, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const filtered = categories.filter(c => c !== 'All');
  container.innerHTML = filtered.map(cat => {
    const imgSrc = CATEGORY_IMAGES[cat] || '';
    const color  = CATEGORY_COLORS[cat] || '#FF6F00';
    const slug   = cat.replace(/\s+/g, '-').toLowerCase();
    const href   = cat === 'Gift Boxes' ? 'giftbox' : `shop?category=${encodeURIComponent(cat)}`;
    return `
      <a href="${href}"
         class="category-grid-item"
         style="--cat-color: ${color}"
         aria-label="Browse ${cat}"
         id="cat-grid-${slug}">
        <div class="cat-img-wrap">
          <img src="${imgSrc}" alt="${cat}" class="cat-img" loading="lazy" decoding="async" />
          <div class="cat-img-overlay"></div>
        </div>
        <span class="cat-label">${cat}</span>
      </a>
    `;
  }).join('');

  _applyIcons();
}

/* â”€â”€ Category Chips â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * Render horizontal scrollable category filter chips
 * @param {Array<string>} categories
 * @param {string} containerId
 * @param {string} activeCategory
 * @param {Function} onSelect callback(category)
 */
function renderCategoryChips(categories, containerId, activeCategory, onSelect) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = categories.map(cat => {
    const isActive = cat === activeCategory;
    return `
      <button
        class="chip ${isActive ? 'chip-active' : ''}"
        data-category="${cat}"
        aria-pressed="${isActive}"
        id="chip-${cat.replace(/\s+/g, '-').toLowerCase()}"
      >${cat}</button>
    `;
  }).join('');

  container.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.chip').forEach(b => {
        b.classList.remove('chip-active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('chip-active');
      btn.setAttribute('aria-pressed', 'true');
      if (onSelect) onSelect(btn.dataset.category);
    });
  });
}

/* â”€â”€ Cart Item Row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * Render a cart item row for cart
 * @param {Object} item â€” cart item { id, name, price, image, qty }
 * @returns {HTMLElement}
 */
function renderCartItem(item) {
  const row = document.createElement('div');
  row.className = 'cart-item';
  row.setAttribute('data-cart-item-id', item.id);

  const lineTotal = item.price * item.qty;

  row.innerHTML = `
    <div class="cart-item-img-wrap">
      <img src="${item.image}" alt="${item.name}" loading="lazy" decoding="async"
           onerror="this.src='images/placeholder.svg'" />
    </div>
    <div class="cart-item-info">
      <span class="cart-item-name">${item.name}</span>
      <div class="cart-item-price">&#8377;${item.price.toLocaleString('en-IN')} each</div>
      <div class="cart-item-controls">
        <button class="qty-btn qty-minus" data-id="${item.id}"
                aria-label="Decrease quantity of ${item.name}"
                id="qty-minus-${item.id}">&#8722;</button>
        <span class="qty-display" aria-live="polite">${item.qty}</span>
        <button class="qty-btn qty-plus" data-id="${item.id}"
                aria-label="Increase quantity of ${item.name}"
                id="qty-plus-${item.id}">&#43;</button>
      </div>
    </div>
    <div class="cart-item-right">
      <div class="cart-item-total">&#8377;${lineTotal.toLocaleString('en-IN')}</div>
      <button class="cart-remove-btn" data-id="${item.id}"
              aria-label="Remove ${item.name} from cart"
              id="remove-${item.id}" title="Remove item">
        <i data-lucide="x"></i>
      </button>
    </div>
  `;

  _applyIcons();
  return row;
}

/* â”€â”€ Product Grid Renderer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * Render a list of products into a grid container
 * @param {Array} products
 * @param {string} containerId
 * @param {Function} [onAddToCart] callback(product)
 */
function renderProductGrid(products, containerId, onAddToCart) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  if (!products || products.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i data-lucide="search-x"></i></div>
        <h3>No products found</h3>
        <p>Try a different search term or category.</p>
        <a href="shop" class="btn-primary">Browse All Products</a>
      </div>
    `;
    _applyIcons();
    return;
  }

  products.forEach(product => {
    const card = renderProductCard(product);

    // Wire Add to Cart button
    const btn = card.querySelector('.btn-add-cart');
    if (btn && onAddToCart) {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        onAddToCart(product);

        // Button feedback
        btn.classList.add('in-cart', 'bounce');
        const qty = getCartItemQty(product.id);
        btn.textContent = `In Cart (${qty})`;
        setTimeout(() => btn.classList.remove('bounce'), 400);
      });
    }

    container.appendChild(card);
  });

  _applyIcons();
}

/* â”€â”€ Horizontal Scroll Row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * Render a horizontal scrolling product row (home page sections)
 * @param {Array} products
 * @param {string} containerId
 * @param {Function} onAddToCart
 */
function renderProductRow(products, containerId, onAddToCart) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  products.forEach(product => {
    const card = renderProductCard(product);
    card.style.minWidth = '160px';

    const btn = card.querySelector('.btn-add-cart');
    if (btn && onAddToCart) {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        onAddToCart(product);
        btn.classList.add('in-cart', 'bounce');
        const qty = getCartItemQty(product.id);
        btn.textContent = `In Cart (${qty})`;
        setTimeout(() => btn.classList.remove('bounce'), 400);
      });
    }

    container.appendChild(card);
  });

  _applyIcons();
}

/* â”€â”€ Gift Box Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * Available gift box artwork files in images/giftbox (basenames).
 * The matching image is resolved at render time by checking whether
 * a slug of the file name is contained in the slug of the box name,
 * so new boxes/images work without code changes.
 */
const GIFTBOX_IMAGE_FILES = [
  'andal',
  'balaji',
  'king_of_jungle',
  'little_hero',
  'tuktuk',
  'vip',
];

/**
 * Compact lowercase slug: removes spaces/punctuation.
 * "Tuk Tuk (20 Items)" â†’ "tuktuk20items"
 * @param {*} value
 * @returns {string}
 */
function _slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Resolve the gift box artwork for a product by matching the file
 * name against the box name (contains match, longest match wins).
 * @param {Object} product
 * @returns {string} image path
 */
function _getGiftBoxImage(product) {
  const nameSlug = _slugify(product.name);
  let best = null;
  for (const file of GIFTBOX_IMAGE_FILES) {
    const fileSlug = _slugify(file);
    if (nameSlug.includes(fileSlug) && (!best || fileSlug.length > best.len)) {
      best = { file, len: fileSlug.length };
    }
  }
  return best ? `images/giftbox/${best.file}.webp` : product.image;
}

/**
 * Split a contents/packing-details string into a clean item list.
 * Handles pipe, comma, semicolon and newline separators.
 * @param {string} contents
 * @returns {Array<string>}
 */
function _splitContents(contents) {
  if (!contents) return [];
  return String(contents)
    .split(/[|;\n]+|,\s*/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Render a gift box row card showing the items packed inside the box.
 * Long item lists are clamped (3 on mobile, 15 on desktop) with a "Show all" toggle.
 * @param {Object} product
 * @returns {HTMLElement}
 */
function renderGiftBoxCard(product) {
  const card = document.createElement('article');
  card.className = 'giftbox-card';
  card.setAttribute('data-product-id', product.id);
  card.setAttribute('role', 'listitem');

  const items = _splitContents(product.unit);
  const visibleLimit = window.matchMedia('(max-width: 767px)').matches ? 3 : 15;
  const showAllToggle = items.length > visibleLimit;

  const discountPercent = product.discountPercent || 0;

  const boxImg = _getGiftBoxImage(product);

  const itemList = items.length
    ? items.map(it => `<li><i data-lucide="check"></i><span>${it}</span></li>`).join('')
    : `<li><i data-lucide="check"></i><span>${product.description}</span></li>`;

  card.innerHTML = `
    <div class="giftbox-media">
      <div class="giftbox-img-wrap" style="background-image:url('${boxImg}');"
           role="img" aria-label="Gift box artwork for ${product.name}">
          ${!product.inStock ? '<div class="out-of-stock-overlay">Out of Stock</div>' : ''}
        </div>
    </div>
    <div class="giftbox-body">
      <div class="giftbox-head">
        <div style="min-width:0;">
          <h3 class="giftbox-name">${product.name}</h3>
        </div>
        <div class="giftbox-pricing">
          <span class="giftbox-price">&#8377;${product.price.toLocaleString('en-IN')}</span>
          ${product.mrp ? `<span class="giftbox-mrp">&#8377;${product.mrp.toLocaleString('en-IN')}</span>` : ''}
          ${discountPercent ? `<span class="giftbox-off">${discountPercent}% OFF</span>` : ''}
        </div>
      </div>
      <div class="giftbox-items">
        <div class="giftbox-items-head">
          <span class="giftbox-items-label"><i data-lucide="package"></i> Items in this box</span>
          <span class="giftbox-items-count">${items.length} items</span>
        </div>
        <ul class="${showAllToggle ? 'giftbox-collapsed' : ''}">${itemList}</ul>
        ${showAllToggle ? `
          <button class="giftbox-toggle" type="button" data-giftbox-toggle aria-expanded="false">
            <i data-lucide="chevron-down"></i>
            <span>Show all ${items.length} items</span>
          </button>
        ` : ''}
      </div>
      <div class="giftbox-footer">
        <button class="btn-add-cart" data-product-id="${product.id}"
                id="add-to-cart-${product.id}"
                ${!product.inStock ? 'disabled' : ''}
                aria-label="Add ${product.name} to cart">
          ${product.inStock ? 'Add to Cart' : 'Out of Stock'}
        </button>
      </div>
    </div>
  `;

  // Wire up Show all / Show less toggle
  const toggle = card.querySelector('[data-giftbox-toggle]');
  if (toggle) {
    const list = card.querySelector('.giftbox-items ul');
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      toggle.classList.toggle('expanded', !expanded);
      list.classList.toggle('giftbox-collapsed', expanded);
      const label = toggle.querySelector('span');
      label.textContent = expanded ? `Show all ${items.length} items` : 'Show less';
    });
  }

  return card;
}

/* â”€â”€ Gift Box Grid Renderer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * Render a list of gift boxes into a grid container
 * @param {Array} products
 * @param {string} containerId
 * @param {Function} [onAddToCart] callback(product)
 */
function renderGiftBoxGrid(products, containerId, onAddToCart) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  if (!products || products.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i data-lucide="gift"></i></div>
        <h3>No gift boxes found</h3>
        <p>Check back soon &mdash; new combos are being added!</p>
        <a href="shop?category=Gift%20Boxes" class="btn-primary">Browse Shop</a>
      </div>
    `;
    _applyIcons();
    return;
  }

  products.forEach(product => {
    const card = renderGiftBoxCard(product);

    const btn = card.querySelector('.btn-add-cart');
    if (btn && onAddToCart) {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        onAddToCart(product);
        btn.classList.add('in-cart', 'bounce');
        const qty = getCartItemQty(product.id);
        btn.textContent = `In Cart (${qty})`;
        setTimeout(() => btn.classList.remove('bounce'), 400);
      });
    }

    container.appendChild(card);
  });

  _applyIcons();
}

/* â”€â”€ Loading Spinner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function showLoading(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading products&hellip;</p>
    </div>
  `;
}

function hideLoading(containerId) {
  // Replaced by actual content render â€” no-op placeholder
}
