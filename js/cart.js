/**
 * cart.js — Cart management with localStorage persistence
 * Handles add/remove/update, totals, WhatsApp message generation
 */

const CART_KEY = 'sivakasi666_cart';
const CUSTOMER_KEY = 'sivakasi666_customer';
const ORDERS_API = '/api/orders';
const SHOP_PHONE = '919345546946'; // sivakasi666crackers Pattasu Kadai WhatsApp order number
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
      mrp:   product.mrp,
      image: product.image,
      unit:  product.unit,
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

/* ── Customer details ────────────────────────────────── */

/** Read the saved customer name + mobile. */
function getCustomer() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOMER_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

/** Persist the customer name, mobile and address so they only type it once. */
function saveCustomer(name, mobile, address) {
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ name, mobile, address }));
  } catch { /* ignore */ }
}

const MOBILE_RE = /^[6-9]\d{9}$/;

/**
 * Reduce whatever the customer pasted into a bare 10-digit mobile number.
 * Tolerates +91 / 0091 / 091 prefixes, spaces, dashes and brackets, e.g.
 * "+91 98430-29619" -> "9843029619".
 * @param {string} raw
 * @returns {string} digits only, capped at 10
 */
function normalizeMobile(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length <= 10) return digits;
  // Longer than 10: strip a 00/0/091 country-code prefix, else a stray trunk 0.
  const trimmed = digits.replace(/^0+/, '');
  if (trimmed.length === 12 && trimmed.startsWith('91')) return trimmed.slice(2);
  return trimmed.length === 10 ? trimmed : digits.slice(0, 10);
}

/**
 * Validate the customer details needed to record an order.
 * On failure, `field` names the offending input so the UI can point at it.
 * @returns {{ok: boolean, name: string, mobile: string, address: string, field: string|null, error: string}}
 */
function validateCustomer(name, mobile, address) {
  const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
  const cleanMobile = normalizeMobile(mobile);
  const cleanAddress = String(address || '').trim().replace(/\s+/g, ' ').slice(0, 250);

  const fail = (field, error) => ({
    ok: false, name: '', mobile: '', address: '', field, error,
  });

  if (!cleanName) return fail('name', 'Please enter your name.');
  if (cleanName.length > 120) return fail('name', 'Name is too long (120 characters max).');
  if (!cleanMobile) return fail('mobile', 'Please enter your mobile number.');
  if (!MOBILE_RE.test(cleanMobile)) {
    return fail('mobile', 'Enter a 10-digit mobile number starting with 6-9.');
  }
  if (!cleanAddress) return fail('address', 'Please enter your delivery address.');
  if (cleanAddress.length < 6) {
    return fail('address', 'Address is too short — add your street, area and town.');
  }
  return {
    ok: true, name: cleanName, mobile: cleanMobile, address: cleanAddress, field: null, error: '',
  };
}

/**
 * Record the order in orders.json via the API so it shows up in the admin panel.
 * Never throws — a failed submission must not block the WhatsApp sale.
 * @param {{name: string, mobile: string, address: string}} customer
 * @returns {Promise<{ok: boolean, orderId: string|null, error: string}>}
 */
async function submitOrder(customer) {
  const items = getCart().map(item => ({
    id: item.id,
    name: item.name,
    content: item.unit || '',
    qty: item.qty,
    rate: item.mrp || item.price,
    finalRate: item.price,
  }));
  if (!items.length) return { ok: false, orderId: null, error: 'Your cart is empty!' };

  const payload = {
    customerName: customer.name,
    mobile: customer.mobile,
    address: customer.address,
    items,
  };

  // One retry: the server re-reads orders.json on every call, so a replay is safe.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(ORDERS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.order) return { ok: true, orderId: data.order.id, error: '' };

      const msg = data.error || ('Could not save order (' + res.status + ')');
      // 409 = GitHub SHA clash, worth one replay. Anything else is not.
      if (res.status !== 409) return { ok: false, orderId: null, error: msg };
    } catch (err) {
      return { ok: false, orderId: null, error: 'Could not reach the server.' };
    }
  }
  return { ok: false, orderId: null, error: 'Could not save order. Please try again.' };
}

/* ── WhatsApp / Call ────────────────────────────────── */

/**
 * Build a WhatsApp-ready pre-filled message URL
 * @param {{name?: string, mobile?: string, address?: string, orderId?: string}} [customer]
 */
function buildWhatsAppURL(customer) {
  const items = getCart();
  if (!items.length) return null;

  const who = customer || getCustomer();

  let msg = `*${SHOP_NAME} -- New Order*\n\n`;
  if (who.orderId) msg += `*Order No:* ${who.orderId}\n`;
  if (who.name) msg += `*Name:* ${who.name}\n`;
  if (who.mobile) msg += `*Mobile:* +91 ${who.mobile}\n`;
  if (who.address) msg += `*Address:* ${who.address}\n`;
  msg += `\n*Order Summary:*\n`;
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
