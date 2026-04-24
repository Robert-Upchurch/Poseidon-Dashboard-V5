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
      #jarvis-panel .jv-brief-btn:hover,#jarvis-panel .jv-clear-btn:hover{color:#2dd4bf;border-color:rgba(20,184,166,0.5);}
      #jarvis-panel .jv-conn-btn{display:none;background:rgba(239,68,68,0.12);color:#fca5a5;border:1px solid rgba(239,68,68,0.35);}
      #jarvis-panel .jv-conn-btn:hover{background:rgba(239,68,68,0.22);color:#fecaca;border-color:rgba(239,68,68,0.6);}
      #jarvis-panel.state-connected .jv-conn-btn,
      #jarvis-panel.state-listening .jv-conn-btn,
      #jarvis-panel.state-speaking  .jv-conn-btn{display:inline-flex;align-items:center;gap:6px;}

      #jarvis-panel .jv-status-label{margin-left:8px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;}
      #jarvis-panel.state-connected .jv-status-label{color:#22c55e;}
      #jarvis-panel.state-listening .jv-status-label{color:#14b8a6;}
      #jarvis-panel.state-speaking  .jv-status-label{color:#f59e0b;}

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
        <span class="jv-status-label" data-jv-status-label>Idle</span>
        <button class="jv-close" aria-label="Close" data-action="close">&times;</button>
      </div>
      <div class="jv-log" id="jv-log"></div>
      <div class="jv-foot">
        <button class="jv-mic-btn" data-action="toggle-mic">🎤 Start Talking</button>
        <button class="jv-brief-btn" data-action="brief" title="Morning Briefing">☀️ Brief Me</button>
        <button class="jv-conn-btn" data-action="disconnect" title="Disconnect from Grok Voice (releases mic + closes WebSocket)">🔌 Disconnect</button>
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
      else if (act === 'disconnect') {
        try { if (typeof disconnect === 'function') disconnect(); } catch (_) {}
        try { if (typeof stopListening === 'function') stopListening(); } catch (_) {}
        const micBtn = panelEl.querySelector('.jv-mic-btn');
        if (micBtn) { micBtn.textContent = '🎤 Start Talking'; micBtn.classList.remove('rec'); }
        setStatusClass(null);
        pushLog('tool', 'Disconnected from Jarvis. Mic released.');
      }
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
    const labelEl = panelEl.querySelector('[data-jv-status-label]');
    if (labelEl) {
      labelEl.textContent = cls === 'state-listening' ? 'Listening'
                          : cls === 'state-speaking'  ? 'Speaking'
                          : cls === 'state-connected' ? 'Connected'
                          : 'Idle';
    }
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
          page_id: { type: 'string', enum: ['masterforecast','finance','recruitingdivision','processingcuk','j1division','ittech','contracts','j1housing','dashboard','tasks','calendar','videos','projects','partners','settings'], description: 'The page ID to open.' }
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
      description: 'Returns a JSON snapshot of the currently-visible dashboard. Includes KPI tiles, open tasks, upcoming events, AND the full text content of the active page: headings, paragraphs, list items, documents, notes, textarea contents (e.g. pasted PDFs), and filled form fields. Use this to read documents, plans, or notes directly off the dashboard.',
      parameters: {
        type: 'object',
        properties: {
          include_full_content: {
            type: 'boolean',
            description: 'Default true. When true, the active page is deep-scanned for all readable text content.'
          },
          max_len_per_field: {
            type: 'number',
            description: 'Max characters per textarea / document / note (default 4000).'
          }
        }
      }
    },
    {
      type: 'function',
      name: 'read_page_content',
      description: 'Deep-reads the full text content of a SPECIFIC page (not just the active one). Returns headings, paragraphs, list items, documents, notes, textareas, and filled form fields for that page. Useful for "what does the Finance briefing say" or "read the J1 housing notes".',
      parameters: {
        type: 'object',
        properties: {
          page_id: {
            type: 'string',
            enum: ['masterforecast','finance','recruitingdivision','processingcuk','j1division','ittech','contracts','j1housing','dashboard','tasks','calendar','videos','projects','partners','settings'],
            description: 'The page whose content to read.'
          },
          max_len_per_field: {
            type: 'number',
            description: 'Max characters per textarea / document / note (default 4000).'
          }
        },
        required: ['page_id']
      }
    },
    {
      type: 'function',
      name: 'read_kpi',
      description: 'Return the KPI values for a specific division.',
      parameters: {
        type: 'object',
        properties: {
          division: { type: 'string', enum: ['masterforecast','finance','recruitingdivision','processingcuk','j1division','ittech','contracts','j1housing'] }
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
          division: { type: 'string', enum: ['masterforecast','finance','recruitingdivision','processingcuk','j1division','ittech','contracts','j1housing'] },
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
    },
    {
      type: 'function',
      name: 'read_contracts',
      description: 'Read the embedded Cruise Line Contracts dashboard top-to-bottom. Walks every tab (Overview, Fees, Obligations, Legal, Insurance, Positions, Compliance, Pros/Cons), extracts each table and KPI, and returns a structured JSON snapshot of the entire contracts comparison. Use when the user asks anything about cruise line contracts, fees, terms, or wants you to summarize/compare what is on the contracts dashboard.',
      parameters: {
        type: 'object',
        properties: {
          tab: { type: 'string', enum: ['overview','fees','obligations','legal','insurance','positions','compliance','proscons','all'], description: 'Which tab to read. Use "all" (default) to walk every tab top-to-bottom.' },
          line_filter: { type: 'string', description: 'Optional cruise line name substring to focus on (e.g., "Carnival", "Apollo").' }
        }
      }
    },
    {
      type: 'function',
      name: 'read_contracts_lines',
      description: 'List all cruise lines that the Contracts dashboard knows about, with their contract year, brand, ship count, and fees-at-a-glance.',
      parameters: { type: 'object', properties: {} }
    },
    {
      type: 'function',
      name: 'popout_division',
      description: 'Open a division dashboard in a new full-screen tab (embed mode with an exit-door button). Use when the user asks to "open in new tab", "pop out", or "expand" a division.',
      parameters: {
        type: 'object',
        properties: { div_id: { type: 'string', enum: ['masterforecast','finance','recruitingdivision','processingcuk','j1division','ittech','contracts','j1housing'] } },
        required: ['div_id']
      }
    },
    {
      type: 'function',
      name: 'list_analytics_reports',
      description: 'List the analytics reports / charts available for a given division (Finance, Contracts, etc.). Returns each report id, label, and chart type.',
      parameters: {
        type: 'object',
        properties: { div_id: { type: 'string', enum: ['masterforecast','finance','recruitingdivision','processingcuk','j1division','ittech','contracts','j1housing'] } },
        required: ['div_id']
      }
    },
    {
      type: 'function',
      name: 'read_analytics',
      description: 'Read the data behind a specific analytics report (chart) on a division dashboard — returns the chart labels and series so you can summarize or compare the numbers without seeing the chart.',
      parameters: {
        type: 'object',
        properties: {
          div_id:    { type: 'string', enum: ['masterforecast','finance','recruitingdivision','processingcuk','j1division','ittech','contracts','j1housing'] },
          report_id: { type: 'string', description: 'Report id from list_analytics_reports.' }
        },
        required: ['div_id', 'report_id']
      }
    },
    {
      type: 'function',
      name: 'read_full_dashboard',
      description: 'Read every page in the dashboard top-to-bottom in a single call. Returns the title, full text content, and any same-origin iframe content for every division (Master+Forecast, Finance, Recruiting, Processing CUK, J1 Division, IT&Tech, Contracts, J1 Housing) AND every workspace page (Home, Tasks, Calendar, Videos, Projects, Partners, Settings). Use this whenever the user asks to "scan everything", "read the whole dashboard", "summarize the dashboard", "give me a full status", or asks an open-ended question that could span multiple divisions. Reads hidden pages too (textContent, no page-switching required).',
      parameters: {
        type: 'object',
        properties: {
          max_chars_per_page: { type: 'number', description: 'Cap per-page text content (default 4000).' },
          include_iframes:    { type: 'boolean', description: 'Default true. Set false to skip iframe content.' }
        }
      }
    },
    {
      type: 'function',
      name: 'list_popped_windows',
      description: 'List every popped-out browser window the user has opened from the dashboard via "Open in New Tab". Returns each one\'s division id and whether it is still open.',
      parameters: { type: 'object', properties: {} }
    },
    {
      type: 'function',
      name: 'read_popped_window',
      description: 'Read the content of a popped-out tab window. Use after list_popped_windows. Defaults to the most recently opened popout if div_id is omitted.',
      parameters: {
        type: 'object',
        properties: {
          div_id: { type: 'string', description: 'Optional division id of the popped-out window to read.' }
        }
      }
    },

    // ─── Web access ─────────────────────────────────────────────────
    {
      type: 'function',
      name: 'web_search',
      description: 'Search the web for fresh information using DuckDuckGo Instant Answer (CORS-friendly, no API key needed). Best for definitions, simple facts, official site lookups, and disambiguation. For complex queries, fall back to your training data.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query.' }
        },
        required: ['query']
      }
    },
    {
      type: 'function',
      name: 'fetch_url',
      description: 'Fetch a URL and return its text content. Works for CORS-enabled endpoints (most APIs, raw GitHub files, plain text). Browser-side fetch — most arbitrary websites will fail with CORS errors; use this for known-friendly URLs only.',
      parameters: {
        type: 'object',
        properties: {
          url:        { type: 'string', description: 'URL to fetch (https only).' },
          max_chars:  { type: 'number', description: 'Cap response body to N characters (default 4000).' }
        },
        required: ['url']
      }
    },

    // ─── Media discovery + control ──────────────────────────────────
    {
      type: 'function',
      name: 'list_media',
      description: 'List every playable media element on the dashboard right now: native <video> and <audio> elements plus YouTube/Vimeo iframes. Returns id, title, type, src, current state (playing/paused), duration, current time. Use this first when the user asks to play/pause/stop something.',
      parameters: { type: 'object', properties: {} }
    },
    {
      type: 'function',
      name: 'play_media',
      description: 'Play a media element by id or by fuzzy-matching title. If neither is given, plays the first paused media on the page. Works on native video/audio AND YouTube/Vimeo iframes (via postMessage).',
      parameters: {
        type: 'object',
        properties: {
          id:    { type: 'string', description: 'Optional element id.' },
          title: { type: 'string', description: 'Optional title substring (case-insensitive).' },
          seek:  { type: 'number', description: 'Optional seek position in seconds before playing.' }
        }
      }
    },
    {
      type: 'function',
      name: 'pause_media',
      description: 'Pause a media element. If no id/title given, pauses everything currently playing.',
      parameters: {
        type: 'object',
        properties: {
          id:    { type: 'string' },
          title: { type: 'string' }
        }
      }
    },
    {
      type: 'function',
      name: 'stop_media',
      description: 'Stop media playback (pauses + seeks back to 0). If no id/title given, stops everything.',
      parameters: {
        type: 'object',
        properties: {
          id:    { type: 'string' },
          title: { type: 'string' }
        }
      }
    },

    // ─── Long-term memory (cross-session brain) ─────────────────────
    {
      type: 'function',
      name: 'remember',
      description: 'Save a fact to your long-term memory so you recall it in future conversations. Use this when the user tells you something worth keeping ("remember that...", "by the way...", a preference, a deadline, an important name). Keep facts crisp — one or two sentences.',
      parameters: {
        type: 'object',
        properties: {
          topic:  { type: 'string', description: 'Short topic tag, e.g. "preference", "person:rachel", "deadline:q2", "vendor:apollo".' },
          fact:   { type: 'string', description: 'The fact itself, in one or two sentences.' },
          source: { type: 'string', description: 'Optional context: "user said", "from finance dashboard", etc.' }
        },
        required: ['fact']
      }
    },
    {
      type: 'function',
      name: 'recall',
      description: 'Search your memory for a topic or keyword. Always call this BEFORE answering a question that might depend on a prior conversation, a user preference, or a fact about a person/company/vendor. Returns matching live entries plus matching paragraphs from the seed file.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Topic or keyword to search for.' },
          limit: { type: 'number', description: 'Max live entries to return (default 10).' }
        },
        required: ['query']
      }
    },
    {
      type: 'function',
      name: 'list_memory',
      description: 'Dump all current memory entries (most-recent first). Use sparingly — recall() is usually better.',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'Default 50.' } }
      }
    },
    {
      type: 'function',
      name: 'forget',
      description: 'Remove a memory entry by id or by topic match. Use when the user explicitly says to forget something.',
      parameters: {
        type: 'object',
        properties: { topic_or_id: { type: 'string' } },
        required: ['topic_or_id']
      }
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

    read_dashboard_state(args) {
      args = args || {};
      const opts = {
        includeFullContent: args.include_full_content !== false,
        maxLenPerField: args.max_len_per_field || 4000
      };
      const snap = window.PoseidonLLM && window.PoseidonLLM.ClientBriefing.snapshotDashboard
        ? window.PoseidonLLM.ClientBriefing.snapshotDashboard(opts)
        : { error: 'LLM module unavailable' };
      snap.activePage = document.querySelector('.page.active:not(.hidden), .page:not(.hidden)')?.id || snap.activePageId || null;
      snap.pageTitle = document.getElementById('page-title')?.textContent || null;
      return snap;
    },

    read_page_content(args) {
      args = args || {};
      const page = document.getElementById(args.page_id);
      if (!page) return { ok: false, error: `Page '${args.page_id}' not found` };
      if (!window.PoseidonLLM || !window.PoseidonLLM.ClientBriefing.extractPageContent) {
        return { ok: false, error: 'LLM module unavailable' };
      }
      const content = window.PoseidonLLM.ClientBriefing.extractPageContent(page, {
        maxLenPerField: args.max_len_per_field || 4000
      });
      return { ok: true, page_id: args.page_id, content };
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
    restart_training(){ if (window.PoseidonTraining)  window.PoseidonTraining.restart(); return { ok: true }; },

    // ─── CONTRACTS — read the embedded iframe end-to-end ────────────
    async read_contracts({ tab = 'all', line_filter = '' } = {}) {
      const link = document.querySelector('.nav-link[data-page="contracts"]');
      if (link) link.click();
      const frame = await new Promise(resolve => {
        const start = Date.now();
        (function poll() {
          const f = document.getElementById('contracts-frame');
          if (f && f.contentDocument && f.contentDocument.readyState === 'complete' && f.contentDocument.body && f.contentDocument.body.innerText.length > 100) return resolve(f);
          if (Date.now() - start > 8000) return resolve(f || null);
          setTimeout(poll, 200);
        })();
      });
      if (!frame || !frame.contentDocument) return { ok: false, error: 'Contracts iframe is not loaded.' };
      const doc = frame.contentDocument;

      const tabs = ['overview','fees','obligations','legal','insurance','positions','compliance','proscons'];
      const targets = tab === 'all' ? tabs : [tab];

      function activate(t) { const btn = doc.querySelector(`.tab[data-tab="${t}"]`); if (btn) btn.click(); }
      function panelText(t) {
        const panel = doc.getElementById('panel-' + t);
        if (!panel) return null;
        return (panel.innerText || '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      }
      function panelTable(t) {
        const panel = doc.getElementById('panel-' + t);
        if (!panel) return null;
        const tbl = panel.querySelector('table');
        if (!tbl) return null;
        const rows = [];
        tbl.querySelectorAll('tr').forEach(tr => {
          const cells = [...tr.querySelectorAll('th,td')].map(td => (td.innerText || '').trim());
          if (cells.length) rows.push(cells);
        });
        return rows;
      }

      const kpis = [...doc.querySelectorAll('.kpi')].map(k => ({
        label: (k.querySelector('.lab')?.innerText || '').trim(),
        value: (k.querySelector('.val')?.innerText || '').trim()
      }));
      const activeLines = [...doc.querySelectorAll('.line-pill.active')].map(p => p.innerText.trim());

      const out = { ok: true, kpis, active_lines: activeLines, tabs: {} };

      for (const t of targets) {
        activate(t);
        await new Promise(r => setTimeout(r, 250));
        out.tabs[t] = { text: panelText(t), table: panelTable(t) };
      }

      if (line_filter) {
        const re = new RegExp(line_filter, 'i');
        for (const t of Object.keys(out.tabs)) {
          const tbl = out.tabs[t].table;
          if (Array.isArray(tbl) && tbl.length > 1) {
            const header = tbl[0];
            const keepIdx = header.map((h, i) => i === 0 || re.test(h) ? i : -1).filter(i => i >= 0);
            out.tabs[t].table = tbl.map(row => keepIdx.map(i => row[i]));
          }
        }
        out.filter = line_filter;
      }

      activate('overview');
      return out;
    },

    read_contracts_lines() {
      const frame = document.getElementById('contracts-frame');
      if (!frame || !frame.contentWindow) return { ok: false, error: 'Contracts iframe not mounted. Call read_contracts first.' };
      const LINES = frame.contentWindow.LINES;
      if (!Array.isArray(LINES)) return { ok: false, error: 'LINES dataset not exposed by iframe.' };
      return {
        ok: true,
        count: LINES.length,
        lines: LINES.map(l => ({
          id: l.id, name: l.name, brand: l.brand, parent: l.parent,
          year: l.contractYear, contract_type: l.contractType,
          ships: l.ships, crew_source: l.crewSource,
          fees: l.fees ? { newHire: l.fees.newHire, rehire: l.fees.rehire, monthly: l.fees.monthly } : null
        }))
      };
    },

    // ─── Universal toolbar tools (popout + analytics) ────────────────
    popout_division({ div_id }) {
      if (!window.PoseidonToolbar) return { ok: false, error: 'Toolbar module not loaded' };
      window.PoseidonToolbar.popoutDivision(div_id);
      return { ok: true, div_id, opened: 'new_tab' };
    },
    list_analytics_reports({ div_id }) {
      if (!window.PoseidonToolbar) return { ok: false, error: 'Toolbar module not loaded' };
      const reports = window.PoseidonToolbar.listReports(div_id);
      return { ok: true, div_id, count: reports.length, reports };
    },
    async read_analytics({ div_id, report_id }) {
      if (!window.PoseidonToolbar) return { ok: false, error: 'Toolbar module not loaded' };
      // For Contracts, ensure the iframe is mounted so LINES is available
      if (div_id === 'contracts' && !document.getElementById('contracts-frame')) {
        const link = document.querySelector('.nav-link[data-page="contracts"]');
        if (link) link.click();
        await new Promise(r => setTimeout(r, 1500));
      }
      return window.PoseidonToolbar.readReport(div_id, report_id);
    },

    // ─── Read every page in one call (hidden + iframes) ─────────────
    async read_full_dashboard({ max_chars_per_page = 4000, include_iframes = true } = {}) {
      // Make sure the Contracts iframe is mounted so we get its content too.
      const contractsLink = document.querySelector('.nav-link[data-page="contracts"]');
      const wasContractsMounted = !!document.getElementById('contracts-frame');
      if (!wasContractsMounted && contractsLink) {
        const original = document.querySelector('.page:not(.hidden)')?.id;
        contractsLink.click();
        await new Promise(r => setTimeout(r, 1500));
        if (original) document.querySelector(`.nav-link[data-page="${original}"]`)?.click();
      }

      const ALL_PAGES = [
        'masterforecast','finance','recruitingdivision','processingcuk',
        'j1division','ittech','contracts','j1housing',
        'dashboard','tasks','calendar','videos','projects','partners','settings'
      ];
      const pages = {};
      let totalChars = 0;
      for (const id of ALL_PAGES) {
        const el = document.getElementById(id);
        if (!el) continue;
        const raw = (el.textContent || '').replace(/\s+/g, ' ').trim();
        let iframeText = '';
        if (include_iframes) {
          el.querySelectorAll('iframe').forEach(f => {
            try {
              const inner = f.contentDocument?.body?.innerText || '';
              if (inner) iframeText += `\n[iframe ${f.id || 'anon'}]:\n${inner.slice(0, max_chars_per_page)}`;
            } catch (_) {
              iframeText += `\n[iframe ${f.id || 'anon'}]: cross-origin, cannot read`;
            }
          });
        }
        pages[id] = {
          title:    el.querySelector('h2')?.textContent?.trim() || el.querySelector('h1')?.textContent?.trim() || id,
          text:     raw.slice(0, max_chars_per_page),
          char_count_total: raw.length,
          iframe:   iframeText.slice(0, max_chars_per_page),
          hidden:   el.classList.contains('hidden')
        };
        totalChars += raw.length;
      }
      return {
        ok: true,
        pages,
        total_pages: Object.keys(pages).length,
        total_chars: totalChars,
        active_page: document.querySelector('.page:not(.hidden)')?.id || null,
        captured_at: new Date().toISOString()
      };
    },

    list_popped_windows() {
      const popouts = window.PoseidonToolbar?.activePopouts?.() || [];
      return {
        ok: true,
        count: popouts.length,
        windows: popouts.map(p => ({ div_id: p.divId, opened_at: p.openedAt, still_open: p.win && !p.win.closed }))
      };
    },

    read_popped_window({ div_id } = {}) {
      const popouts = window.PoseidonToolbar?.activePopouts?.() || [];
      if (!popouts.length) return { ok: false, error: 'No popped-out windows are currently open. Use popout_division first or open one via the "Open in New Tab" button.' };
      const target = div_id ? popouts.find(p => p.divId === div_id) : popouts[popouts.length - 1];
      if (!target) return { ok: false, error: 'No popped-out window matches div_id="' + div_id + '"' };
      try {
        const doc = target.win.document;
        const page = doc.getElementById(target.divId);
        const text = (page?.textContent || doc.body.textContent || '').replace(/\s+/g, ' ').trim();
        // Read iframes in the popped window too
        let iframeText = '';
        (page || doc).querySelectorAll('iframe').forEach(f => {
          try {
            const inner = f.contentDocument?.body?.innerText || '';
            if (inner) iframeText += `\n[iframe ${f.id || 'anon'}]:\n${inner.slice(0, 4000)}`;
          } catch (_) {}
        });
        return {
          ok: true,
          div_id: target.divId,
          opened_at: target.openedAt,
          text:   text.slice(0, 6000),
          iframe: iframeText.slice(0, 4000),
          char_count_total: text.length,
          embed_mode: doc.body.classList.contains('pt-embed')
        };
      } catch (e) {
        return { ok: false, error: 'Could not read popped window: ' + e.message };
      }
    },

    // ─── Web search (DuckDuckGo Instant Answer — CORS-friendly) ─────
    async web_search({ query }) {
      try {
        const url = 'https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=0&q=' + encodeURIComponent(query);
        const r = await fetch(url);
        if (!r.ok) return { ok: false, error: 'DuckDuckGo HTTP ' + r.status };
        const d = await r.json();
        const related = (d.RelatedTopics || []).slice(0, 8).map(t => ({
          text: t.Text || (t.Topics && t.Topics[0]?.Text) || '',
          url:  t.FirstURL || (t.Topics && t.Topics[0]?.FirstURL) || ''
        })).filter(x => x.text);
        return {
          ok: true,
          query,
          abstract:        d.Abstract || d.AbstractText || '',
          abstract_source: d.AbstractSource || '',
          abstract_url:    d.AbstractURL || '',
          definition:      d.Definition || '',
          definition_url:  d.DefinitionURL || '',
          answer:          d.Answer || '',
          answer_type:     d.AnswerType || '',
          heading:         d.Heading || '',
          related,
          fallback_url:    'https://duckduckgo.com/?q=' + encodeURIComponent(query)
        };
      } catch (e) {
        return { ok: false, error: 'web_search failed: ' + e.message };
      }
    },

    async fetch_url({ url, max_chars = 4000 }) {
      try {
        if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'URL must start with http:// or https://' };
        const r = await fetch(url);
        if (!r.ok) return { ok: false, error: 'HTTP ' + r.status, status: r.status };
        const ct = r.headers.get('content-type') || '';
        let body;
        if (/json/i.test(ct)) {
          body = JSON.stringify(await r.json(), null, 2);
        } else {
          body = await r.text();
          // Strip script/style blocks + tags so HTML reads as text
          body = body.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
        return { ok: true, url, content_type: ct, status: r.status, body: body.slice(0, max_chars), truncated: body.length > max_chars };
      } catch (e) {
        return { ok: false, error: 'fetch_url failed (often CORS): ' + e.message };
      }
    },

    // ─── Media discovery + control ──────────────────────────────────
    list_media() {
      const out = [];
      // Walk the parent doc + every popped-out tab so Jarvis sees media
      // even when the user has expanded a division to a new window.
      const docs = [document];
      try { (window.PoseidonToolbar?.activePopouts?.() || []).forEach(p => { try { docs.push(p.win.document); } catch (_) {} }); } catch (_) {}
      docs.forEach((doc, scope) => {
        // Native video / audio
        doc.querySelectorAll('video, audio').forEach((el, i) => {
          out.push(_describeMedia(el, scope === 0 ? 'main' : 'popout', i));
        });
        // YouTube / Vimeo iframes
        doc.querySelectorAll('iframe').forEach((f, i) => {
          const src = f.src || '';
          if (/youtube\.com\/embed|youtu\.be|youtube-nocookie/.test(src)) {
            out.push({ id: f.id || ('yt-' + i), title: f.title || _ytTitleFromSrc(src), type: 'youtube', src, scope: scope === 0 ? 'main' : 'popout', state: 'unknown' });
          } else if (/player\.vimeo\.com/.test(src)) {
            out.push({ id: f.id || ('vimeo-' + i), title: f.title || 'Vimeo', type: 'vimeo', src, scope: scope === 0 ? 'main' : 'popout', state: 'unknown' });
          }
        });
      });
      return { ok: true, count: out.length, media: out };
    },

    play_media({ id, title, seek } = {}) {
      const target = _findMedia(id, title, /* prefer */ 'paused');
      if (!target) return { ok: false, error: 'No matching media found. Call list_media first.' };
      return _command(target, 'play', { seek });
    },

    pause_media({ id, title } = {}) {
      // If no id/title, pause everything currently playing
      if (!id && !title) {
        const all = _allMedia().filter(m => m.state === 'playing');
        if (!all.length) return { ok: true, paused: 0, note: 'Nothing was playing.' };
        all.forEach(m => _command(m, 'pause'));
        return { ok: true, paused: all.length };
      }
      const target = _findMedia(id, title);
      if (!target) return { ok: false, error: 'No matching media found.' };
      return _command(target, 'pause');
    },

    stop_media({ id, title } = {}) {
      if (!id && !title) {
        const all = _allMedia();
        all.forEach(m => _command(m, 'stop'));
        return { ok: true, stopped: all.length };
      }
      const target = _findMedia(id, title);
      if (!target) return { ok: false, error: 'No matching media found.' };
      return _command(target, 'stop');
    },

    // ─── Long-term memory (uses window.JarvisMemory) ────────────────
    remember(args)        { if (!window.JarvisMemory) return { ok: false, error: 'Memory module not loaded' }; return window.JarvisMemory.remember(args); },
    recall({ query, limit }) { if (!window.JarvisMemory) return { ok: false, error: 'Memory module not loaded' }; return window.JarvisMemory.recall(query, limit); },
    list_memory({ limit } = {}) { if (!window.JarvisMemory) return { ok: false, error: 'Memory module not loaded' }; return window.JarvisMemory.list(limit); },
    forget({ topic_or_id })  { if (!window.JarvisMemory) return { ok: false, error: 'Memory module not loaded' }; return window.JarvisMemory.forget(topic_or_id); }
  };

  // ─── Media helpers ────────────────────────────────────────────────
  function _describeMedia(el, scope, i) {
    return {
      id:       el.id || (el.tagName.toLowerCase() + '-' + i),
      title:    el.getAttribute('title') || el.dataset?.title || el.getAttribute('aria-label') || el.currentSrc || el.src || ('Media ' + i),
      type:     el.tagName.toLowerCase(),
      src:      el.currentSrc || el.src || '',
      scope,
      state:    el.paused ? 'paused' : 'playing',
      duration: isFinite(el.duration) ? el.duration : null,
      currentTime: el.currentTime,
      muted:    el.muted,
      volume:   el.volume
    };
  }
  function _ytTitleFromSrc(src) {
    const m = src.match(/embed\/([^?&]+)/) || src.match(/v=([^&]+)/);
    return m ? 'YouTube ' + m[1] : 'YouTube';
  }
  function _allMedia() {
    return TOOL_IMPL.list_media().media;
  }
  function _findMedia(id, title, prefer) {
    const all = _allMedia();
    if (id) {
      const exact = all.find(m => m.id === id);
      if (exact) return exact;
    }
    if (title) {
      const re = new RegExp(title, 'i');
      const matches = all.filter(m => re.test(m.title || '') || re.test(m.src || '') || re.test(m.type || '') || re.test(m.id || ''));
      if (matches.length) {
        const preferred = prefer && matches.find(m => m.state === prefer);
        return preferred || matches[0];
      }
    }
    if (!id && !title) {
      const preferred = prefer && all.find(m => m.state === prefer);
      return preferred || all[0];
    }
    return null;
  }
  function _resolveElement(media) {
    // Look in main doc first, then popouts
    const docs = [document];
    try { (window.PoseidonToolbar?.activePopouts?.() || []).forEach(p => { try { docs.push(p.win.document); } catch (_) {} }); } catch (_) {}
    for (const doc of docs) {
      const el = doc.getElementById(media.id);
      if (el) return el;
    }
    return null;
  }
  function _command(media, cmd, opts = {}) {
    const el = _resolveElement(media);
    if (!el) return { ok: false, error: 'Could not resolve element for ' + media.id };
    if (media.type === 'video' || media.type === 'audio') {
      if (cmd === 'play') {
        if (typeof opts.seek === 'number') try { el.currentTime = opts.seek; } catch (_) {}
        const p = el.play();
        if (p && p.catch) p.catch(() => {});
        return { ok: true, action: 'play', id: media.id, title: media.title };
      }
      if (cmd === 'pause') { el.pause(); return { ok: true, action: 'pause', id: media.id, title: media.title }; }
      if (cmd === 'stop')  { el.pause(); try { el.currentTime = 0; } catch (_) {} return { ok: true, action: 'stop', id: media.id, title: media.title }; }
    }
    if (media.type === 'youtube') {
      const fn = cmd === 'play' ? 'playVideo' : cmd === 'pause' ? 'pauseVideo' : 'stopVideo';
      try { el.contentWindow.postMessage(JSON.stringify({ event: 'command', func: fn, args: [] }), '*'); } catch (_) {}
      return { ok: true, action: cmd, id: media.id, title: media.title, note: 'YouTube iframe needs ?enablejsapi=1 in src for control to work' };
    }
    if (media.type === 'vimeo') {
      const fn = cmd === 'stop' ? 'pause' : cmd;
      try { el.contentWindow.postMessage(JSON.stringify({ method: fn }), '*'); } catch (_) {}
      return { ok: true, action: cmd, id: media.id, title: media.title };
    }
    return { ok: false, error: 'Unknown media type: ' + media.type };
  }

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
      'When the user asks anything about cruise line contracts, fees, terms, obligations, legal, insurance, positions, compliance, or pros/cons — first call read_contracts (or read_contracts_lines for a quick line list), then summarize the results. The Contracts dashboard is fully readable end-to-end via these tools.',
      'When the user asks to "open in new tab", "pop out", or "expand" a division, call popout_division. For analytics or chart questions on a division, call list_analytics_reports first to discover available reports, then read_analytics to pull the actual numbers behind the chart.',
      'When the user asks for an overall scan of the dashboard ("what is on the dashboard", "scan everything", "summarize the whole thing", "give me a full status", or any question that could span multiple divisions), call read_full_dashboard — it returns every page\'s title + text + iframe content in one call, even for hidden pages.',
      'If the user has popped a division out into a separate tab and you need to read what is in that tab, call list_popped_windows then read_popped_window. You can read the popped tab\'s text, iframes, and embed-mode state without the user having to switch back.',
      'For fresh facts you do not know, call web_search (DuckDuckGo Instant Answer). For specific URL contents, call fetch_url — many sites will fail with CORS, so prefer known-friendly endpoints (raw GitHub files, JSON APIs, etc.).',
      'For media playback ("play that video", "pause the song", "stop the audio", "play the X video"), call list_media first to discover what is on the page, then play_media / pause_media / stop_media with id or title. The tools work on native video/audio AND YouTube/Vimeo iframes (and even on media in popped-out tabs).',
      'You have a long-term memory that persists across browser sessions. When the user tells you something worth keeping ("remember that X", a preference, a name, a deadline), call remember({topic, fact}). Before answering anything that depends on prior context (a person, a vendor, a past conversation, a stated preference), FIRST call recall(query) — your memory may already have it. Only use forget() when the user explicitly asks you to forget something.',
      _memorySnippet(),
      'Always respond with audio. Keep responses under 25 seconds unless reading a briefing.',
      `Today is ${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}.`
    ].filter(Boolean).join(' ');
  }
  function _memorySnippet() {
    try {
      const mem = window.JarvisMemory && window.JarvisMemory.read();
      if (!mem) return '';
      const seedExcerpt = (mem.seed || '').slice(0, 1500);
      const recent = (mem.entries || []).slice(-10).map(e => `[${e.topic}] ${e.fact}`).join(' | ');
      const parts = [];
      if (seedExcerpt) parts.push('Memory seed (long-term context): ' + seedExcerpt);
      if (recent)      parts.push('Recent memory entries: ' + recent);
      return parts.length ? parts.join(' ') : '';
    } catch (_) { return ''; }
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
