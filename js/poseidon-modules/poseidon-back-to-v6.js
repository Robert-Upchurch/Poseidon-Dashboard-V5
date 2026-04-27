/* ═══════════════════════════════════════════════════════════════════
   POSEIDON — "Back to V6" Floating Button
   Drop this script into any dashboard page and it renders a fixed
   floating button linking back to the Poseidon V6 Dashboard.

   Usage (any dashboard):
     <script src="https://robert-upchurch.github.io/Poseidon/js/poseidon-modules/poseidon-back-to-v6.js" defer></script>

   Auto-detects the V6 URL via (in order):
     1) window.POSEIDON_V6_URL   ← highest priority, set before the script loads
     2) sessionStorage.poseidon_v6_origin  ← set by the V6 Directory when launching this page
     3) query param ?poseidon_return_to=<url>   ← set by V6 Directory as a fallback
     4) https://robert-upchurch.github.io/Poseidon/poseidon-dashboard-v6.html  ← production default
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__POSEIDON_BACK_BTN_LOADED__) return;
  window.__POSEIDON_BACK_BTN_LOADED__ = true;

  const DEFAULT_V6 = 'https://robert-upchurch.github.io/Poseidon/poseidon-dashboard-v6.html';

  function getQueryParam(name) {
    try { return new URLSearchParams(location.search).get(name); } catch (_) { return null; }
  }

  function resolveV6Url() {
    if (typeof window.POSEIDON_V6_URL === 'string' && window.POSEIDON_V6_URL) return window.POSEIDON_V6_URL;
    try {
      const stored = sessionStorage.getItem('poseidon_v6_origin');
      if (stored) return stored;
    } catch (_) {}
    const qp = getQueryParam('poseidon_return_to');
    if (qp) { try { return decodeURIComponent(qp); } catch (_) { return qp; } }
    return DEFAULT_V6;
  }

  // Don't self-render if we ARE the V6 dashboard
  function isV6DashboardPage() {
    try {
      if (/poseidon-dashboard-v6(\.html)?$/i.test(location.pathname)) return true;
      if (document.title && /Poseidon Dashboard V6/i.test(document.title)) return true;
    } catch (_) {}
    return false;
  }

  // Don't render inside an iframe — V6's own nav is already visible
  // above the iframe, so a "Back to V6" button inside the iframe is
  // redundant AND it covers the iframe page's own title (the J1 Housing
  // Finder header in particular). The button is still useful when the
  // sub-page is opened in its own tab or popped out, where window.top
  // === window.self.
  function isInsideIframe() {
    try { return window.top !== window.self; } catch (_) { return true; }
  }

  function injectStyle() {
    if (document.getElementById('poseidon-back-to-v6-style')) return;
    const css = `
      #poseidon-back-to-v6 {
        position: fixed;
        top: 14px;
        left: 14px;
        z-index: 2147483646;
        background: linear-gradient(135deg, #14b8a6, #0d9488);
        color: #ffffff;
        font-family: 'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.01em;
        text-decoration: none;
        padding: 9px 14px;
        border-radius: 999px;
        box-shadow: 0 8px 24px rgba(13, 148, 136, 0.45), 0 0 0 1px rgba(94, 234, 212, 0.35) inset;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        transition: transform 0.15s ease, filter 0.15s ease, box-shadow 0.15s ease;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
      }
      #poseidon-back-to-v6:hover {
        filter: brightness(1.08);
        transform: translateY(-1px);
        box-shadow: 0 12px 30px rgba(13, 148, 136, 0.55), 0 0 0 1px rgba(94, 234, 212, 0.5) inset;
      }
      #poseidon-back-to-v6 .pb-arrow {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: rgba(255,255,255,0.18);
        font-size: 13px;
        line-height: 1;
      }
      #poseidon-back-to-v6 .pb-trident { font-size: 14px; margin-right: -2px; }
      #poseidon-back-to-v6.pb-mini { top: 10px; left: 10px; padding: 7px 10px; font-size: 11.5px; gap: 6px; }
      @media (max-width: 640px) {
        #poseidon-back-to-v6 { top: 10px; left: 10px; padding: 8px 12px; font-size: 12px; gap: 6px; }
        #poseidon-back-to-v6 .label-long { display: none; }
      }
      @media print {
        #poseidon-back-to-v6 { display: none !important; }
      }
    `;
    const style = document.createElement('style');
    style.id = 'poseidon-back-to-v6-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function render() {
    if (isV6DashboardPage()) return;
    if (isInsideIframe()) return;
    if (document.getElementById('poseidon-back-to-v6')) return;
    injectStyle();

    const url = resolveV6Url();
    const a = document.createElement('a');
    a.id = 'poseidon-back-to-v6';
    a.href = url;
    a.title = 'Return to Poseidon V6 Dashboard';
    a.innerHTML = `
      <span class="pb-arrow">←</span>
      <span class="pb-trident">🔱</span>
      <span class="label-long">Back to Poseidon V6</span>
    `;
    // Let click-through Ctrl/Cmd-click behave normally; default href navigation
    document.body.appendChild(a);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

  // Public helper so other scripts can reposition / re-render / set URL on the fly
  window.PoseidonBackToV6 = {
    setUrl(u) {
      try { window.POSEIDON_V6_URL = u; } catch (_) {}
      const el = document.getElementById('poseidon-back-to-v6');
      if (el) el.href = u;
    },
    render
  };
})();
