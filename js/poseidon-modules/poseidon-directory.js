/* ═══════════════════════════════════════════════════════════════════
   POSEIDON — DIRECTORY
   Searchable manifest of every internal link, sub-program, and
   external integration. Loaded from /config/directory.json.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const CONFIG_URL = 'config/directory.json';
  let DIR = null;
  let modalEl = null;
  let activeCategory = 'all';
  let activeDivision = 'all';
  let searchQuery = '';

  const STYLE_ID = 'poseidon-directory-style';
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      #poseidon-directory-modal{position:fixed;inset:0;z-index:9998;display:none;font-family:'Inter',system-ui,sans-serif;}
      #poseidon-directory-modal.active{display:flex;align-items:center;justify-content:center;}
      #poseidon-directory-modal .pd-backdrop{position:absolute;inset:0;background:rgba(5,11,22,0.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}
      #poseidon-directory-modal .pd-panel{position:relative;background:linear-gradient(160deg,#0f1e2e,#122336);border:1px solid rgba(20,184,166,0.30);border-radius:16px;width:min(960px,calc(100vw - 24px));max-height:calc(100vh - 60px);display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,0.6);color:#e2e8f0;overflow:hidden;}
      #poseidon-directory-modal .pd-head{padding:18px 22px;border-bottom:1px solid rgba(148,163,184,0.14);display:flex;gap:14px;align-items:center;flex-wrap:wrap;}
      #poseidon-directory-modal .pd-title{font-size:1.15rem;font-weight:800;letter-spacing:-0.02em;flex:1;display:flex;gap:10px;align-items:center;color:#f1f5f9;}
      #poseidon-directory-modal .pd-badge{background:rgba(20,184,166,0.18);color:#2dd4bf;font-size:10px;font-weight:700;padding:3px 8px;border-radius:4px;letter-spacing:0.1em;text-transform:uppercase;}
      #poseidon-directory-modal .pd-close{background:transparent;border:0;color:#94a3b8;font-size:22px;cursor:pointer;padding:4px 10px;border-radius:6px;}
      #poseidon-directory-modal .pd-close:hover{background:rgba(148,163,184,0.1);color:#f1f5f9;}
      #poseidon-directory-modal .pd-search{width:100%;background:#0a1628;border:1px solid rgba(148,163,184,0.18);border-radius:10px;padding:12px 14px 12px 38px;color:#e2e8f0;font-size:14px;font-family:inherit;outline:none;background-image:url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="%2394a3b8" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>');background-repeat:no-repeat;background-position:12px center;}
      #poseidon-directory-modal .pd-search:focus{border-color:#14b8a6;box-shadow:0 0 0 3px rgba(20,184,166,0.15);}
      #poseidon-directory-modal .pd-tabs{padding:0 22px;display:flex;gap:6px;overflow-x:auto;border-bottom:1px solid rgba(148,163,184,0.08);scrollbar-width:thin;}
      #poseidon-directory-modal .pd-tab{background:transparent;border:0;color:#94a3b8;padding:12px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;border-bottom:2px solid transparent;font-family:inherit;letter-spacing:0.02em;}
      #poseidon-directory-modal .pd-tab:hover{color:#e2e8f0;}
      #poseidon-directory-modal .pd-tab.active{color:#2dd4bf;border-bottom-color:#14b8a6;}
      #poseidon-directory-modal .pd-body{flex:1;overflow-y:auto;padding:18px 22px 26px;}
      #poseidon-directory-modal .pd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;}
      #poseidon-directory-modal .pd-card{background:rgba(15,30,46,0.6);border:1px solid rgba(148,163,184,0.14);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:8px;transition:all 0.18s;text-decoration:none;color:inherit;cursor:pointer;}
      #poseidon-directory-modal .pd-card:hover{border-color:rgba(20,184,166,0.55);transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.35);}
      #poseidon-directory-modal .pd-card .pd-card-top{display:flex;justify-content:space-between;align-items:center;gap:8px;}
      #poseidon-directory-modal .pd-name{font-size:14px;font-weight:700;color:#f1f5f9;line-height:1.3;}
      #poseidon-directory-modal .pd-desc{font-size:12px;color:#94a3b8;line-height:1.55;}
      #poseidon-directory-modal .pd-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto;}
      #poseidon-directory-modal .pd-chip{font-size:10px;font-weight:600;padding:3px 8px;border-radius:4px;letter-spacing:0.04em;}
      #poseidon-directory-modal .pd-chip-internal{background:rgba(20,184,166,0.15);color:#2dd4bf;}
      #poseidon-directory-modal .pd-chip-external{background:rgba(59,130,246,0.15);color:#60a5fa;}
      #poseidon-directory-modal .pd-chip-folder{background:rgba(245,158,11,0.15);color:#fbbf24;}
      #poseidon-directory-modal .pd-chip-document{background:rgba(217,70,239,0.15);color:#e879f9;}
      #poseidon-directory-modal .pd-chip-division{background:rgba(148,163,184,0.12);color:#cbd5e1;}
      #poseidon-directory-modal .pd-empty{padding:40px 20px;text-align:center;color:#64748b;}
      #poseidon-directory-modal .pd-section{margin-top:18px;}
      #poseidon-directory-modal .pd-section:first-child{margin-top:0;}
      #poseidon-directory-modal .pd-section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;margin-bottom:10px;display:flex;align-items:center;gap:8px;}
      #poseidon-directory-modal .pd-meta{font-size:11px;color:#64748b;padding:14px 22px;border-top:1px solid rgba(148,163,184,0.08);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;}
      @media (max-width:640px){
        #poseidon-directory-modal .pd-panel{width:100%;height:100%;max-height:100vh;border-radius:0;border:0;}
        #poseidon-directory-modal .pd-head{padding:14px 16px;}
        #poseidon-directory-modal .pd-body{padding:14px 16px 20px;}
      }
    `;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  async function loadConfig() {
    if (DIR) return DIR;
    try {
      const res = await fetch(CONFIG_URL, { cache: 'no-cache' });
      DIR = await res.json();
    } catch (e) {
      console.warn('[Poseidon Directory] config fetch failed', e);
      DIR = { categories: [] };
    }
    return DIR;
  }

  function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function render() {
    if (!modalEl || !DIR) return;
    const body = modalEl.querySelector('.pd-body');
    const q = searchQuery.trim().toLowerCase();

    let totalMatches = 0;
    let html = '';
    (DIR.categories || []).forEach(cat => {
      if (activeCategory !== 'all' && activeCategory !== cat.id) return;
      const matches = (cat.entries || []).filter(e => {
        if (activeDivision !== 'all' && (e.division || '').toLowerCase() !== activeDivision.toLowerCase()) return false;
        if (!q) return true;
        const hay = `${e.name} ${e.description} ${e.url} ${e.division} ${cat.label}`.toLowerCase();
        return hay.includes(q);
      });
      if (!matches.length) return;
      totalMatches += matches.length;

      html += `<div class="pd-section">
        <div class="pd-section-title">${escapeHtml(cat.label)} <span style="font-weight:500;color:#475569">· ${matches.length}</span></div>
        <div class="pd-grid">
          ${matches.map(e => {
            const chip = `pd-chip-${e.type || 'internal'}`;
            const safeUrl = escapeHtml(e.url || '#');
            const isExternal = /^https?:\/\//i.test(e.url || '');
            const tgt = isExternal ? 'target="_blank" rel="noopener"' : '';
            const dataOrigin = !isExternal ? ' data-poseidon-internal="1"' : '';
            return `
              <a class="pd-card" href="${safeUrl}" ${tgt}${dataOrigin}>
                <div class="pd-card-top">
                  <div class="pd-name">${escapeHtml(e.name)}</div>
                </div>
                <div class="pd-desc">${escapeHtml(e.description)}</div>
                <div class="pd-chips">
                  <span class="pd-chip ${chip}">${escapeHtml(e.type || 'internal')}</span>
                  ${e.division ? `<span class="pd-chip pd-chip-division">${escapeHtml(e.division)}</span>` : ''}
                </div>
              </a>`;
          }).join('')}
        </div>
      </div>`;
    });

    if (!html) {
      html = `<div class="pd-empty">No entries match "${escapeHtml(searchQuery)}".</div>`;
    }
    body.innerHTML = html;

    const meta = modalEl.querySelector('.pd-meta');
    if (meta) {
      meta.innerHTML = `
        <span>${totalMatches} entries · ${(DIR.categories || []).length} categories</span>
        <span>Directory v${escapeHtml(DIR.version || '1.0.0')} · Updated ${escapeHtml(DIR.lastUpdated || '')}</span>
      `;
    }
  }

  function buildModal() {
    if (modalEl) return modalEl;
    injectStyle();
    modalEl = document.createElement('div');
    modalEl.id = 'poseidon-directory-modal';

    const cats = (DIR.categories || []).map(c =>
      `<button class="pd-tab" data-cat="${escapeHtml(c.id)}">${escapeHtml(c.label)}</button>`
    ).join('');

    modalEl.innerHTML = `
      <div class="pd-backdrop" data-action="close"></div>
      <div class="pd-panel">
        <div class="pd-head">
          <div class="pd-title">📚 Directory <span class="pd-badge">Poseidon</span></div>
          <button class="pd-close" data-action="close" aria-label="Close">&times;</button>
          <div style="flex-basis:100%;position:relative">
            <input type="text" class="pd-search" placeholder="Search links, programs, integrations…" />
          </div>
        </div>
        <div class="pd-tabs">
          <button class="pd-tab active" data-cat="all">All</button>
          ${cats}
        </div>
        <div class="pd-body"></div>
        <div class="pd-meta"></div>
      </div>
    `;
    document.body.appendChild(modalEl);

    modalEl.addEventListener('click', (e) => {
      if (e.target.dataset.action === 'close') close();
    });

    // Intercept internal-dashboard links so we stash V6 origin + append
    // a return-to query param. External links open in a new tab (no change).
    modalEl.addEventListener('click', (e) => {
      const card = e.target.closest('a.pd-card[data-poseidon-internal="1"]');
      if (!card) return;
      try {
        const v6Url = location.origin + location.pathname + location.search + location.hash;
        sessionStorage.setItem('poseidon_v6_origin', v6Url);
        const href = card.getAttribute('href') || '';
        if (href && !/[?&]poseidon_return_to=/.test(href)) {
          const sep = href.includes('?') ? '&' : '?';
          card.setAttribute('href', href + sep + 'poseidon_return_to=' + encodeURIComponent(v6Url));
        }
      } catch (_) { /* non-fatal */ }
    }, true);
    modalEl.querySelector('.pd-search').addEventListener('input', e => { searchQuery = e.target.value; render(); });
    modalEl.querySelectorAll('.pd-tab').forEach(t => t.addEventListener('click', () => {
      modalEl.querySelectorAll('.pd-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      activeCategory = t.dataset.cat;
      render();
    }));
    window.addEventListener('keydown', (e) => {
      if (!modalEl.classList.contains('active')) return;
      if (e.key === 'Escape') close();
    });
    return modalEl;
  }

  async function open() {
    await loadConfig();
    buildModal();
    modalEl.classList.add('active');
    render();
    setTimeout(() => { const s = modalEl.querySelector('.pd-search'); if (s) s.focus(); }, 50);
  }
  function close() { if (modalEl) modalEl.classList.remove('active'); }

  function addHeaderButton() {
    const header = document.querySelector('#app-header .header-actions');
    if (!header || document.getElementById('poseidon-directory-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'poseidon-directory-btn';
    btn.title = 'Open Directory';
    btn.className = 'w-10 h-10 flex items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 hover:text-teal-400 hover:border-teal-500/40 transition-all shrink-0';
    btn.innerHTML = '<span style="font-size:16px">📚</span>';
    btn.onclick = open;
    header.insertBefore(btn, header.firstChild);
  }

  function bootstrap() {
    loadConfig().then(addHeaderButton);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap);
  else bootstrap();

  window.PoseidonDirectory = { open, close, reloadConfig: async () => { DIR = null; await loadConfig(); render(); } };
})();
