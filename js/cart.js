/**
 * cart.js — Cart management with localStorage persistence
 * Handles add/remove/update, totals, WhatsApp message generation
 */

const CART_KEY = 'sivakasi666_cart';
const SHOP_PHONE = '919843029619'; // sivakasi666crackers Pattasu Kadai WhatsApp order number
const SHOP_NAME  = 'sivakasi666crackers Pattasu Kadai';

// Internal cart state: { [productId]: { id, qty, price, name } }
let _cart = {};

/* ── Init & Persistence ─────────────────────────────── */

/** Load cart from localStorage on startup */
function cartInit() {
  try {
    const stored = localStorage.getItem(CART_KEY);
    _cart = stored ? JSON.parse(stored) : {};
  } catch {
    _cart = {};
  }
}

/** Save current cart state to localStorage */
function _saveCart() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(_cart));
  } catch (err) {
    console.error('[cart.js] Failed to save cart:', err);
  }
}

/* ── Core Operations ────────────────────────────────── */

/**
 * Add a product to the cart (or increase qty if already present)
 * @param {Object} product — full product object (from crackers_list.xlsx)
 * @param {number} qty
 */
function addToCart(product, qty = 1) {
  if (!product || !product.id) return;
  if (_cart[product.id]) {
    _cart[product.id].qty += qty;
  } else {
    _cart[product.id] = {
      id:    product.id,
      name:  product.name,
      price: product.price,
      image: product.image,
      qty:   qty,
    };
  }
  _saveCart();
  _updateCartUI();
}

/**
 * Remove a product entirely from cart
 * @param {string} productId
 */
function removeFromCart(productId) {
  delete _cart[productId];
  _saveCart();
  _updateCartUI();
}

/**
 * Update quantity of a cart item (set to 0 or below = remove)
 * @param {string} productId
 * @param {number} newQty
 */
function updateCartQty(productId, newQty) {
  if (newQty <= 0) {
    removeFromCart(productId);
    return;
  }
  if (_cart[productId]) {
    _cart[productId].qty = newQty;
    _saveCart();
    _updateCartUI();
  }
}

/** Clear the entire cart */
function clearCart() {
  _cart = {};
  _saveCart();
  _updateCartUI();
}

/* ── Read Helpers ───────────────────────────────────── */

/** Returns array of cart items */
function getCart() {
  return Object.values(_cart);
}

/** Total number of items in cart (sum of qty) */
function getCartCount() {
  return Object.values(_cart).reduce((sum, item) => sum + item.qty, 0);
}

/** Total price of all cart items */
function getCartTotal() {
  return Object.values(_cart).reduce(
    (sum, item) => sum + item.price * item.qty,
    0
  );
}

/** Check if a product is in the cart */
function isInCart(productId) {
  return !!_cart[productId];
}

/** Get qty of specific product in cart */
function getCartItemQty(productId) {
  return _cart[productId]?.qty || 0;
}

/* ── WhatsApp / Call ────────────────────────────────── */

/**
 * Build a WhatsApp-ready pre-filled message URL
 */
function buildWhatsAppURL() {
  const items = getCart();
  if (!items.length) return null;

  let msg = `*${SHOP_NAME} -- New Order*\n\n`;
  msg += `*Order Summary:*\n`;
  msg += `-------------------\n`;

  items.forEach((item, i) => {
    const lineTotal = item.price * item.qty;
    msg += `${i + 1}. ${item.name}\n`;
    msg += `   Qty: ${item.qty} x Rs.${item.price.toLocaleString('en-IN')} = *Rs.${lineTotal.toLocaleString('en-IN')}*\n`;
  });

  msg += `-------------------\n`;
  msg += `*Total: Rs.${getCartTotal().toLocaleString('en-IN')}*\n\n`;
  msg += `Please confirm availability and arrange delivery/pickup. Thank you!`;

  const encoded = encodeURIComponent(msg);
  return `https://wa.me/${SHOP_PHONE}?text=${encoded}`;
}

/** Returns tel: link for one-tap calling */
function getCallURL() {
  return `tel:+${SHOP_PHONE}`;
}

/* ── UI Sync Helpers ────────────────────────────────── */

/**
 * Update all cart-related UI elements across any page:
 * - Cart badge count in header
 * - Sticky "View Cart" bar (shows/hides)
 */
function _updateCartUI() {
  const count = getCartCount();

  // Update all badge elements
  document.querySelectorAll('[data-cart-badge]').forEach(el => {
    el.textContent = count;
    el.style.display = count > 0 ? 'flex' : 'none';
  });

  // Sticky bottom cart bar (hidden on the cart page itself)
  const bar = document.getElementById('sticky-cart-bar');
  if (bar) {
    const onCartPage = document.body.dataset.page === 'cart';
    if (count > 0 && !onCartPage) {
      bar.classList.add('visible');
      const totalEl = bar.querySelector('[data-cart-total]');
      if (totalEl) totalEl.textContent = `\u20B9${getCartTotal().toLocaleString('en-IN')}`;
      const countEl = bar.querySelector('[data-cart-count]');
      if (countEl) countEl.textContent = `${count} item${count !== 1 ? 's' : ''}`;
    } else {
      bar.classList.remove('visible');
    }
  }

  // Dispatch event for pages that need to react
  document.dispatchEvent(new CustomEvent('cartUpdated', { detail: { count } }));
}

/* ── Public init ────────────────────────────────────── */
cartInit(); // Auto-load cart on script parse
