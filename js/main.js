/**
 * main.js — Page-specific initialization logic
 * Detects current page and bootstraps the correct init function
 */

/* ── Page Detection ──────────────────────────────────── */

const PAGE = document.body.dataset.page;

document.addEventListener('DOMContentLoaded', async () => {
  // Inject shared header/footer partials before any page logic runs
  await initLayout();

  // Initial cart UI sync
  _updateCartUI();

  // Apply Lucide icons to all static [data-lucide] elements on page load
  if (window.lucide) lucide.createIcons();

  // Navbar global search bar setup for non-shop pages
  const navSearch = document.getElementById('navbar-search-input');
  if (navSearch && PAGE !== 'shop') {
    navSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && navSearch.value.trim()) {
        window.location.href = `shop.html?q=${encodeURIComponent(navSearch.value.trim())}`;
      }
    });
  }

  switch (PAGE) {
    case 'home':    await initHome();    break;
    case 'shop':    await initShop();    break;
    case 'product': await initProduct(); break;
    case 'cart':    initCart();          break;
    case 'about':   initAbout();         break;
    case 'giftbox': await initGiftbox(); break;
    default: break;
  }
});

/* ══════════════════════════════════════════════════════
   HOME PAGE
══════════════════════════════════════════════════════ */

async function initHome() {
  showLoading('bestsellers-row');
  showLoading('combos-row');

  const products = await loadProducts();

  // Category grid
  const categories = getCategories();
  renderCategoryGrid(categories, 'category-grid'); // calls _applyIcons internally

  // Category chips (horizontal scroll)
  renderCategoryChips(
    categories,
    'home-category-chips',
    'All',
    cat => {
      window.location.href = cat === 'Gift Boxes'
        ? 'giftbox.html'
        : `shop.html?category=${encodeURIComponent(cat)}`;
    }
  );

  // Bestsellers row
  const bestsellers = getBestsellers(10);
  renderProductRow(bestsellers, 'bestsellers-row', product => {
    addToCart(product);
    showToast(`${product.name} added to cart!`);
  }); // _applyIcons called inside renderProductRow

  // Combos row — if none found, show newest products
  let combos = getCombos(10);
  if (!combos.length) {
    combos = products.filter(p => p.badge === 'New').slice(0, 8);
  }
  renderProductRow(combos, 'combos-row', product => {
    addToCart(product);
    showToast(`${product.name} added to cart!`);
  });

  initCarousel('bestsellers-row');
  initCarousel('combos-row');
}

/**
 * Wire up prev/next arrows for a horizontal-scroll product row.
 * Arrows appear only when the row overflows, and update with scroll position.
 * @param {string} rowId — id of the scrollable .products-row element
 */
function initCarousel(rowId) {
  const row = document.getElementById(rowId);
  if (!row) return;
  const wrap = row.closest('.carousel');
  if (!wrap) return;
  const prev = wrap.querySelector('.carousel-arrow.prev');
  const next = wrap.querySelector('.carousel-arrow.next');
  if (!prev || !next) return;

  const update = () => {
    const maxScroll = row.scrollWidth - row.clientWidth;
    prev.classList.toggle('show', row.scrollLeft > 4);
    next.classList.toggle('show', row.scrollLeft < maxScroll - 4);
  };

  const hasOverflow = () => row.scrollWidth > row.clientWidth + 4;
  if (!hasOverflow()) {
    wrap.classList.add('no-scroll');
    return;
  }

  const step = () => {
    const card = row.querySelector('.product-card');
    return (card ? card.getBoundingClientRect().width : 155) + 14;
  };

  prev.addEventListener('click', () => row.scrollBy({ left: -step(), behavior: 'smooth' }));
  next.addEventListener('click', () => row.scrollBy({ left: step(), behavior: 'smooth' }));

  row.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();

  // Auto-scroll: advance every 3.5s, pause on hover / touch / manual scroll
  let timer = null;
  let restartDelay = null;

  const start = () => {
    if (timer) return;
    timer = setInterval(() => {
      const maxScroll = row.scrollWidth - row.clientWidth;
      const nextLeft = row.scrollLeft + step();
      if (nextLeft >= maxScroll - 4) {
        row.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        row.scrollBy({ left: step(), behavior: 'smooth' });
      }
    }, 2500);
  };
  const stop = () => {
    if (timer) { clearInterval(timer); timer = null; }
    if (restartDelay) { clearTimeout(restartDelay); restartDelay = null; }
  };
  const scheduleRestart = () => {
    stop();
    restartDelay = setTimeout(start, 2500);
  };

  wrap.addEventListener('mouseenter', stop);
  wrap.addEventListener('mouseleave', start);
  row.addEventListener('touchstart', stop, { passive: true });
  row.addEventListener('touchend', scheduleRestart, { passive: true });
  prev.addEventListener('click', stop);
  next.addEventListener('click', stop);
  if ('scrollend' in row) {
    row.addEventListener('scrollend', scheduleRestart);
  }

  start();
}

/* ══════════════════════════════════════════════════════
   SHOP PAGE
══════════════════════════════════════════════════════ */

let _shopProducts = [];
let _activeCategory = 'All';
let _activeCategories = [];
let _activeSort = 'popular';
let _searchQuery = '';

async function initShop() {
  showLoading('products-grid');

  _shopProducts = await loadProducts();

  // Read URL params
  const params = new URLSearchParams(window.location.search);
  _activeCategories = params.getAll('category').filter(Boolean);
  _activeCategory = _activeCategories.length === 1 ? _activeCategories[0] : 'All';
  _searchQuery    = params.get('q') || '';
  _activeSort     = params.get('sort') || 'popular';

  const ss = document.getElementById('sort-select-sidebar');
  if (ss) ss.value = _activeSort;

  const categories = getCategories().filter(c => c !== 'Gift Boxes');

  // Category chips
  renderCategoryChips(
    categories,
    'shop-category-chips',
    _activeCategory,
    cat => {
      _activeCategory = cat;
      _applyShopFilters();
    }
  );

  // Search bar pre-fill & live filter wiring
  const navSearch = document.getElementById('navbar-search-input');
  if (navSearch) {
    if (_searchQuery) navSearch.value = _searchQuery;
    navSearch.addEventListener('input', () => {
      _searchQuery = navSearch.value.trim();
      _applyShopFilters();
    });
    navSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        _searchQuery = navSearch.value.trim();
        _applyShopFilters();
      }
    });
  }

  // Also support any inline search inputs
  const searchInput = document.getElementById('shop-search-input') || document.getElementById('shop-search-input-desktop');
  if (searchInput) {
    if (_searchQuery) searchInput.value = _searchQuery;
    searchInput.addEventListener('input', () => {
      _searchQuery = searchInput.value.trim();
      _applyShopFilters();
    });
  }

  // Sort dropdown
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      _activeSort = sortSelect.value;
      _applyShopFilters();
    });
  }

  _applyShopFilters();
}

function _applyShopFilters() {
  let results = (_searchQuery
    ? searchProducts(_searchQuery)
    : getByCategories(_activeCategories))
    .filter(p => p.category !== 'Gift Boxes');

  results = sortProducts(results, _activeSort);

  // Update results count
  const countEl = document.getElementById('results-count');
  if (countEl) {
    countEl.textContent = `${results.length} product${results.length !== 1 ? 's' : ''} found`;
  }

  renderProductGrid(results, 'products-grid', product => {
    addToCart(product);
    showToast(`${product.name} added to cart!`);
  }); // _applyIcons called inside renderProductGrid

  _saveShopState();
}

/* ── Shop state persistence (for "Continue Shopping") ── */

const SHOP_STATE_KEY = 'shopState';

function _getShopState() {
  return {
    categories: _activeCategories,
    sort: _activeSort,
    q: _searchQuery,
  };
}

function _saveShopState() {
  try {
    sessionStorage.setItem(SHOP_STATE_KEY, JSON.stringify(_getShopState()));
  } catch (e) { /* storage unavailable */ }
}

function _buildShopUrl(state) {
  const params = new URLSearchParams();
  (state.categories || []).forEach(c => params.append('category', c));
  if (state.q) params.set('q', state.q);
  if (state.sort && state.sort !== 'popular') params.set('sort', state.sort);
  const qs = params.toString();
  return qs ? `shop.html?${qs}` : 'shop.html';
}

/* ══════════════════════════════════════════════════════
   GIFT BOXES PAGE
══════════════════════════════════════════════════════ */

async function initGiftbox() {
  showLoading('giftbox-grid');

  await loadProducts();
  const boxes = getByCategory('Gift Boxes');
  renderGiftBoxGrid(boxes, 'giftbox-grid', product => {
    addToCart(product);
    showToast(`${product.name} added to cart!`);
  });
}

/* ══════════════════════════════════════════════════════
   PRODUCT DETAIL PAGE
══════════════════════════════════════════════════════ */

async function initProduct() {
  const params = new URLSearchParams(window.location.search);
  const productId = params.get('id');

  if (!productId) {
    document.getElementById('product-detail').innerHTML = `
      <div class="empty-state" style="padding:3rem;">
        <div class="empty-icon"><i data-lucide="package-search"></i></div>
        <h3>Product not found</h3>
        <a href="shop.html" class="btn-primary">Browse Products</a>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  await loadProducts();
  const product = getProductById(productId);

  if (!product) {
    document.getElementById('product-detail').innerHTML = `
      <div class="empty-state" style="padding:3rem;">
        <div class="empty-icon"><i data-lucide="package-search"></i></div>
        <h3>Product not found</h3>
        <a href="shop.html" class="btn-primary">Browse Products</a>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  // Populate product detail
  document.title = `${product.name} — Sivakasi666crackers`;

  const detail = document.getElementById('product-detail');
  if (!detail) return;

  const inCartQty = getCartItemQty(product.id);

  detail.innerHTML = `
    <div class="product-detail-grid">
      <div class="pd-img-col">
        <div class="pd-img-wrap">
          ${product.discountPercent ? `<span class="discount-badge large">-${product.discountPercent}%</span>` : ''}
          <img id="pd-main-img" src="${product.image}" alt="${product.name}"
               onerror="this.src='images/placeholder.svg'" />
        </div>
      </div>
      <div class="pd-info-col">
        <div class="pd-category-chip">${product.category}</div>
        <h1 class="pd-name">${product.name}</h1>
        ${renderBadge(product.badge)}
        <div class="pd-rating">
          ${renderStars(product.rating)}
          <span class="pd-review-count">(${Math.floor(product.rating * 23)} reviews)</span>
        </div>
        <div class="pd-pricing">
          <span class="pd-price">&#8377;${product.price.toLocaleString('en-IN')}</span>
          ${product.mrp ? `
            <span class="pd-mrp">&#8377;${product.mrp.toLocaleString('en-IN')}</span>
            <span class="pd-discount-label">${product.discountPercent}% off</span>
          ` : ''}
        </div>
        <div class="pd-unit">Unit: ${product.unit}</div>
        <div class="pd-stock ${product.inStock ? 'in-stock' : 'no-stock'}">
          ${product.inStock
            ? '<i data-lucide="check-circle"></i> In Stock'
            : '<i data-lucide="x-circle"></i> Out of Stock'
          }
        </div>
        <div class="pd-desc">
          <h2 class="pd-desc-label">Description</h2>
          <p>${product.description}</p>
        </div>
        <div class="pd-qty-row">
          <label for="pd-qty-input" class="pd-qty-label">Quantity:</label>
          <div class="qty-stepper">
            <button class="qty-btn" id="pd-qty-minus" aria-label="Decrease quantity">−</button>
            <input type="number" id="pd-qty-input" value="1" min="1" max="99" aria-label="Quantity" />
            <button class="qty-btn" id="pd-qty-plus" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <div class="pd-actions">
          <button class="btn-primary pd-add-cart" id="pd-add-to-cart-btn"
                  ${!product.inStock ? 'disabled' : ''}>
            <i data-lucide="shopping-cart"></i> Add to Cart
          </button>
          <button class="btn-secondary pd-buy-now" id="pd-buy-now-btn"
                  ${!product.inStock ? 'disabled' : ''}>
            <i data-lucide="zap"></i> Buy Now
          </button>
        </div>
        ${inCartQty > 0 ? `<div class="pd-in-cart-note">Already in cart: ${inCartQty}</div>` : ''}
      </div>
    </div>
  `;

  // Quantity stepper logic
  const qtyInput = document.getElementById('pd-qty-input');
  document.getElementById('pd-qty-minus').addEventListener('click', () => {
    if (qtyInput.value > 1) qtyInput.value--;
  });
  document.getElementById('pd-qty-plus').addEventListener('click', () => {
    if (qtyInput.value < 99) qtyInput.valueAsNumber++;
  });

  // Add to Cart
  document.getElementById('pd-add-to-cart-btn').addEventListener('click', () => {
    const qty = parseInt(qtyInput.value) || 1;
    addToCart(product, qty);
    showToast(`${product.name} added to cart!`);

    // Update in-cart note
    const note = detail.querySelector('.pd-in-cart-note');
    const newQty = getCartItemQty(product.id);
    if (note) {
      note.textContent = `Already in cart: ${newQty}`;
    } else {
      const actionsDiv = detail.querySelector('.pd-actions');
      const noteEl = document.createElement('div');
      noteEl.className = 'pd-in-cart-note';
      noteEl.textContent = `Already in cart: ${newQty}`;
      actionsDiv.insertAdjacentElement('afterend', noteEl);
    }
  });

  // Buy Now — add then redirect to cart
  document.getElementById('pd-buy-now-btn').addEventListener('click', () => {
    const qty = parseInt(qtyInput.value) || 1;
    addToCart(product, qty);
    window.location.href = 'cart.html';
  });

  // Related products
  // Apply Lucide icons to the newly injected product detail HTML
  if (window.lucide) lucide.createIcons();

  showLoading('related-products-row');
  const related = getRelatedProducts(productId, 6);
  renderProductRow(related, 'related-products-row', p => {
    addToCart(p);
    showToast(`${p.name} added to cart!`);
  });
}

/* ══════════════════════════════════════════════════════
   CART PAGE
══════════════════════════════════════════════════════ */

function initCart() {
  _renderCartPage();

  // Continue Shopping → restore last shop filters
  const contLink = document.getElementById('cart-continue-link');
  if (contLink) {
    let state = null;
    try {
      state = JSON.parse(sessionStorage.getItem(SHOP_STATE_KEY) || 'null');
    } catch (e) { /* ignore */ }
    contLink.href = _buildShopUrl(state || { categories: [] });
  }

  // WhatsApp button
  const waBtn = document.getElementById('whatsapp-order-btn');
  if (waBtn) {
    waBtn.addEventListener('click', () => {
      const url = buildWhatsAppURL();
      if (url) {
        window.open(url, '_blank');
      } else {
        showToast('Your cart is empty!');
      }
    });
  }

  // Call button
  const callBtn = document.getElementById('call-order-btn');
  if (callBtn) {
    callBtn.href = getCallURL();
  }

  // Clear cart
  const clearBtn = document.getElementById('clear-cart-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear your entire cart?')) {
        clearCart();
        _renderCartPage();
      }
    });
  }

  // Listen for cart updates
  document.addEventListener('cartUpdated', () => {
    _renderCartPage();
  });
}

function _renderCartPage() {
  const items = getCart();
  const container = document.getElementById('cart-items-container');
  const orderPanel = document.getElementById('cart-order-panel');
  const emptyState = document.getElementById('cart-empty-state');

  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = '';
    if (orderPanel) orderPanel.style.display = 'none';
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (orderPanel) orderPanel.style.display = 'block';

  container.innerHTML = '';
  items.forEach(item => {
    const row = renderCartItem(item);

    row.querySelector('.qty-minus').addEventListener('click', () => {
      updateCartQty(item.id, getCartItemQty(item.id) - 1);
    });
    row.querySelector('.qty-plus').addEventListener('click', () => {
      updateCartQty(item.id, getCartItemQty(item.id) + 1);
    });
    row.querySelector('.cart-remove-btn').addEventListener('click', () => {
      removeFromCart(item.id);
    });

    container.appendChild(row);
  });

  // Update totals
  const count = getCartCount();
  const total = getCartTotal();

  const itemCountEl = document.getElementById('cart-item-count');
  const subtotalEl  = document.getElementById('cart-subtotal');
  const totalEl     = document.getElementById('cart-total');

  if (itemCountEl) itemCountEl.textContent = `${count} item${count !== 1 ? 's' : ''}`;
  if (subtotalEl)  subtotalEl.textContent  = `\u20B9${total.toLocaleString('en-IN')}`;
  if (totalEl)     totalEl.textContent     = `\u20B9${total.toLocaleString('en-IN')}`;
}

/* ══════════════════════════════════════════════════════
   ABOUT PAGE
══════════════════════════════════════════════════════ */

function initAbout() {
  animateStatCounters();
}

/* ── Animated stat counters ─────────────────────────── */

function animateStatCounters() {
  const counters = document.querySelectorAll('.stat-count');
  if (!counters.length) return;

  const duration = 5000;

  const animate = (el) => {
    const target = parseInt(el.dataset.count, 10) || 0;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(target * eased).toLocaleString('en-IN');
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  };

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animate(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(c => io.observe(c));
  } else {
    counters.forEach(c => {
      c.textContent = (parseInt(c.dataset.count, 10) || 0).toLocaleString('en-IN');
    });
  }
}

/* ══════════════════════════════════════════════════════
   TOAST NOTIFICATION
══════════════════════════════════════════════════════ */

let _toastTimer = null;

function showToast(message, duration = 2500) {
  let toast = document.getElementById('global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'global-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add('show');

  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

