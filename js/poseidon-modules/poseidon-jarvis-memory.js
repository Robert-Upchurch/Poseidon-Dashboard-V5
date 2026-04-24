/* ═══════════════════════════════════════════════════════════════════
   POSEIDON v6 — JARVIS LONG-TERM MEMORY
   Persistent brain for the in-browser voice assistant.

   Two layers, merged into one view:
     1. Seed memory (fetched from config/jarvis-memory.md)
        - Lives in the repo, edited by Robert, deployed via Pages.
        - Read-only from the browser side.
     2. Live memory (browser localStorage poseidon_jarvis_memory_v1)
        - Append-only structured entries Jarvis writes during chats.
        - Survives browser restarts (per-browser, per-device).

   Public API (window.JarvisMemory):
     - load()                          — fetch + cache the seed file
     - read()                          — { seed: string, entries: [...] }
     - remember({ topic, fact, source })
     - recall(query, limit=10)         — substring search across both
     - list(limit=50)                  — full ordered list
     - forget(topic_or_id)             — remove by id or topic match
     - compress()                      — collapses oldest entries into
                                          one summary line when count
                                          exceeds 80
     - export()                        — returns Markdown of full memory
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const SEED_URL = 'config/jarvis-memory.md';
  const LS_KEY   = 'poseidon_jarvis_memory_v1';
  const SOFT_CAP = 80;

  const state = {
    seed:    '',
    seedAt:  null,
    entries: []   // { id, topic, fact, source, addedAt }
  };

  // ─── persistence ────────────────────────────────────────────────
  function loadEntries() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      state.entries = raw ? JSON.parse(raw) : [];
    } catch (_) { state.entries = []; }
  }
  function saveEntries() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state.entries)); } catch (_) {}
  }

  // ─── seed file fetch ────────────────────────────────────────────
  async function loadSeed(force) {
    if (state.seed && !force) return state.seed;
    try {
      const r = await fetch(SEED_URL + (force ? ('?_t=' + Date.now()) : ''), { cache: force ? 'no-store' : 'default' });
      if (r.ok) {
        state.seed = await r.text();
        state.seedAt = new Date();
      }
    } catch (e) {
      console.warn('[JarvisMemory] seed load failed:', e.message);
    }
    return state.seed;
  }

  // ─── api ────────────────────────────────────────────────────────
  function read() {
    return {
      seed:    state.seed,
      entries: state.entries.slice(),
      seedLoadedAt: state.seedAt ? state.seedAt.toISOString() : null,
      entryCount: state.entries.length
    };
  }

  function remember({ topic, fact, source } = {}) {
    if (!fact || !String(fact).trim()) return { ok: false, error: 'fact is required' };
    const entry = {
      id:      'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      topic:   String(topic || 'general').toLowerCase(),
      fact:    String(fact).trim().slice(0, 800),
      source:  source ? String(source).slice(0, 80) : 'jarvis',
      addedAt: new Date().toISOString()
    };
    state.entries.push(entry);
    if (state.entries.length > SOFT_CAP) compress();
    saveEntries();
    return { ok: true, entry, total: state.entries.length };
  }

  function recall(query, limit = 10) {
    const q = String(query || '').toLowerCase();
    if (!q) return list(limit);
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    // Search live entries
    const liveHits = state.entries.filter(e => re.test(e.topic) || re.test(e.fact)).slice(0, limit);
    // Search seed file (return matching paragraphs)
    const seedHits = (state.seed || '')
      .split(/\n\n+/)
      .filter(p => re.test(p))
      .slice(0, 5);
    return {
      ok: true,
      query,
      live_hits:    liveHits,
      seed_hits:    seedHits,
      total_live:   liveHits.length,
      total_seed:   seedHits.length
    };
  }

  function list(limit = 50) {
    return {
      ok: true,
      entries: state.entries.slice(-limit).reverse(),
      total:   state.entries.length,
      seed_present: !!state.seed
    };
  }

  function forget(topicOrId) {
    if (!topicOrId) return { ok: false, error: 'topic_or_id is required' };
    const before = state.entries.length;
    const t = String(topicOrId).toLowerCase();
    state.entries = state.entries.filter(e => e.id !== topicOrId && e.topic !== t);
    saveEntries();
    return { ok: true, removed: before - state.entries.length, remaining: state.entries.length };
  }

  // Compress oldest 1/3 of entries into a single summary line so the
  // memory file stays bounded but nothing is silently lost — the
  // condensed entry preserves topics + dates + counts.
  function compress() {
    if (state.entries.length <= SOFT_CAP) return { ok: true, compressed: 0 };
    const cutoff = Math.floor(state.entries.length / 3);
    const old    = state.entries.slice(0, cutoff);
    const rest   = state.entries.slice(cutoff);
    const topics = [...new Set(old.map(e => e.topic))];
    const summary = {
      id:      'compressed-' + Date.now().toString(36),
      topic:   'compressed',
      fact:    `Compressed ${old.length} earlier entries (${old[0].addedAt.slice(0,10)} to ${old[old.length-1].addedAt.slice(0,10)}). Topics covered: ${topics.join(', ')}.`,
      source:  'auto-compress',
      addedAt: new Date().toISOString()
    };
    state.entries = [summary, ...rest];
    saveEntries();
    return { ok: true, compressed: old.length, remaining: state.entries.length };
  }

  function exportMarkdown() {
    let md = '# Jarvis Memory Export\n\n_Exported ' + new Date().toISOString() + '_\n\n';
    md += '## Seed (read-only, from config/jarvis-memory.md)\n\n' + (state.seed || '_(seed not loaded)_') + '\n\n';
    md += '## Live entries (' + state.entries.length + ')\n\n';
    state.entries.forEach(e => {
      md += `- **[${e.topic}]** ${e.fact}  \n  _${e.addedAt}_ · source: ${e.source}\n`;
    });
    return md;
  }

  // ─── boot ───────────────────────────────────────────────────────
  loadEntries();
  loadSeed();

  window.JarvisMemory = {
    load:     loadSeed,
    read,
    remember,
    recall,
    list,
    forget,
    compress,
    export:   exportMarkdown
  };
})();
