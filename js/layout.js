/**
 * layout.js — Injects the shared header.html / footer.html partials
 * into the #site-header / #site-footer placeholders on every page,
 * then wires up the mobile nav toggle, active page highlighting
 * and the cart UI sync.
 */

let _layoutPromise = null;

async function _loadPartial(id, url) {
  const mount = document.getElementById(id);
  if (!mount) return;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
    mount.innerHTML = await res.text();
  } catch (err) {
    console.error('[layout.js]', err.message);
  }
}

function _setActiveNav() {
  const map = { home: 'index.html', shop: 'shop.html', product: 'shop.html', about: 'about.html', giftbox: 'giftbox.html' };
  const target = map[document.body.dataset.page];
  if (!target) return;
  document.querySelectorAll('.desktop-nav a, .mobile-nav-menu a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === target);
  });
}

function _initMobileMenu() {
  const menuToggle = document.getElementById('mobile-menu-toggle');
  const mobileNav = document.getElementById('mobile-nav-menu');
  if (!menuToggle || !mobileNav) return;

  menuToggle.addEventListener('click', () => {
    const isOpen = mobileNav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', isOpen);
  });

  document.addEventListener('click', e => {
    if (!menuToggle.contains(e.target) && !mobileNav.contains(e.target)) {
      mobileNav.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
    }
  });
}

function initLayout() {
  if (!_layoutPromise) {
    _layoutPromise = (async () => {
      await Promise.all([
        _loadPartial('site-header', 'header.html'),
        _loadPartial('site-footer', 'footer.html'),
      ]);
      _setActiveNav();
      _initMobileMenu();
      if (window.lucide) lucide.createIcons();
      if (typeof _updateCartUI === 'function') _updateCartUI();
    })();
  }
  return _layoutPromise;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initLayout());
} else {
  initLayout();
}
