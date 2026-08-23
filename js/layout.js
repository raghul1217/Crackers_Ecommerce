/**
 * layout.js â€” Injects the shared header.html / footer.html partials
 * into the #site-header / #site-footer placeholders on every page,
 * then wires up the mobile nav toggle, active page highlighting
 * and the cart UI sync.
 */

let _layoutPromise = null;

async function _loadPartial(id, url) {
  const mount = document.getElementById(id);
  if (!mount) return;
  try {
    // .html URL first; works both with and without Vercel cleanUrls
    // (with cleanUrls enabled, /header.html 308-redirects to /header and fetch follows it)
    let res = await fetch(`${url}.html`);
    if (!res.ok && url.endsWith('.html')) res = await fetch(url.replace(/\.html$/, ''));
    if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
    mount.innerHTML = await res.text();
  } catch (err) {
    console.error('[layout.js]', err.message);
  }
}

function _setActiveNav() {
  const map = { home: '/', shop: 'shop', product: 'shop', about: 'about', giftbox: 'giftbox' };
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

function _initNoticeMarquee() {
  const track = document.querySelector('.site-notice-track');
  if (!track) return;
  const items = track.querySelectorAll(':scope > .site-notice-item');
  if (items.length === 1) {
    const clone = items[0].cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    track.appendChild(clone);
  }
}

function initLayout() {
  if (!_layoutPromise) {
    _layoutPromise = (async () => {
      await Promise.all([
        _loadPartial('site-header', 'header'),
        _loadPartial('site-footer', 'footer'),
      ]);
      _setActiveNav();
      _initMobileMenu();
      _initNoticeMarquee();
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
