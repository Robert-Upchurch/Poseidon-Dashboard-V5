"""
Inject a Screen Wake Lock module into v6 + j1-system.
Robert's spec (2026-04-29):
  - Keep the phone awake while the dashboard is open
  - Release the lock (allow sleep) after 10 minutes with no voice activity
  - Re-acquire when voice activity resumes
  - Re-acquire when the tab becomes visible (Wake Lock auto-releases on hide)

Voice activity = window.PoseidonJarvis.state.speaking || .listening
"""
import io, os, sys

REPO = r"C:\Users\ceo\OneDrive - CTI Group Worldwide Services Inc\POSEIDON\Claude-Workspace\Code-Projects\Poseidon-Dashboard-V5"

def read(p):
    with io.open(p, 'r', encoding='utf-8', newline='') as f:
        return f.read()

def write(p, s):
    if not s.rstrip().lower().endswith('</html>'):
        raise SystemExit(f"refusing to write {p}: does not end with </html>")
    with io.open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(s)

WAKE_LOCK = r"""
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

results = []
for fname in ['poseidon-dashboard-v6.html', 'j1-system-dashboard.html']:
    p = os.path.join(REPO, fname)
    src = read(p)
    if '__poseidonWakeLockWired' in src:
        results.append(f"{fname}: already wired (skipped)")
        continue
    # Inject right before the closing </body> so all the dashboard scripts
    # have already loaded (we reference window.PoseidonJarvis).
    if '</body>' not in src:
        results.append(f"{fname}: WARN no </body> tag found - aborting")
        continue
    new_src = src.replace('</body>', WAKE_LOCK + '\n</body>', 1)
    write(p, new_src)
    results.append(f"{fname}: wake lock injected")

for r in results:
    print(r)
