/**
 * render.js — DOM rendering helpers for product cards, categories, cart items
 */

/* ── Category Icon Map ──────────────────────────────── */
const CATEGORY_ICONS = {
  'Gift Boxes':          '🎁',
  'Sky Shots':           '🚀',
  'Sparklers':           '✨',
  'Ground Chakkars':     '🌀',
  'Flower Pots':         '🌸',
  'Rockets':             '🔴',
  'Sound Crackers':      '💥',
  'Fancy Crackers':      '🎆',
  'Party Crackers':      '🎉',
  'Kids Special':        '🧒',
  'Garland Crackers':    '🪅',
  'Repeating Fountains': '⛲',
  'Deluxe Premium':      '👑',
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

/* ── Star Rating ─────────────────────────────────────── */

/**
 * Generate star rating HTML
 * @param {number} rating — 0 to 5
 */
function renderStars(rating) {
  const full  = Math.floor(rating);
  const half  = rating % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  let html = '<span class="stars" aria-label="Rating: ' + rating + ' out of 5">';
  for (let i = 0; i < full;  i++) html += '<span class="star full">★</span>';
  if (half)                         html += '<span class="star half">★</span>';
  for (let i = 0; i < empty; i++) html += '<span class="star empty">★</span>';
  html += `<span class="rating-num">${rating.toFixed(1)}</span></span>`;
  return html;
}

/* ── Badge ───────────────────────────────────────────── */

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

/* ── Product Card ────────────────────────────────────── */

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
    <a href="product.html?id=${product.id}" class="card-img-link" aria-label="View ${product.name}">
      <div class="card-img-wrap">
        ${discountBadge}
        ${renderBadge(product.badge)}
        <img
          src="${product.image}"
          alt="${product.name}"
          loading="lazy"
          onerror="this.src='images/placeholder.svg'"
        />
        ${!product.inStock ? '<div class="out-of-stock-overlay">Out of Stock</div>' : ''}
      </div>
    </a>
    <div class="card-body">
      <a href="product.html?id=${product.id}" class="card-name-link">
        <h3 class="card-name">${product.name}</h3>
      </a>
      <div class="card-meta">
        ${renderStars(product.rating)}
      </div>
      <div class="card-pricing">
        <span class="card-price">₹${product.price.toLocaleString('en-IN')}</span>
        ${product.mrp ? `<span class="card-mrp">₹${product.mrp.toLocaleString('en-IN')}</span>` : ''}
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

/* ── Category Grid ───────────────────────────────────── */

/**
 * Render a category icon grid
 * @param {Array<string>} categories — list of category names
 * @param {string} containerId
 */
function renderCategoryGrid(categories, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const filtered = categories.filter(c => c !== 'All');
  container.innerHTML = filtered.map(cat => {
    const icon  = CATEGORY_ICONS[cat]  || '🎇';
    const color = CATEGORY_COLORS[cat] || '#FF6F00';
    return `
      <a href="shop.html?category=${encodeURIComponent(cat)}"
         class="category-grid-item"
         style="--cat-color: ${color}"
         aria-label="Browse ${cat}"
         id="cat-grid-${cat.replace(/\s+/g, '-').toLowerCase()}">
        <div class="cat-icon-wrap">
          <span class="cat-icon">${icon}</span>
        </div>
        <span class="cat-label">${cat}</span>
      </a>
    `;
  }).join('');
}

/* ── Category Chips ──────────────────────────────────── */

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

/* ── Cart Item Row ───────────────────────────────────── */

/**
 * Render a cart item row for cart.html
 * @param {Object} item — cart item { id, name, price, image, qty }
 * @returns {HTMLElement}
 */
function renderCartItem(item) {
  const row = document.createElement('div');
  row.className = 'cart-item';
  row.setAttribute('data-cart-item-id', item.id);

  const lineTotal = item.price * item.qty;

  row.innerHTML = `
    <div class="cart-item-img-wrap">
      <img src="${item.image}" alt="${item.name}" loading="lazy"
           onerror="this.src='images/placeholder.svg'" />
    </div>
    <div class="cart-item-info">
      <a href="product.html?id=${item.id}" class="cart-item-name">${item.name}</a>
      <div class="cart-item-price">₹${item.price.toLocaleString('en-IN')} each</div>
      <div class="cart-item-controls">
        <button class="qty-btn qty-minus" data-id="${item.id}"
                aria-label="Decrease quantity of ${item.name}"
                id="qty-minus-${item.id}">−</button>
        <span class="qty-display" aria-live="polite">${item.qty}</span>
        <button class="qty-btn qty-plus" data-id="${item.id}"
                aria-label="Increase quantity of ${item.name}"
                id="qty-plus-${item.id}">+</button>
      </div>
    </div>
    <div class="cart-item-right">
      <div class="cart-item-total">₹${lineTotal.toLocaleString('en-IN')}</div>
      <button class="cart-remove-btn" data-id="${item.id}"
              aria-label="Remove ${item.name} from cart"
              id="remove-${item.id}" title="Remove item">
        ✕
      </button>
    </div>
  `;

  return row;
}

/* ── Product Grid Renderer ───────────────────────────── */

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
        <div class="empty-icon">🔍</div>
        <h3>No products found</h3>
        <p>Try a different search term or category.</p>
        <a href="shop.html" class="btn-primary">Browse All Products</a>
      </div>
    `;
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
}

/* ── Horizontal Scroll Row ───────────────────────────── */

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
}

/* ── Loading Spinner ─────────────────────────────────── */

function showLoading(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading products…</p>
    </div>
  `;
}

function hideLoading(containerId) {
  // Replaced by actual content render — no-op placeholder
}
