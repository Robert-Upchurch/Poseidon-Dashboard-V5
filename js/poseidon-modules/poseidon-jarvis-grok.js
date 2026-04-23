/* ═══════════════════════════════════════════════════════════════════
   POSEIDON — JARVIS (xAI Grok Voice Assistant)
   Ever-present, contextually-aware voice agent.

   Tech stack:
     · WebSocket → wss://api.x.ai/v1/realtime
     · Microphone → 24 kHz, 16-bit PCM, mono, little-endian
     · Output    → 24 kHz PCM16 frames decoded to AudioBuffer
     · Tool calls → dashboard DOM + localStorage + MSAL calendar

   Security:
     · API key is stored locally (localStorage: poseidon_grok_api_key)
       and sent only on WebSocket upgrade. For production you should
       proxy this through a signed-URL token-minting endpoint instead.

   How to provide the API key:
     PoseidonJarvis.setApiKey("xai-…");
     — or —
     Settings → Grok API Key field
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const GROK_WS_URL   = 'wss://api.x.ai/v1/realtime';
  const GROK_MODEL    = 'grok-voice-think-fast-1.0';  // xAI canonical realtime model
  const GROK_VOICE    = 'eve';                        // xAI realtime voice
  const SAMPLE_RATE   = 24000;
  const LS_API_KEY    = 'poseidon_grok_api_key';
  const LS_VOICE      = 'poseidon_grok_voice';
  const LS_HISTORY    = 'poseidon_jarvis_history';

  const state = {
    connected: false,
    listening: false,
    speaking: false,
    ws: null,
    audioCtx: null,
    micStream: null,
    processor: null,
    micSource: null,
    playbackQueue: [],
    playbackTime: 0,
    lastAssistantText: '',
    transcript: [],
    pendingToolCalls: new Map()
  };

  // ─── Utilities ─────────────────────────────────────────────────
  function getApiKey() {
    try { return localStorage.getItem(LS_API_KEY) || window.GROK_API_KEY || ''; } catch (_) { return window.GROK_API_KEY || ''; }
  }
  function setApiKey(k) { try { localStorage.setItem(LS_API_KEY, k || ''); } catch (_) {} }
  function getVoice() { try { return localStorage.getItem(LS_VOICE) || GROK_VOICE; } catch (_) { return GROK_VOICE; } }
  function setVoice(v) { try { localStorage.setItem(LS_VOICE, v || GROK_VOICE); } catch (_) {} }

  function log(...args) { if (window.POSEIDON_JARVIS_DEBUG) console.log('[Jarvis]', ...args); }

  // ─── DOM: Floating Action Button + Panel ────────────────────────
  const STYLE_ID = 'poseidon-jarvis-style';
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      #jarvis-fab{position:fixed;right:20px;bottom:20px;z-index:9997;width:60px;height:60px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#2dd4bf,#0d9488);border:0;cursor:pointer;box-shadow:0 10px 30px rgba(13,148,136,0.45),0 0 60px rgba(20,184,166,0.25);color:#fff;font-size:24px;display:flex;align-items:center;justify-content:center;transition:all 0.25s;font-family:'Inter',sans-serif;}
      #jarvis-fab:hover{transform:scale(1.05);box-shadow:0 14px 40px rgba(13,148,136,0.6);}
      #jarvis-fab.listening{animation:jarvis-pulse 1.1s infinite;}
      #jarvis-fab.speaking{background:radial-gradient(circle at 30% 30%,#f59e0b,#d97706);animation:jarvis-speak 0.5s infinite alternate;}
      #jarvis-fab.connected::after{content:'';position:absolute;top:6px;right:6px;width:10px;height:10px;border-radius:50%;background:#22c55e;border:2px solid #0a1628;}
      @keyframes jarvis-pulse{0%,100%{box-shadow:0 10px 30px rgba(13,148,136,0.45),0 0 0 0 rgba(20,184,166,0.4);}50%{box-shadow:0 10px 30px rgba(13,148,136,0.7),0 0 0 20px rgba(20,184,166,0);}}
      @keyframes jarvis-speak{0%{transform:scale(1);}100%{transform:scale(1.07);}}

      #jarvis-panel{position:fixed;right:20px;bottom:90px;z-index:9998;width:min(420px,calc(100vw - 24px));max-height:min(620px,calc(100vh - 110px));background:linear-gradient(160deg,#0f1e2e,#122336);border:1px solid rgba(20,184,166,0.40);border-radius:16px;display:none;flex-direction:column;box-shadow:0 30px 70px rgba(0,0,0,0.6);color:#e2e8f0;font-family:'Inter',sans-serif;overflow:hidden;}
      #jarvis-panel.active{display:flex;}
      #jarvis-panel .jv-head{padding:14px 16px;border-bottom:1px solid rgba(148,163,184,0.14);display:flex;align-items:center;gap:10px;}
      #jarvis-panel .jv-avatar{width:34px;height:34px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#2dd4bf,#0d9488);display:flex;align-items:center;justify-content:center;font-size:16px;}
      #jarvis-panel .jv-title{font-weight:700;font-size:14px;color:#f1f5f9;}
      #jarvis-panel .jv-sub{font-size:10px;color:#94a3b8;letter-spacing:0.06em;text-transform:uppercase;}
      #jarvis-panel .jv-status-dot{width:8px;height:8px;border-radius:50%;background:#64748b;margin-left:auto;}
      #jarvis-panel.state-connected .jv-status-dot{background:#22c55e;box-shadow:0 0 8px #22c55e;}
      #jarvis-panel.state-listening .jv-status-dot{background:#14b8a6;box-shadow:0 0 8px #14b8a6;animation:jarvis-pulse-dot 1s infinite;}
      #jarvis-panel.state-speaking  .jv-status-dot{background:#f59e0b;box-shadow:0 0 8px #f59e0b;}
      @keyframes jarvis-pulse-dot{0%,100%{opacity:1}50%{opacity:0.3}}
      #jarvis-panel .jv-close{background:transparent;border:0;color:#94a3b8;font-size:20px;cursor:pointer;padding:0 6px;border-radius:6px;}
      #jarvis-panel .jv-close:hover{background:rgba(148,163,184,0.1);color:#f1f5f9;}

      #jarvis-panel .jv-log{flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:8px;min-height:220px;}
      #jarvis-panel .jv-msg{padding:10px 12px;border-radius:10px;font-size:13px;line-height:1.5;max-width:85%;word-wrap:break-word;}
      #jarvis-panel .jv-msg.user{align-self:flex-end;background:rgba(20,184,166,0.18);color:#5eead4;border:1px solid rgba(20,184,166,0.3);}
      #jarvis-panel .jv-msg.assistant{align-self:flex-start;background:rgba(148,163,184,0.1);color:#e2e8f0;border:1px solid rgba(148,163,184,0.18);}
      #jarvis-panel .jv-msg.tool{align-self:flex-start;background:rgba(59,130,246,0.12);color:#93c5fd;font-family:'JetBrains Mono',monospace;font-size:11px;border:1px solid rgba(59,130,246,0.22);}
      #jarvis-panel .jv-msg.error{align-self:center;background:rgba(239,68,68,0.12);color:#fca5a5;font-size:12px;border:1px solid rgba(239,68,68,0.3);}

      #jarvis-panel .jv-foot{padding:12px 16px;border-top:1px solid rgba(148,163,184,0.14);display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
      #jarvis-panel .jv-mic-btn{flex:1;background:linear-gradient(135deg,#14b8a6,#0d9488);color:#fff;border:0;border-radius:10px;padding:11px 14px;font-weight:700;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:inherit;transition:all 0.15s;}
      #jarvis-panel .jv-mic-btn:hover{filter:brightness(1.1);}
      #jarvis-panel .jv-mic-btn.rec{background:linear-gradient(135deg,#ef4444,#b91c1c);animation:jarvis-pulse-dot 1s infinite;}
      #jarvis-panel .jv-mic-btn:disabled{opacity:0.6;cursor:not-allowed;}
      #jarvis-panel .jv-brief-btn,#jarvis-panel .jv-clear-btn,#jarvis-panel .jv-conn-btn{background:rgba(148,163,184,0.1);color:#cbd5e1;border:1px solid rgba(148,163,184,0.18);border-radius:8px;padding:10px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;}
      #jarvis-panel .jv-brief-btn:hover,#jarvis-panel .jv-clear-btn:hover,#jarvis-panel .jv-conn-btn:hover{color:#2dd4bf;border-color:rgba(20,184,166,0.5);}

      #jarvis-panel .jv-cfg{padding:10px 16px;font-size:11px;color:#64748b;background:rgba(0,0,0,0.2);border-top:1px solid rgba(148,163,184,0.08);display:flex;flex-direction:column;gap:6px;}
      #jarvis-panel .jv-cfg input{width:100%;background:#0a1628;border:1px solid rgba(148,163,184,0.18);border-radius:6px;padding:6px 8px;color:#e2e8f0;font-family:'JetBrains Mono',monospace;font-size:11px;outline:none;}
      #jarvis-panel .jv-cfg input:focus{border-color:#14b8a6;}
      #jarvis-panel .jv-cfg label{font-size:10px;color:#64748b;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;}

      @media (max-width:640px){
        #jarvis-panel{right:10px;left:10px;bottom:80px;width:auto;max-height:70vh;}
        #jarvis-fab{right:14px;bottom:14px;width:54px;height:54px;}
      }
    `;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  let fabEl, panelEl;
  function buildUI() {
    if (fabEl) return;
    injectStyle();
    fabEl = document.createElement('button');
    fabEl.id = 'jarvis-fab';
    fabEl.title = 'Talk to Jarvis (Grok Voice)';
    fabEl.textContent = '🎙';
    fabEl.onclick = togglePanel;
    document.body.appendChild(fabEl);

    panelEl = document.createElement('div');
    panelEl.id = 'jarvis-panel';
    panelEl.innerHTML = `
      <div class="jv-head">
        <div class="jv-avatar">🔱</div>
        <div>
          <div class="jv-title">Jarvis</div>
          <div class="jv-sub">Grok Voice · Poseidon</div>
        </div>
        <div class="jv-status-dot" title="status"></div>
        <button class="jv-close" aria-label="Close" data-action="close">&times;</button>
      </div>
      <div class="jv-log" id="jv-log"></div>
      <div class="jv-foot">
        <button class="jv-mic-btn" data-action="toggle-mic">🎤 Start Talking</button>
        <button class="jv-brief-btn" data-action="brief" title="Morning Briefing">☀️ Brief Me</button>
        <button class="jv-clear-btn" data-action="clear" title="Clear conversation">🗑</button>
      </div>
      <div class="jv-cfg" id="jv-cfg-section">
        <label>Grok API Key <span style="color:#f59e0b">(stored locally)</span></label>
        <input type="password" id="jv-api-key" placeholder="xai-…" autocomplete="off" />
      </div>
    `;
    document.body.appendChild(panelEl);

    panelEl.addEventListener('click', e => {
      const act = e.target.dataset.action;
      if (act === 'close') closePanel();
      else if (act === 'toggle-mic') toggleMic();
      else if (act === 'brief') morningBriefing();
      else if (act === 'clear') clearTranscript();
    });
    const keyInput = panelEl.querySelector('#jv-api-key');
    keyInput.value = getApiKey();
    keyInput.addEventListener('change', () => {
      setApiKey(keyInput.value.trim());
      pushLog('tool', `API key saved (locally).`);
    });
  }

  function togglePanel() {
    if (!panelEl) buildUI();
    if (panelEl.classList.contains('active')) closePanel();
    else openPanel();
  }
  function openPanel() {
    buildUI();
    panelEl.classList.add('active');
    renderTranscript();
  }
  function closePanel() {
    if (panelEl) panelEl.classList.remove('active');
  }

  function setStatusClass(cls) {
    if (!panelEl) return;
    panelEl.classList.remove('state-connected','state-listening','state-speaking');
    if (cls) panelEl.classList.add(cls);
    if (fabEl) {
      fabEl.classList.remove('listening','speaking','connected');
      if (cls === 'state-connected') fabEl.classList.add('connected');
      if (cls === 'state-listening') fabEl.classList.add('listening','connected');
      if (cls === 'state-speaking')  fabEl.classList.add('speaking','connected');
    }
  }

  function pushLog(role, text) {
    state.transcript.push({ role, text, at: Date.now() });
    try { localStorage.setItem(LS_HISTORY, JSON.stringify(state.transcript.slice(-60))); } catch (_) {}
    renderTranscript();
  }
  function renderTranscript() {
    const logEl = panelEl && panelEl.querySelector('#jv-log');
    if (!logEl) return;
    logEl.innerHTML = state.transcript.map(t =>
      `<div class="jv-msg ${t.role}">${escapeHtml(t.text)}</div>`
    ).join('');
    logEl.scrollTop = logEl.scrollHeight;
  }
  function clearTranscript() {
    state.transcript = [];
    try { localStorage.removeItem(LS_HISTORY); } catch (_) {}
    renderTranscript();
  }
  function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // ══════════════════════════════════════════════════════════════════
  // TOOL DEFINITIONS — what Jarvis can do on the dashboard
  // ══════════════════════════════════════════════════════════════════
  const TOOLS = [
    {
      type: 'function',
      name: 'go_to_page',
      description: 'Navigate the dashboard to a given workspace.',
      parameters: {
        type: 'object',
        properties: {
          page_id: { type: 'string', enum: ['masterforecast','finance','recruitingdivision','processingcuk','j1division','ittech','j1housing','dashboard','tasks','calendar','videos','projects','partners','settings'], description: 'The page ID to open.' }
        },
        required: ['page_id']
      }
    },
    {
      type: 'function',
      name: 'save_task',
      description: 'Create a new task in the user\'s task list.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short task title.' },
          due:   { type: 'string', description: 'Due date in YYYY-MM-DD (optional).' },
          priority: { type: 'string', enum: ['low','medium','high'], description: 'Priority.' }
        },
        required: ['title']
      }
    },
    {
      type: 'function',
      name: 'save_event',
      description: 'Create a calendar event in the user\'s local calendar.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          date:  { type: 'string', description: 'YYYY-MM-DD' },
          time:  { type: 'string', description: 'HH:MM (24h)' },
          notes: { type: 'string' }
        },
        required: ['title','date']
      }
    },
    {
      type: 'function',
      name: 'read_dashboard_state',
      description: 'Returns a JSON snapshot of the currently-visible dashboard — active page, KPI tiles, open tasks, upcoming events.',
      parameters: { type: 'object', properties: {} }
    },
    {
      type: 'function',
      name: 'read_kpi',
      description: 'Return the KPI values for a specific division.',
      parameters: {
        type: 'object',
        properties: {
          division: { type: 'string', enum: ['masterforecast','finance','recruitingdivision','processingcuk','j1division','ittech','j1housing'] }
        },
        required: ['division']
      }
    },
    {
      type: 'function',
      name: 'simulate_division',
      description: 'Run a simulation (Update/Simulate Week/What-If) on a division.',
      parameters: {
        type: 'object',
        properties: {
          division: { type: 'string', enum: ['masterforecast','finance','recruitingdivision','processingcuk','j1division','ittech','j1housing'] },
          action:   { type: 'string', enum: ['refresh','simulate','whatif','export','pdf'] }
        },
        required: ['division','action']
      }
    },
    {
      type: 'function',
      name: 'morning_briefing',
      description: 'Reads the user\'s calendar schedule for today from Microsoft 365 plus priority tasks, and returns a spoken briefing script.',
      parameters: { type: 'object', properties: {} }
    },
    {
      type: 'function',
      name: 'client_briefing',
      description: 'Draft an executive client briefing by analyzing the dashboard state.',
      parameters: {
        type: 'object',
        properties: {
          client: { type: 'string' },
          audience: { type: 'string' }
        },
        required: ['client']
      }
    },
    {
      type: 'function',
      name: 'generate_video_brief',
      description: 'Produce an 8-scene recruiting video brief for a partner / destination.',
      parameters: {
        type: 'object',
        properties: {
          partner: { type: 'string' },
          destination: { type: 'string' },
          tone: { type: 'string' }
        },
        required: ['partner']
      }
    },
    {
      type: 'function',
      name: 'open_directory',
      description: 'Open the Directory (the searchable list of every internal link, program, and integration).',
      parameters: { type: 'object', properties: {} }
    },
    {
      type: 'function',
      name: 'open_changelog',
      description: 'Open the Version & Changelog view.',
      parameters: { type: 'object', properties: {} }
    },
    {
      type: 'function',
      name: 'restart_training',
      description: 'Restart the interactive onboarding tour.',
      parameters: { type: 'object', properties: {} }
    }
  ];

  // ─── Tool implementations (executed on the dashboard) ───────────
  const TOOL_IMPL = {
    go_to_page({ page_id }) {
      const link = document.querySelector(`.nav-link[data-page="${page_id}"]`);
      if (link) link.click();
      return { ok: true, page: page_id };
    },

    save_task({ title, due, priority }) {
      if (typeof window.saveTask === 'function' && typeof window.openTaskModal === 'function') {
        try {
          window.openTaskModal();
          setTimeout(() => {
            const input = document.getElementById('task-title-input') || document.querySelector('#task-modal input[type="text"]');
            if (input) input.value = title;
            const dueInput = document.getElementById('task-due-input') || document.querySelector('#task-modal input[type="date"]');
            if (dueInput && due) dueInput.value = due;
            const prInput = document.getElementById('task-priority-input') || document.querySelector('#task-modal select');
            if (prInput && priority) prInput.value = priority;
            try { window.saveTask(); } catch (_) {}
          }, 120);
          return { ok: true, task: { title, due, priority } };
        } catch (e) { /* fall through to direct write */ }
      }
      // Direct write to localStorage
      let tasks = []; try { tasks = JSON.parse(localStorage.getItem('poseidon-tasks') || '[]'); } catch (_) {}
      tasks.push({ id: Date.now(), title, due: due || null, priority: priority || 'medium', done: false, created: new Date().toISOString() });
      localStorage.setItem('poseidon-tasks', JSON.stringify(tasks));
      if (typeof window.renderTasks === 'function') try { window.renderTasks(); } catch (_) {}
      return { ok: true, task: { title, due, priority }, via: 'direct' };
    },

    save_event({ title, date, time, notes }) {
      let events = []; try { events = JSON.parse(localStorage.getItem('poseidon-events') || '[]'); } catch (_) {}
      events.push({ id: Date.now(), title, date, time: time || '09:00', notes: notes || '', created: new Date().toISOString() });
      localStorage.setItem('poseidon-events', JSON.stringify(events));
      if (typeof window.renderCalendar === 'function') try { window.renderCalendar(); } catch (_) {}
      return { ok: true, event: { title, date, time } };
    },

    read_dashboard_state() {
      const snap = window.PoseidonLLM && window.PoseidonLLM.ClientBriefing.snapshotDashboard
        ? window.PoseidonLLM.ClientBriefing.snapshotDashboard()
        : { error: 'LLM module unavailable' };
      snap.activePage = document.querySelector('.page:not(.hidden), .page.active')?.id || null;
      snap.pageTitle = document.getElementById('page-title')?.textContent || null;
      return snap;
    },

    read_kpi({ division }) {
      const page = document.getElementById(division);
      if (!page) return { ok: false, error: `Division '${division}' not found` };
      const canvases = [...page.querySelectorAll('canvas')].map(c => c.id);
      const text = (page.innerText || '').slice(0, 800);
      return { ok: true, division, canvases, visibleText: text };
    },

    simulate_division({ division, action }) {
      if (typeof window.rdDivToolbar === 'function') {
        try { window.rdDivToolbar(division, action); return { ok: true, division, action }; }
        catch (e) { return { ok: false, error: e.message }; }
      }
      const btn = document.querySelector(`[data-division-toolbar="${division}"] button[onclick*="'${action}'"]`);
      if (btn) { btn.click(); return { ok: true, division, action, via: 'click' }; }
      return { ok: false, error: 'Toolbar handler not available' };
    },

    async morning_briefing() {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const wd = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

      // Microsoft 365 calendar via MSAL (if user has signed in)
      let events = [];
      try {
        if (window.o365GetTodaysEvents) events = await window.o365GetTodaysEvents();
        else if (window.msalInstance && window.msalInstance.getActiveAccount && window.msalInstance.getActiveAccount()) {
          const acct = window.msalInstance.getActiveAccount();
          const tokenResp = await window.msalInstance.acquireTokenSilent({ scopes: ['Calendars.Read'], account: acct });
          const start = new Date(); start.setHours(0,0,0,0);
          const end   = new Date(); end.setHours(23,59,59,999);
          const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$top=20&$orderby=start/dateTime`;
          const r = await fetch(url, { headers: { Authorization: `Bearer ${tokenResp.accessToken}` }});
          const j = await r.json();
          events = (j.value || []).map(e => ({
            title: e.subject, start: e.start?.dateTime, end: e.end?.dateTime,
            location: e.location?.displayName, attendees: (e.attendees || []).length
          }));
        }
      } catch (e) { log('Calendar fetch failed', e); }

      // Tasks
      let tasks = []; try { tasks = JSON.parse(localStorage.getItem('poseidon-tasks') || '[]'); } catch (_) {}
      const openTasks = tasks.filter(t => !t.done);
      const dueToday = openTasks.filter(t => t.due === today);
      const overdue = openTasks.filter(t => t.due && t.due < today);

      // Dashboard focus
      const snap = TOOL_IMPL.read_dashboard_state();

      const script = [
        `Good morning. Today is ${wd}.`,
        events.length
          ? `You have ${events.length} meeting${events.length>1?'s':''}. First up: ${_firstMeetingLabel(events)}.`
          : (window.msalInstance?.getActiveAccount?.() ? 'Your calendar is clear today.' : 'Microsoft 365 is not connected, so I cannot see your calendar yet.'),
        overdue.length ? `You have ${overdue.length} overdue task${overdue.length>1?'s':''} to handle first.` : null,
        dueToday.length ? `${dueToday.length} task${dueToday.length>1?'s':''} due today: ${dueToday.slice(0,3).map(t=>t.title).join('; ')}.` : null,
        `Your current focus page is ${snap.pageTitle || 'the Master + Forecast dashboard'}.`,
        'What would you like to do first?'
      ].filter(Boolean).join(' ');

      return { ok: true, script, events, tasksDueToday: dueToday, overdue };
    },

    async client_briefing({ client, audience }) {
      if (!window.PoseidonLLM) return { ok: false, error: 'LLM module unavailable' };
      const b = await window.PoseidonLLM.ClientBriefing.generate(client, { audience });
      return { ok: true, markdown: b.markdown, source: b.source };
    },

    async generate_video_brief({ partner, destination, tone }) {
      if (!window.PoseidonLLM) return { ok: false, error: 'LLM module unavailable' };
      const b = await window.PoseidonLLM.VideoBrief.generate({ partner, destination, tone });
      return { ok: true, brief: b };
    },

    open_directory()  { if (window.PoseidonDirectory) window.PoseidonDirectory.open(); return { ok: true }; },
    open_changelog()  { if (window.PoseidonVersion)   window.PoseidonVersion.open();   return { ok: true }; },
    restart_training(){ if (window.PoseidonTraining)  window.PoseidonTraining.restart(); return { ok: true }; }
  };

  function _firstMeetingLabel(events) {
    const e = events[0];
    if (!e) return 'no meetings';
    const start = new Date(e.start);
    const hh = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${e.title} at ${hh}${e.location ? ' in ' + e.location : ''}`;
  }

  // ══════════════════════════════════════════════════════════════════
  // AUDIO PIPELINE — capture 24 kHz PCM16, playback server audio
  // ══════════════════════════════════════════════════════════════════
  async function initAudio() {
    if (state.audioCtx) return state.audioCtx;
    const AC = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = new AC({ sampleRate: SAMPLE_RATE });
    if (state.audioCtx.state === 'suspended') await state.audioCtx.resume();
    return state.audioCtx;
  }

  async function startMicCapture() {
    await initAudio();
    state.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: SAMPLE_RATE, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    state.micSource = state.audioCtx.createMediaStreamSource(state.micStream);

    // ScriptProcessor: widely supported fallback for 24 kHz PCM16 capture.
    // (AudioWorklet preferred in modern browsers; processor fallback keeps
    //  this module dependency-free across the user's devices.)
    const bufferSize = 2048;
    state.processor = state.audioCtx.createScriptProcessor(bufferSize, 1, 1);

    state.processor.onaudioprocess = (e) => {
      if (!state.ws || state.ws.readyState !== WebSocket.OPEN || !state.listening) return;
      const input = e.inputBuffer.getChannelData(0); // Float32 [-1,1]
      // Downsample to 24 kHz if needed (already 24 if context honored sampleRate)
      const pcm16 = floatTo16BitPCM(input);
      const b64 = bytesToBase64(pcm16);
      sendWs({ type: 'input_audio_buffer.append', audio: b64 });
    };
    state.micSource.connect(state.processor);
    state.processor.connect(state.audioCtx.destination);
  }

  function stopMicCapture() {
    try { state.processor && state.processor.disconnect(); } catch (_) {}
    try { state.micSource && state.micSource.disconnect(); } catch (_) {}
    try { state.micStream && state.micStream.getTracks().forEach(t => t.stop()); } catch (_) {}
    state.processor = null; state.micSource = null; state.micStream = null;
  }

  function floatTo16BitPCM(float32) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      let s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return out;
  }
  function bytesToBase64(int16) {
    const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }
  function base64ToInt16(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Int16Array(bytes.buffer);
  }

  function enqueuePcm(b64) {
    if (!state.audioCtx) return;
    const int16 = base64ToInt16(b64);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;
    const buffer = state.audioCtx.createBuffer(1, float32.length, SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);
    const src = state.audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(state.audioCtx.destination);
    const t0 = Math.max(state.audioCtx.currentTime, state.playbackTime);
    src.start(t0);
    state.playbackTime = t0 + buffer.duration;
    setStatusClass('state-speaking');
    state.speaking = true;
    src.onended = () => {
      if (state.audioCtx.currentTime + 0.05 >= state.playbackTime) {
        state.speaking = false;
        setStatusClass(state.listening ? 'state-listening' : 'state-connected');
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // WEBSOCKET — connect to Grok Voice realtime endpoint
  // ══════════════════════════════════════════════════════════════════
  async function connect() {
    if (state.connected && state.ws && state.ws.readyState === WebSocket.OPEN) return true;
    const key = getApiKey();
    if (!key) { pushLog('error', 'Missing Grok API key. Enter it below the controls.'); return false; }

    await initAudio();

    // Browser WebSocket cannot add Authorization headers directly.
    // xAI realtime accepts auth via the Sec-WebSocket-Protocol subprotocol
    // header using the OpenAI-compatible pattern. Verified live:
    //   ['realtime', 'openai-insecure-api-key.<KEY>', 'openai-beta.realtime-v1']
    // The name "openai-insecure-api-key" is the OpenAI convention — xAI's
    // realtime layer is OpenAI-compatible at the protocol level.
    // For production you should proxy through a backend that can set
    // Authorization headers and mint short-lived signed URLs; override
    // window.Poseidon_getJarvisWsUrl() to do that.
    const url = typeof window.Poseidon_getJarvisWsUrl === 'function'
      ? await window.Poseidon_getJarvisWsUrl()
      : `${GROK_WS_URL}?model=${encodeURIComponent(GROK_MODEL)}`;
    const protocols = typeof window.Poseidon_getJarvisProtocols === 'function'
      ? await window.Poseidon_getJarvisProtocols(key)
      : ['realtime', `openai-insecure-api-key.${key}`, 'openai-beta.realtime-v1'];

    return new Promise((resolve) => {
      try {
        state.ws = new WebSocket(url, protocols);
      } catch (e) {
        pushLog('error', 'WebSocket creation failed: ' + e.message);
        return resolve(false);
      }

      state.ws.binaryType = 'arraybuffer';

      state.ws.onopen = () => {
        state.connected = true;
        setStatusClass('state-connected');
        pushLog('tool', 'Connected to Grok Voice realtime.');
        // Initial session configuration
        sendWs({
          type: 'session.update',
          session: {
            model: GROK_MODEL,
            voice: getVoice(),
            modalities: ['audio','text'],
            input_audio_format:  'pcm16',
            output_audio_format: 'pcm16',
            instructions: buildSystemInstructions(),
            tools: TOOLS,
            tool_choice: 'auto',
            temperature: 0.7,
            turn_detection: { type: 'server_vad', threshold: 0.5, silence_duration_ms: 500 }
          }
        });
        resolve(true);
      };

      state.ws.onmessage = (evt) => handleServerMessage(evt.data);
      state.ws.onerror = (e) => { pushLog('error', 'WebSocket error.'); log('ws error', e); };
      state.ws.onclose = () => {
        state.connected = false; state.listening = false;
        setStatusClass(null);
        pushLog('tool', 'Disconnected.');
        stopMicCapture();
      };
    });
  }

  function disconnect() {
    try { state.ws && state.ws.close(); } catch (_) {}
    stopMicCapture();
    state.connected = false; state.listening = false;
    setStatusClass(null);
  }

  function sendWs(obj) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    state.ws.send(JSON.stringify(obj));
  }

  async function handleServerMessage(raw) {
    let msg;
    try { msg = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(new TextDecoder().decode(raw)); }
    catch (_) { return; }

    switch (msg.type) {
      case 'session.created':
      case 'session.updated':
        log('session', msg.type); break;

      case 'input_audio_buffer.speech_started':
        setStatusClass('state-listening'); break;
      case 'input_audio_buffer.speech_stopped':
        setStatusClass('state-connected'); break;

      case 'conversation.item.input_audio_transcription.completed':
        if (msg.transcript) pushLog('user', msg.transcript);
        break;

      // Audio playback — xAI uses "output_audio" prefix; OpenAI uses "audio"
      case 'response.output_audio.delta':
      case 'response.audio.delta':
        if (msg.delta) enqueuePcm(msg.delta);
        break;

      case 'response.output_audio.done':
      case 'response.audio.done':
        // Marker only; playback is driven by queued buffers
        break;

      // Assistant text transcript (streamed alongside audio)
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta':
      case 'response.output_text.delta':
        state.lastAssistantText = (state.lastAssistantText || '') + (msg.delta || '');
        break;

      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done':
      case 'response.output_text.done':
        if (msg.transcript || state.lastAssistantText) {
          pushLog('assistant', msg.transcript || state.lastAssistantText);
        }
        state.lastAssistantText = '';
        break;

      // Tool calls
      case 'response.function_call_arguments.done':
      case 'response.tool_calls.delta':
      case 'response.function_call':
        await handleToolCall(msg);
        break;

      case 'response.done':
        log('response.done');
        if (state.lastAssistantText) { pushLog('assistant', state.lastAssistantText); state.lastAssistantText = ''; }
        break;

      case 'conversation.item.added':
      case 'conversation.item.created':
      case 'response.created':
      case 'response.output_item.added':
      case 'response.output_item.done':
      case 'response.content_part.added':
      case 'response.content_part.done':
      case 'response.function_call_arguments.delta':
      case 'ping':
      case 'rate_limits.updated':
        /* silently consumed — informational envelope events */
        break;

      case 'error':
        pushLog('error', msg.error?.message || 'Server error');
        break;

      default:
        log('unhandled', msg.type, msg);
    }
  }

  async function handleToolCall(msg) {
    // Grok realtime delivers tool calls in several shapes depending on version;
    // handle the common ones.
    const name = msg.name || msg.function_call?.name || msg.tool_name;
    const callId = msg.call_id || msg.tool_call_id || msg.id;
    let args = msg.arguments || msg.function_call?.arguments || msg.tool_input || {};
    if (typeof args === 'string') { try { args = JSON.parse(args); } catch (_) { args = {}; } }
    if (!name || !TOOL_IMPL[name]) return;

    pushLog('tool', `→ ${name}(${JSON.stringify(args)})`);
    let result;
    try { result = await TOOL_IMPL[name](args); }
    catch (e) { result = { ok: false, error: e.message }; }

    sendWs({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(result)
      }
    });
    sendWs({ type: 'response.create' });
  }

  // ══════════════════════════════════════════════════════════════════
  // VOICE ENGINE SELECTION — realtime WebSocket OR browser-speech
  // fallback (chat completions + SpeechRecognition + SpeechSynthesis).
  // The fallback always works as long as the Grok text API is usable.
  // ══════════════════════════════════════════════════════════════════
  const LS_VOICE_ENGINE = 'poseidon_voice_engine';         // auto | websocket | browser
  const LS_TEXT_MODEL   = 'poseidon_text_model';
  const DEFAULT_TEXT_MODEL = 'grok-4.20-0309-reasoning';   // xAI canonical id
  const CHAT_ENDPOINT   = 'https://api.x.ai/v1/chat/completions';

  function getVoiceEngine() { try { return localStorage.getItem(LS_VOICE_ENGINE) || 'auto'; } catch (_) { return 'auto'; } }
  function setVoiceEngine(v) { try { localStorage.setItem(LS_VOICE_ENGINE, v); } catch (_) {} }
  function getTextModel()   { try { return localStorage.getItem(LS_TEXT_MODEL) || DEFAULT_TEXT_MODEL; } catch (_) { return DEFAULT_TEXT_MODEL; } }
  function setTextModel(m)  { try { localStorage.setItem(LS_TEXT_MODEL, m); } catch (_) {} }

  const browserState = {
    recognition: null,
    speaking: false,
    listening: false,
    chosenVoice: null,
    busy: false
  };

  function supportsBrowserSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    return !!(SR && window.speechSynthesis);
  }

  function pickBrowserVoice() {
    try {
      const voices = speechSynthesis.getVoices();
      if (!voices.length) return null;
      // Preferred English male voices in order of availability on Win/Mac/Chrome
      const pref = [
        /Microsoft\s+(Guy|Eric|Davis|Tony|Steffan|Christopher|Brandon)/i,
        /Google US English/i,
        /Alex|Daniel|Fred|Jamie|Aaron|Arthur|Eddy|Reed|Rocko/i,
        /en-US/i, /en-GB/i, /en/i
      ];
      for (const rx of pref) {
        const v = voices.find(x => rx.test(x.name) || rx.test(x.lang));
        if (v) return v;
      }
      return voices[0];
    } catch (_) { return null; }
  }

  function speak(text, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) { resolve(); return; }
      try { speechSynthesis.cancel(); } catch (_) {}
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = opts.rate ?? 1.04;
      utter.pitch = opts.pitch ?? 0.95;
      utter.volume = opts.volume ?? 1.0;
      if (!browserState.chosenVoice) browserState.chosenVoice = pickBrowserVoice();
      if (browserState.chosenVoice) utter.voice = browserState.chosenVoice;
      utter.onstart = () => { browserState.speaking = true; setStatusClass('state-speaking'); };
      utter.onend = () => { browserState.speaking = false; setStatusClass(browserState.listening ? 'state-listening' : 'state-connected'); resolve(); };
      utter.onerror = () => { browserState.speaking = false; resolve(); };
      speechSynthesis.speak(utter);
    });
  }

  // Ensure voices are loaded (Chrome fires voiceschanged asynchronously)
  if ('speechSynthesis' in window) {
    speechSynthesis.onvoiceschanged = () => { browserState.chosenVoice = pickBrowserVoice(); };
  }

  function listenOnce() {
    return new Promise((resolve, reject) => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { reject(new Error('SpeechRecognition not available in this browser')); return; }
      const rec = new SR();
      rec.lang = 'en-US';
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      browserState.recognition = rec;
      browserState.listening = true;
      setStatusClass('state-listening');
      let finalTranscript = '';
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
        }
      };
      rec.onerror = (e) => {
        browserState.listening = false;
        setStatusClass('state-connected');
        reject(new Error('Speech recognition error: ' + (e.error || 'unknown')));
      };
      rec.onend = () => {
        browserState.listening = false;
        setStatusClass('state-connected');
        resolve(finalTranscript.trim());
      };
      try { rec.start(); } catch (e) { reject(e); }
    });
  }

  function stopListening() {
    try { browserState.recognition && browserState.recognition.stop(); } catch (_) {}
    browserState.listening = false;
  }

  // Convert our TOOLS schema → OpenAI-style function tools for chat completions
  function chatTools() {
    return TOOLS.map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters }
    }));
  }

  // Multi-turn tool execution loop against /v1/chat/completions
  async function runChatWithTools(userText) {
    const key = getApiKey();
    if (!key) throw new Error('No Grok API key configured');
    const model = getTextModel();
    const history = state.transcript
      .filter(t => t.role === 'user' || t.role === 'assistant')
      .slice(-10)
      .map(t => ({ role: t.role, content: t.text }));
    const messages = [
      { role: 'system', content: buildSystemInstructions() },
      ...history,
      { role: 'user', content: userText }
    ];

    for (let iter = 0; iter < 5; iter++) {
      const res = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model, messages, tools: chatTools(), tool_choice: 'auto', temperature: 0.4 })
      });
      if (!res.ok) throw new Error(`Grok chat ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) throw new Error('Malformed Grok response');

      if (msg.tool_calls && msg.tool_calls.length) {
        // Append the assistant message with tool calls, then resolve each call
        messages.push(msg);
        for (const call of msg.tool_calls) {
          const fn = call.function || {};
          const name = fn.name;
          let args = fn.arguments || '{}';
          try { args = typeof args === 'string' ? JSON.parse(args) : args; } catch (_) { args = {}; }
          pushLog('tool', `→ ${name}(${JSON.stringify(args)})`);
          let result;
          try { result = await (TOOL_IMPL[name] ? TOOL_IMPL[name](args) : Promise.resolve({ ok: false, error: 'Unknown tool ' + name })); }
          catch (e) { result = { ok: false, error: e.message }; }
          messages.push({ role: 'tool', tool_call_id: call.id, content: typeof result === 'string' ? result : JSON.stringify(result) });
        }
        continue; // next iteration — let Grok respond with tool results in hand
      }

      // Final assistant reply
      return msg.content || '';
    }
    return 'I ran out of tool iterations. Try a narrower question.';
  }

  async function runBrowserTurn(preText) {
    if (browserState.busy) return;
    browserState.busy = true;
    try {
      let userText = preText;
      if (!userText) {
        try { userText = await listenOnce(); }
        catch (e) { pushLog('error', e.message); browserState.busy = false; return; }
      }
      if (!userText) { browserState.busy = false; return; }
      pushLog('user', userText);
      setStatusClass('state-speaking');
      let reply;
      try { reply = await runChatWithTools(userText); }
      catch (e) { pushLog('error', e.message); browserState.busy = false; return; }
      pushLog('assistant', reply);
      await speak(reply);
    } finally {
      browserState.busy = false;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // Mic toggle — tries WebSocket realtime, falls back to browser speech
  // ══════════════════════════════════════════════════════════════════
  async function toggleMic() {
    const btn = panelEl.querySelector('.jv-mic-btn');
    const engine = getVoiceEngine();

    // Browser-only mode, or if realtime WS previously failed
    if (engine === 'browser' || state._forceBrowser) {
      return browserToggle(btn);
    }

    // Try WebSocket first (for 'auto' and 'websocket' modes)
    if (!state.connected) {
      btn.textContent = '⏳ Connecting realtime…'; btn.disabled = true;
      const ok = await connectWithTimeout(6000);
      btn.disabled = false;
      if (!ok) {
        if (engine === 'websocket') {
          btn.textContent = '🎤 Start Talking';
          pushLog('error', 'WebSocket realtime unavailable. Switch Voice Engine to "Browser (fallback)" in Settings to use Jarvis now.');
          return;
        }
        // auto → fall back silently to browser speech
        state._forceBrowser = true;
        pushLog('tool', 'Realtime voice unavailable on this xAI account. Switched to browser-speech mode.');
        return browserToggle(btn);
      }
    }

    // WebSocket active — existing push-to-talk flow
    if (state.listening) {
      state.listening = false;
      stopMicCapture();
      sendWs({ type: 'input_audio_buffer.commit' });
      sendWs({ type: 'response.create' });
      btn.textContent = '🎤 Start Talking';
      btn.classList.remove('rec');
      setStatusClass('state-connected');
    } else {
      try {
        await startMicCapture();
        state.listening = true;
        btn.textContent = '⏺ Listening…';
        btn.classList.add('rec');
        setStatusClass('state-listening');
      } catch (e) {
        pushLog('error', 'Microphone permission denied.');
      }
    }
  }

  async function browserToggle(btn) {
    if (!supportsBrowserSpeech()) {
      pushLog('error', 'Browser speech recognition not available. Use Chrome, Edge, or Safari.');
      return;
    }
    if (browserState.listening) {
      stopListening();
      btn.textContent = '🎤 Start Talking';
      btn.classList.remove('rec');
      return;
    }
    btn.textContent = '⏺ Listening…';
    btn.classList.add('rec');
    try {
      await runBrowserTurn();
    } finally {
      btn.textContent = '🎤 Start Talking';
      btn.classList.remove('rec');
    }
  }

  function connectWithTimeout(ms) {
    return new Promise((resolve) => {
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; resolve(false); } }, ms);
      connect().then((ok) => { if (!done) { done = true; clearTimeout(t); resolve(ok); } })
               .catch(() => { if (!done) { done = true; clearTimeout(t); resolve(false); } });
    });
  }

  async function morningBriefing() {
    const engine = getVoiceEngine();
    const prompt = 'Give me my morning briefing. Call the morning_briefing tool first, then read the script back to me warmly and concisely.';
    if (engine === 'browser' || state._forceBrowser) {
      return runBrowserTurn(prompt);
    }
    if (!state.connected) {
      const ok = await connectWithTimeout(6000);
      if (!ok) {
        if (engine === 'websocket') { pushLog('error', 'WebSocket unavailable.'); return; }
        state._forceBrowser = true;
        return runBrowserTurn(prompt);
      }
    }
    pushLog('user', '☀️ Morning briefing');
    sendWs({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt }] }
    });
    sendWs({ type: 'response.create' });
  }

  function buildSystemInstructions() {
    return [
      'You are Jarvis, the voice assistant embedded inside the CTI Group / Poseidon executive dashboard.',
      'You speak to Robert Upchurch, CEO of CTI Group. Be warm, confident, efficient. Use short sentences. Never be chatty.',
      'You have full tool access to the dashboard DOM: reading state, navigating pages, saving tasks/events, running simulations, opening the Directory, reading the changelog, generating briefings, and producing video briefs.',
      'When the user asks "what\'s on my day", "brief me", or similar, call morning_briefing, then deliver the returned script naturally.',
      'When the user asks about a KPI on a specific division, call read_kpi with that division.',
      'When the user asks you to navigate ("take me to finance", "open J1 housing"), call go_to_page.',
      'When the user asks to add a task or event, call save_task / save_event.',
      'Always respond with audio. Keep responses under 25 seconds unless reading a briefing.',
      `Today is ${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}.`
    ].join(' ');
  }

  // ─── Bootstrap + public API ─────────────────────────────────────
  function bootstrap() {
    buildUI();
    // Restore transcript from last session
    try { state.transcript = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]'); } catch (_) { state.transcript = []; }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap);
  else bootstrap();

  // Replace the legacy ElevenLabs openJarvis with the Grok panel
  window.openJarvis = openPanel;
  window.closeJarvis = closePanel;

  window.PoseidonJarvis = {
    open: openPanel, close: closePanel, toggle: togglePanel,
    connect, disconnect, toggleMic, morningBriefing,
    setApiKey, getApiKey, setVoice, getVoice,
    getVoiceEngine, setVoiceEngine,
    getTextModel, setTextModel,
    runBrowserTurn, speak, listenOnce,
    supportsBrowserSpeech,
    state, tools: TOOLS, toolImpl: TOOL_IMPL,
    pushLog  // for tests / integrations
  };
})();
