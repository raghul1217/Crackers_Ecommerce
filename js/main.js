/**
 * main.js â€” Page-specific initialization logic
 * Detects current page and bootstraps the correct init function
 */

/* â”€â”€ Page Detection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

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
        window.location.href = `shop?q=${encodeURIComponent(navSearch.value.trim())}`;
      }
    });
  }

  switch (PAGE) {
    case 'home':    await initHome();    break;
    case 'shop':    await initShop();    break;
    case 'cart':    initCart();          break;
    case 'about':   initAbout();         break;
    case 'giftbox': await initGiftbox(); break;
    default: break;
  }

  // Auto-refresh: reflect sheet re-exports without a page reload
  setTimeout(_checkAndRefresh, 800);
  setInterval(_checkAndRefresh, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _checkAndRefresh();
  });
});

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   HOME PAGE
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

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
        ? 'giftbox'
        : `shop?category=${encodeURIComponent(cat)}`;
    }
  );

  // Bestsellers row
  const bestsellers = getBestsellers(10);
  renderProductRow(bestsellers, 'bestsellers-row', product => {
    addToCart(product);
    showToast(`${product.name} added to cart!`);
  }); // _applyIcons called inside renderProductRow

  // Combos row â€” if none found, show newest products
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
 * @param {string} rowId â€” id of the scrollable .products-row element
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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   SHOP PAGE
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

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

  // Manual refresh button (re-fetch from products.json)
  const refreshBtn = document.getElementById('shop-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshBtn.classList.add('spinning');
      _forceRefresh().finally(() => {
        setTimeout(() => refreshBtn.classList.remove('spinning'), 700);
      });
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

  renderProductTable(results, 'products-grid'); // _applyIcons called inside renderProductTable

  _saveShopState();
}

/* â”€â”€ Shop state persistence (for "Continue Shopping") â”€â”€ */

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
  return qs ? `shop?${qs}` : 'shop';
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   PRODUCT AUTO-REFRESH (reflect sheet re-exports live)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

function _refreshHome() {
  const all = getByCategories([]);
  renderCategoryGrid(getCategories(), 'category-grid');
  renderCategoryChips(
    getCategories(),
    'home-category-chips',
    'All',
    cat => {
      window.location.href = cat === 'Gift Boxes'
        ? 'giftbox'
        : `shop?category=${encodeURIComponent(cat)}`;
    }
  );
  renderProductRow(getBestsellers(10), 'bestsellers-row', product => {
    addToCart(product);
    showToast(`${product.name} added to cart!`);
  });
  let combos = getCombos(10);
  if (!combos.length) {
    combos = all.filter(p => p.badge === 'New').slice(0, 8);
  }
  renderProductRow(combos, 'combos-row', product => {
    addToCart(product);
    showToast(`${product.name} added to cart!`);
  });
  initCarousel('bestsellers-row');
  initCarousel('combos-row');
}

async function _refreshCurrentPage() {
  switch (PAGE) {
    case 'home':
      _refreshHome();
      break;
    case 'shop':
      _applyShopFilters();
      break;
    case 'giftbox':
      renderGiftBoxGrid(getByCategory('Gift Boxes'), 'giftbox-grid', product => {
        addToCart(product);
        showToast(`${product.name} added to cart!`);
      });
      break;
    default:
      return;
  }
  if (window.lucide) lucide.createIcons();
}

async function _checkAndRefresh() {
  try {
    if (await checkForLiveUpdates()) {
      await _refreshCurrentPage();
      showToast('Products updated');
    }
  } catch (e) { /* ignore */ }
}

async function _forceRefresh() {
  let ok = await checkForLiveUpdates();
  if (!ok) ok = await forceReloadProducts();
  if (!ok) {
    showToast('Could not refresh products');
    return;
  }
  await _refreshCurrentPage();
  showToast('Products updated');
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   GIFT BOXES PAGE
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

async function initGiftbox() {
  showLoading('giftbox-grid');

  await loadProducts();
  const boxes = getByCategory('Gift Boxes');
  renderGiftBoxGrid(boxes, 'giftbox-grid', product => {
    addToCart(product);
    showToast(`${product.name} added to cart!`);
  });
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   CART PAGE
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

function initCart() {
  _renderCartPage();

  // Continue Shopping â†’ restore last shop filters
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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ABOUT PAGE
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

function initAbout() {
  animateStatCounters();
}

/* â”€â”€ Animated stat counters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   TOAST NOTIFICATION
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

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

