"""
Two fixes (both v6 + j1-system):

1. The OLD ElevenLabs Jarvis is still in the markup. Robert wants it gone.
   - Remove the `<!-- JARVIS AI MODAL -->` comment + #jarvis-modal div block
   - Remove the elevenlabs convai-widget script tag
   - Remove the "Talk to Jarvis" button (the new Grok FAB at bottom-right
     is always visible and is the canonical Jarvis trigger)
   - Rewrite `function openJarvis()` and `function closeJarvis()` to
     simply delegate to window.PoseidonJarvis (the new Grok Jarvis).
     This is defensive in case any code path still calls them.

2. The wake-lock script I injected in PR #41 landed inside a
   `w.document.write(\\\`...\\\`)` template literal in rdExportDivisionPDF
   because there are FOUR `</body>` strings in the file and my Python
   replace hit the FIRST. Result: wake lock isn't running on the main
   page, and the PDF-export popup gets a stray script tag.
   Fix: remove the wake-lock script block from inside that template,
   re-inject right before the file's FINAL `</body></html>`.
"""
import io, os, re, sys

REPO = r"C:\Users\ceo\OneDrive - CTI Group Worldwide Services Inc\POSEIDON\Claude-Workspace\Code-Projects\Poseidon-Dashboard-V5"

def read(p):
    with io.open(p, 'r', encoding='utf-8', newline='') as f:
        return f.read()

def write(p, s):
    if not s.rstrip().lower().endswith('</html>'):
        raise SystemExit(f"refusing to write {p}: does not end with </html>")
    with io.open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(s)

WAKE_LOCK_SCRIPT_BLOCK = """
<script>
// ===== Screen Wake Lock — keep phone awake while dashboard is in use =====
// Locked by Robert 2026-04-29:
//   - Acquire on page load (dashboard just opened)
//   - Release after 10 min of no voice activity (Jarvis speaking/listening)
//   - Re-acquire on next voice activity
//   - Re-acquire on tab visible (Wake Lock auto-releases when tab is hidden)
// No-op on browsers without Wake Lock API.
(function _poseidonWakeLock() {
    if (window.__poseidonWakeLockWired) return;
    window.__poseidonWakeLockWired = true;
    if (!('wakeLock' in navigator)) {
        console.info('[wake-lock] Wake Lock API not available in this browser; skipping.');
        return;
    }

    const IDLE_MS = 10 * 60 * 1000;
    let lock = null;
    let lastActivity = Date.now();

    async function acquire() {
        if (lock) return;
        try {
            lock = await navigator.wakeLock.request('screen');
            lock.addEventListener('release', () => { lock = null; });
            console.info('[wake-lock] acquired');
        } catch (e) {
            console.warn('[wake-lock] acquire failed:', e && e.message ? e.message : e);
        }
    }
    async function release() {
        if (!lock) return;
        try { await lock.release(); } catch (_) {}
        lock = null;
        console.info('[wake-lock] released (10 min idle)');
    }

    // Initial acquire — user just opened the dashboard, they're engaged.
    acquire();

    // When tab becomes visible again, re-acquire (browsers auto-release on hide)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            lastActivity = Date.now();
            acquire();
        }
    });

    // Poll Jarvis voice state every 5s. If actively speaking or listening,
    // bump lastActivity. If we go IDLE_MS without activity, release.
    setInterval(() => {
        try {
            const s = window.PoseidonJarvis && window.PoseidonJarvis.state;
            if (s && (s.speaking || s.listening)) {
                lastActivity = Date.now();
                if (!lock) acquire();
            }
        } catch (_) {}
        if (lock && (Date.now() - lastActivity > IDLE_MS)) {
            release();
        }
    }, 5000);

    // Expose a manual hook for any other code that wants to register activity
    window.poseidonRegisterActivity = function () {
        lastActivity = Date.now();
        if (!lock) acquire();
    };
})();
</script>
"""

# --- 1. Remove the misplaced wake-lock block (it's inside w.document.write) ---
# Pattern: it's between "w.document.write(`" and the next "</body></html>`)" close
# We'll be precise: find the WAKE_LOCK_SCRIPT_BLOCK substring and delete it.

# --- 2. Remove old Jarvis modal block ---
OLD_MODAL = (
    "<!-- ═══════════ JARVIS AI MODAL ═══════════ -->\n"
    "<div id=\"jarvis-modal\" class=\"fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] hidden items-center justify-center\" onclick=\"if(event.target===this)closeJarvis()\">\n"
    "    <div class=\"w-[420px] h-[620px] rounded-2xl overflow-hidden shadow-2xl relative bg-zinc-900\">\n"
    "        <button onclick=\"closeJarvis()\" class=\"absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-red-500/80 transition-colors\">✕</button>\n"
    "        <div id=\"jarvis-widget-container\" class=\"w-full h-full flex items-center justify-center\"></div>\n"
    "    </div>\n"
    "</div>\n"
    "<script src=\"https://elevenlabs.io/convai-widget/index.js\" async></script>\n"
)

# --- 3. Remove the "Talk to Jarvis" button ---
TALK_BTN = (
    "            <button onclick=\"openJarvis()\" class=\"text-xs px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition-colors font-medium\">Talk to Jarvis</button>\n"
)

# --- 4. Replace function openJarvis()/closeJarvis() with delegating no-ops ---
OLD_OPEN_JARVIS_FN = (
    "function openJarvis() {\n"
    "    const modal = $('jarvis-modal');\n"
    "    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }\n"
    "    if (!jarvisLoaded) {\n"
    "        const container = $('jarvis-widget-container');\n"
    "        if (container) {\n"
    "            container.innerHTML = '<elevenlabs-convai agent-id=\"agent_2401knj1whdcepxrp744rkf8ap06\"></elevenlabs-convai>';\n"
    "            jarvisLoaded = true;\n"
    "        }\n"
    "    }\n"
    "}\n"
    "\n"
    "function closeJarvis() {\n"
    "    const modal = $('jarvis-modal');\n"
    "    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }\n"
    "}\n"
)

NEW_OPEN_JARVIS_FN = (
    "// Old ElevenLabs Jarvis was removed 2026-04-29. These now delegate\n"
    "// to the new Grok Jarvis (window.PoseidonJarvis) so any old call\n"
    "// site still works.\n"
    "function openJarvis() {\n"
    "    if (window.PoseidonJarvis && window.PoseidonJarvis.open) window.PoseidonJarvis.open();\n"
    "}\n"
    "function closeJarvis() {\n"
    "    if (window.PoseidonJarvis && window.PoseidonJarvis.close) window.PoseidonJarvis.close();\n"
    "}\n"
)

results = []
for fname in ['poseidon-dashboard-v6.html', 'j1-system-dashboard.html']:
    p = os.path.join(REPO, fname)
    src = read(p)

    # Remove the old wake-lock injection from inside the popup template.
    if WAKE_LOCK_SCRIPT_BLOCK in src:
        src = src.replace(WAKE_LOCK_SCRIPT_BLOCK, '', 1)
        results.append(f"{fname}: misplaced wake-lock removed from popup template")
    else:
        results.append(f"{fname}: WARN wake-lock block not found verbatim (continuing)")

    # Remove old Jarvis modal + script tag.
    if OLD_MODAL in src:
        src = src.replace(OLD_MODAL, '', 1)
        results.append(f"{fname}: old Jarvis modal + ElevenLabs script removed")
    else:
        results.append(f"{fname}: WARN old modal not found")

    # Remove the "Talk to Jarvis" button.
    if TALK_BTN in src:
        src = src.replace(TALK_BTN, '', 1)
        results.append(f"{fname}: Talk to Jarvis button removed")
    else:
        results.append(f"{fname}: WARN talk button not found")

    # Replace openJarvis/closeJarvis with delegating versions.
    if OLD_OPEN_JARVIS_FN in src:
        src = src.replace(OLD_OPEN_JARVIS_FN, NEW_OPEN_JARVIS_FN, 1)
        results.append(f"{fname}: openJarvis/closeJarvis now delegate to PoseidonJarvis")
    else:
        results.append(f"{fname}: WARN openJarvis fn not found verbatim")

    # Re-inject wake lock right before the FINAL </body></html>
    last_close = src.rfind('</body></html>')
    if last_close == -1:
        last_close = src.rfind('</body>')
    if last_close == -1:
        results.append(f"{fname}: WARN no </body> found - SKIPPING wake-lock re-injection")
    else:
        # Make sure we haven't already re-injected
        if '__poseidonWakeLockWired' not in src:
            src = src[:last_close] + WAKE_LOCK_SCRIPT_BLOCK + '\n' + src[last_close:]
            results.append(f"{fname}: wake-lock re-injected before final </body></html>")
        else:
            results.append(f"{fname}: WARN wake-lock marker still present after removal - check manually")

    write(p, src)

for r in results:
    # ASCII only
    print(r.replace('—', '-').replace('✓', 'OK').replace('✗', 'X'))
