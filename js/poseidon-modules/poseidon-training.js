/* ═══════════════════════════════════════════════════════════════════
   POSEIDON — INTERACTIVE TRAINING MODULE
   Mobile-friendly, modular, JSON-configurable onboarding tour.
   Config: /config/training-steps.json
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const CONFIG_URL = 'config/training-steps.json';
  const LS_COMPLETE = 'poseidon_training_completed_v1';
  const LS_PROGRESS = 'poseidon_training_progress_v1';

  let CFG = null;
  let flatSteps = [];
  let currentIdx = 0;
  let overlayEl = null;

  // ─── Style injection (scoped, idempotent) ───────────────────────
  const STYLE_ID = 'poseidon-training-style';
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      #poseidon-training-overlay{position:fixed;inset:0;z-index:10000;display:none;font-family:'Inter',system-ui,sans-serif;}
      #poseidon-training-overlay.active{display:block;}
      #poseidon-training-backdrop{position:absolute;inset:0;background:rgba(5,11,22,0.82);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);}
      #poseidon-training-spot{position:absolute;border:2px solid #2dd4bf;border-radius:12px;box-shadow:0 0 0 9999px rgba(5,11,22,0.80),0 0 28px rgba(45,212,191,0.45);transition:all 0.35s cubic-bezier(0.16,1,0.3,1);pointer-events:none;}
      #poseidon-training-card{position:absolute;background:linear-gradient(160deg,#0f1e2e,#122336);border:1px solid rgba(20,184,166,0.40);border-radius:16px;padding:22px 24px;width:min(420px,calc(100vw - 32px));max-height:min(560px,calc(100vh - 32px));overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,0.55),0 0 36px rgba(20,184,166,0.18);color:#e2e8f0;transition:all 0.35s cubic-bezier(0.16,1,0.3,1);}
      #poseidon-training-card .pt-track{font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#5eead4;font-weight:700;margin-bottom:6px;}
      #poseidon-training-card h3{font-size:1.25rem;font-weight:800;letter-spacing:-0.02em;color:#f1f5f9;margin-bottom:10px;}
      #poseidon-training-card p{font-size:14px;line-height:1.6;color:#cbd5e1;margin-bottom:18px;}
      #poseidon-training-card .pt-dots{display:flex;gap:5px;margin-bottom:14px;flex-wrap:wrap;}
      #poseidon-training-card .pt-dot{width:6px;height:6px;border-radius:50%;background:rgba(148,163,184,0.28);transition:all 0.2s;}
      #poseidon-training-card .pt-dot.done{background:#14b8a6;}
      #poseidon-training-card .pt-dot.current{background:#2dd4bf;box-shadow:0 0 8px #2dd4bf;transform:scale(1.45);}
      #poseidon-training-card .pt-meta{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#64748b;margin-bottom:12px;}
      #poseidon-training-card .pt-actions{display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap;}
      #poseidon-training-card button{font-family:inherit;font-size:13px;font-weight:600;padding:9px 16px;border-radius:8px;border:none;cursor:pointer;transition:all 0.15s;}
      #poseidon-training-card .pt-btn-primary{background:linear-gradient(135deg,#14b8a6,#0d9488);color:#fff;box-shadow:0 2px 8px rgba(20,184,166,0.35);}
      #poseidon-training-card .pt-btn-primary:hover{filter:brightness(1.1);transform:translateY(-1px);}
      #poseidon-training-card .pt-btn-ghost{background:transparent;color:#94a3b8;border:1px solid rgba(148,163,184,0.25);}
      #poseidon-training-card .pt-btn-ghost:hover{border-color:#2dd4bf;color:#2dd4bf;}
      #poseidon-training-card .pt-btn-skip{background:transparent;color:#64748b;padding:6px 10px;font-size:12px;}
      #poseidon-training-card .pt-btn-skip:hover{color:#94a3b8;}
      #poseidon-training-card .pt-close{position:absolute;top:10px;right:10px;background:transparent;color:#64748b;padding:6px 8px;font-size:18px;line-height:1;border-radius:6px;}
      #poseidon-training-card .pt-close:hover{background:rgba(148,163,184,0.12);color:#e2e8f0;}
      #poseidon-training-card .pt-arrow{position:absolute;width:0;height:0;border-style:solid;}
      #poseidon-training-card.pt-arrow-top::before{content:'';position:absolute;top:-10px;left:40px;border:10px solid transparent;border-bottom-color:#14b8a6;border-top:0;}
      #poseidon-training-card.pt-arrow-bottom::before{content:'';position:absolute;bottom:-10px;left:40px;border:10px solid transparent;border-top-color:#14b8a6;border-bottom:0;}
      #poseidon-training-card.pt-arrow-left::before{content:'';position:absolute;left:-10px;top:40px;border:10px solid transparent;border-right-color:#14b8a6;border-left:0;}
      #poseidon-training-card.pt-arrow-right::before{content:'';position:absolute;right:-10px;top:40px;border:10px solid transparent;border-left-color:#14b8a6;border-right:0;}
      /* Mobile-first adjustments */
      @media (max-width:640px){
        #poseidon-training-card{width:calc(100vw - 20px);left:10px!important;right:10px!important;bottom:12px!important;top:auto!important;transform:none!important;max-height:58vh;}
        #poseidon-training-card.pt-arrow-top::before,
        #poseidon-training-card.pt-arrow-bottom::before,
        #poseidon-training-card.pt-arrow-left::before,
        #poseidon-training-card.pt-arrow-right::before{display:none;}
        #poseidon-training-spot{display:none;}
      }
      /* Floating launcher in settings */
      .poseidon-training-launch{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#14b8a6,#0ea5e9);color:#fff;padding:10px 18px;border-radius:10px;font-weight:600;font-size:13px;cursor:pointer;border:0;box-shadow:0 4px 14px rgba(20,184,166,0.3);}
      .poseidon-training-launch:hover{filter:brightness(1.1);}
    `;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── Config loader ──────────────────────────────────────────────
  async function loadConfig() {
    if (CFG) return CFG;
    try {
      const res = await fetch(CONFIG_URL, { cache: 'no-cache' });
      CFG = await res.json();
    } catch (e) {
      console.warn('[Poseidon Training] config fetch failed, using inline fallback', e);
      CFG = { tracks: [{ id: 'fallback', title: 'Welcome', steps: [
        { id:'welcome', title:'Welcome', body:'Training config could not be loaded. Use the dashboard directly.', placement:'center' }
      ]}]};
    }
    flatSteps = [];
    (CFG.tracks || []).forEach(tr => (tr.steps || []).forEach(s => flatSteps.push({ ...s, _track: tr.title, _trackIcon: tr.icon })));
    return CFG;
  }

  // ─── Overlay builder ────────────────────────────────────────────
  function buildOverlay() {
    if (overlayEl) return overlayEl;
    injectStyle();
    overlayEl = document.createElement('div');
    overlayEl.id = 'poseidon-training-overlay';
    overlayEl.innerHTML = `
      <div id="poseidon-training-backdrop"></div>
      <div id="poseidon-training-spot"></div>
      <div id="poseidon-training-card" role="dialog" aria-modal="true" aria-labelledby="pt-title">
        <button class="pt-close" aria-label="Close" data-action="close">&times;</button>
        <div class="pt-track"></div>
        <h3 id="pt-title"></h3>
        <p class="pt-body"></p>
        <div class="pt-dots"></div>
        <div class="pt-meta">
          <span class="pt-step-count"></span>
          <span class="pt-track-est"></span>
        </div>
        <div class="pt-actions">
          <button class="pt-btn-ghost" data-action="prev">Back</button>
          <button class="pt-btn-skip" data-action="skip">Skip tour</button>
          <button class="pt-btn-primary" data-action="next">Next</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlayEl);

    overlayEl.addEventListener('click', (e) => {
      const act = e.target.dataset.action;
      if (!act && e.target.id !== 'poseidon-training-backdrop') return;
      if (act === 'close' || act === 'skip' || e.target.id === 'poseidon-training-backdrop') return closeTour(false);
      if (act === 'prev') return prevStep();
      if (act === 'next') return nextStep();
    });

    // Keyboard & touch
    window.addEventListener('keydown', (e) => {
      if (!overlayEl.classList.contains('active')) return;
      if (e.key === 'Escape') closeTour(false);
      else if (e.key === 'ArrowRight' || e.key === 'Enter') nextStep();
      else if (e.key === 'ArrowLeft') prevStep();
    });

    let touchStartX = 0;
    overlayEl.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    overlayEl.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 55) { dx < 0 ? nextStep() : prevStep(); }
    }, { passive: true });

    window.addEventListener('resize', () => { if (overlayEl.classList.contains('active')) renderStep(); });
    return overlayEl;
  }

  // ─── Navigation helpers ─────────────────────────────────────────
  function navigateDashboardTo(pageId) {
    if (!pageId) return;
    const link = document.querySelector(`.nav-link[data-page="${pageId}"]`);
    if (link) { link.click(); return; }
    // Fallback: manual toggle
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    const target = document.getElementById(pageId);
    if (target) target.classList.remove('hidden');
  }

  function positionCard(card, spot, target, placement) {
    const pad = 14;
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    card.classList.remove('pt-arrow-top','pt-arrow-bottom','pt-arrow-left','pt-arrow-right');

    if (!target || placement === 'center' || vw < 641) {
      card.style.left = Math.max(10, (vw - cw) / 2) + 'px';
      card.style.top  = Math.max(10, (vh - ch) / 2) + 'px';
      return;
    }

    const r = target.getBoundingClientRect();
    spot.style.top    = (r.top - 6) + 'px';
    spot.style.left   = (r.left - 6) + 'px';
    spot.style.width  = (r.width + 12) + 'px';
    spot.style.height = (r.height + 12) + 'px';

    let top, left;
    switch (placement) {
      case 'right':
        left = r.right + pad;
        top  = Math.max(10, Math.min(vh - ch - 10, r.top + (r.height - ch) / 2));
        if (left + cw > vw - 10) { placement = 'left'; left = Math.max(10, r.left - cw - pad); }
        card.classList.add(placement === 'right' ? 'pt-arrow-left' : 'pt-arrow-right');
        break;
      case 'left':
        left = r.left - cw - pad;
        top  = Math.max(10, Math.min(vh - ch - 10, r.top + (r.height - ch) / 2));
        if (left < 10) { placement = 'right'; left = r.right + pad; }
        card.classList.add(placement === 'left' ? 'pt-arrow-right' : 'pt-arrow-left');
        break;
      case 'bottom':
        top  = r.bottom + pad;
        left = Math.max(10, Math.min(vw - cw - 10, r.left + (r.width - cw) / 2));
        if (top + ch > vh - 10) { placement = 'top'; top = Math.max(10, r.top - ch - pad); }
        card.classList.add(placement === 'bottom' ? 'pt-arrow-top' : 'pt-arrow-bottom');
        break;
      default: // top
        top  = r.top - ch - pad;
        left = Math.max(10, Math.min(vw - cw - 10, r.left + (r.width - cw) / 2));
        if (top < 10) { placement = 'bottom'; top = r.bottom + pad; }
        card.classList.add(placement === 'top' ? 'pt-arrow-bottom' : 'pt-arrow-top');
    }
    card.style.left = left + 'px';
    card.style.top  = top + 'px';
  }

  function renderStep() {
    if (!overlayEl) return;
    if (currentIdx < 0 || currentIdx >= flatSteps.length) return closeTour(true);

    const step = flatSteps[currentIdx];
    if (step.navigateTo) navigateDashboardTo(step.navigateTo);

    const card = overlayEl.querySelector('#poseidon-training-card');
    const spot = overlayEl.querySelector('#poseidon-training-spot');

    card.querySelector('.pt-track').textContent = step._track || '';
    card.querySelector('#pt-title').textContent = step.title || '';
    card.querySelector('.pt-body').textContent = step.body || '';
    card.querySelector('.pt-step-count').textContent = `Step ${currentIdx + 1} of ${flatSteps.length}`;
    card.querySelector('.pt-track-est').textContent = step._trackIcon ? `· ${step._track}` : '';

    // Dots
    const dots = card.querySelector('.pt-dots');
    dots.innerHTML = flatSteps.map((_, i) =>
      `<span class="pt-dot ${i < currentIdx ? 'done' : i === currentIdx ? 'current' : ''}"></span>`
    ).join('');

    // Button labels
    card.querySelector('[data-action="prev"]').style.visibility = currentIdx === 0 ? 'hidden' : 'visible';
    const isLast = currentIdx === flatSteps.length - 1;
    card.querySelector('[data-action="next"]').textContent = step.cta || (isLast ? 'Finish' : 'Next →');

    // Delay a tick so nav animation settles before positioning
    setTimeout(() => {
      const target = step.target ? document.querySelector(step.target) : null;
      if (target) {
        try { target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); } catch (_) {}
      }
      spot.style.display = (target && window.innerWidth > 640) ? 'block' : 'none';
      positionCard(card, spot, target, step.placement || 'center');
    }, 120);

    try { localStorage.setItem(LS_PROGRESS, String(currentIdx)); } catch (_) {}
  }

  function nextStep() {
    if (currentIdx >= flatSteps.length - 1) return closeTour(true);
    currentIdx++;
    renderStep();
  }
  function prevStep() { if (currentIdx > 0) { currentIdx--; renderStep(); } }

  function closeTour(completed) {
    if (!overlayEl) return;
    overlayEl.classList.remove('active');
    // Always persist the close decision — finished OR skipped.
    // Either way, the user does not want to be re-prompted on every login.
    // PoseidonTraining.restart() forces a replay if needed.
    try {
      localStorage.setItem(LS_COMPLETE, JSON.stringify({
        at: new Date().toISOString(),
        version: (CFG && CFG.version) || '1.0.0',
        completed: !!completed,
        skipped: !completed
      }));
      localStorage.removeItem(LS_PROGRESS);
    } catch (_) {}
  }

  async function startTour(opts) {
    await loadConfig();
    buildOverlay();
    currentIdx = 0;
    if (opts && opts.resume) {
      try { const s = parseInt(localStorage.getItem(LS_PROGRESS), 10); if (!isNaN(s) && s < flatSteps.length) currentIdx = s; } catch (_) {}
    }
    overlayEl.classList.add('active');
    renderStep();
  }

  function shouldAutoRun() {
    // Never auto-run inside a popped-out embed view (?embed=<div>) or when
    // the dashboard is loaded with an explicit deep-link to a report.
    // The popout is meant to be a focused, distraction-free view.
    try {
      const params = new URLSearchParams(location.search);
      if (params.has('embed') || params.has('report')) return false;
    } catch (_) {}
    try {
      const raw = localStorage.getItem(LS_COMPLETE);
      if (!raw) return true;
      // The user has already taken or skipped the tour. Do NOT auto-re-run
      // on future logins, even if the tour config version changes. The user
      // can replay anytime via the "Replay Onboarding Tour" button.
      return false;
    } catch (_) { return true; }
  }

  // ─── Public API ─────────────────────────────────────────────────
  const API = {
    start: startTour,
    restart: () => { try { localStorage.removeItem(LS_COMPLETE); } catch (_) {} startTour(); },
    close: () => closeTour(false),
    isComplete: () => { try { return !!localStorage.getItem(LS_COMPLETE); } catch (_) { return false; } },
    reloadConfig: async () => { CFG = null; await loadConfig(); },
    addLaunchButton: function (container) {
      if (!container) return;
      const btn = document.createElement('button');
      btn.className = 'poseidon-training-launch';
      btn.innerHTML = '<span>🎓</span> Replay Onboarding Tour';
      btn.onclick = () => API.restart();
      container.appendChild(btn);
    }
  };

  // ─── Auto-bootstrap ─────────────────────────────────────────────
  async function bootstrap() {
    await loadConfig();
    if (shouldAutoRun()) {
      // Small delay so dashboard has finished initial render
      setTimeout(() => startTour(), 1200);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  window.PoseidonTraining = API;
})();
