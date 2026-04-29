"""
Two related M365 fixes for v6 + j1-system:

1. Calendar window was "now to +14 days, top 50" — many events missing
   (recurring meetings already started, items beyond two weeks).
   Widen to -7 days through +60 days, top 250.

2. Auto-refresh schedule per Robert (2026-04-29):
   - Weekdays Mon-Fri: every 10 min, 7:00am to 4:00pm inclusive
   - Weekends Sat-Sun: only at 8:00am, 12:00pm, 4:00pm
   Replace the dumb 5-min interval with a per-30-second ticker that
   checks the schedule and dedups by minute-key.
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

# ---- 1. Calendar window widening ----
OLD_CAL_BLOCK = (
    "    const now = new Date();\n"
    "    const start = now.toISOString();\n"
    "    const end = new Date(now.getTime() + 14*86400000).toISOString();\n"
    "    const data = await o365Fetch(`https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${start}&endDateTime=${end}&$top=50&$select=subject,start,end,location,isAllDay`);\n"
)
NEW_CAL_BLOCK = (
    "    // Widened 2026-04-29: was now..+14d top=50 (many events missing).\n"
    "    // Now: -7d through +60d, top=250 — covers running meetings,\n"
    "    // recurring expansions, and longer-horizon planning blocks.\n"
    "    const now = new Date();\n"
    "    const start = new Date(now.getTime() - 7*86400000).toISOString();\n"
    "    const end   = new Date(now.getTime() + 60*86400000).toISOString();\n"
    "    const data = await o365Fetch(`https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${start}&endDateTime=${end}&$top=250&$orderby=start/dateTime&$select=subject,start,end,location,isAllDay`);\n"
)

# ---- 2. Auto-refresh schedule ----
OLD_SCHED_BLOCK = (
    "// ───── Background auto-refresh ─────\n"
    "// Refreshes M365 data every 5 minutes when connected. Silent (no spinner).\n"
    "// Tab visibility check skips the call when the tab is hidden.\n"
    "const O365_AUTO_REFRESH_MS = 5 * 60 * 1000;\n"
    "let _o365AutoRefreshTimer = null;\n"
    "function _o365StartAutoRefresh() {\n"
    "    if (_o365AutoRefreshTimer) return;\n"
    "    _o365AutoRefreshTimer = setInterval(() => {\n"
    "        if (document.hidden) return;\n"
    "        if (!msalInstance || !o365Account) return;\n"
    "        o365LoadAll().catch(e => console.warn('auto-refresh failed:', e?.message || e));\n"
    "    }, O365_AUTO_REFRESH_MS);\n"
    "}\n"
    "function _o365StopAutoRefresh() {\n"
    "    if (_o365AutoRefreshTimer) { clearInterval(_o365AutoRefreshTimer); _o365AutoRefreshTimer = null; }\n"
    "}\n"
)

NEW_SCHED_BLOCK = (
    "// ───── Background auto-refresh — Robert's cadence (2026-04-29) ─────\n"
    "// Mon-Fri: every 10 min from 7:00am through 4:00pm inclusive.\n"
    "// Sat/Sun: only at 8:00am, 12:00pm, 4:00pm.\n"
    "// Implementation: tick every 30s, fire when current minute matches\n"
    "// a slot. lastFireKey dedup prevents double-fire within a minute.\n"
    "let _o365AutoRefreshTimer = null;\n"
    "let _o365LastFireKey = '';\n"
    "function _o365ShouldFireNow() {\n"
    "    const d = new Date();\n"
    "    const dow = d.getDay();          // 0=Sun..6=Sat\n"
    "    const h = d.getHours();\n"
    "    const m = d.getMinutes();\n"
    "    const isWeekday = dow >= 1 && dow <= 5;\n"
    "    if (isWeekday) {\n"
    "        if (h < 7 || h > 16) return false;\n"
    "        if (h === 16 && m > 0) return false;   // 4pm fires only at :00\n"
    "        return m % 10 === 0;                    // every 10 min on the dot\n"
    "    }\n"
    "    // Weekend: only on-the-hour at 8, 12, 16\n"
    "    return m === 0 && (h === 8 || h === 12 || h === 16);\n"
    "}\n"
    "function _o365StartAutoRefresh() {\n"
    "    if (_o365AutoRefreshTimer) return;\n"
    "    _o365AutoRefreshTimer = setInterval(() => {\n"
    "        try {\n"
    "            if (document.hidden) return;\n"
    "            if (!msalInstance || !o365Account) return;\n"
    "            if (!_o365ShouldFireNow()) return;\n"
    "            const d = new Date();\n"
    "            const key = d.toDateString() + ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2,'0');\n"
    "            if (key === _o365LastFireKey) return;\n"
    "            _o365LastFireKey = key;\n"
    "            o365LoadAll().catch(e => console.warn('[o365] scheduled refresh failed:', e && e.message ? e.message : e));\n"
    "        } catch (e) { console.warn('[o365] scheduler error:', e && e.message ? e.message : e); }\n"
    "    }, 30 * 1000);\n"
    "}\n"
    "function _o365StopAutoRefresh() {\n"
    "    if (_o365AutoRefreshTimer) { clearInterval(_o365AutoRefreshTimer); _o365AutoRefreshTimer = null; }\n"
    "}\n"
)

results = []
for fname in ['poseidon-dashboard-v6.html', 'j1-system-dashboard.html']:
    p = os.path.join(REPO, fname)
    src = read(p)
    n = src.count(OLD_CAL_BLOCK)
    if n == 1:
        src = src.replace(OLD_CAL_BLOCK, NEW_CAL_BLOCK, 1)
        results.append(f"{fname}: calendar window widened")
    elif n == 0:
        results.append(f"{fname}: WARN calendar block not found verbatim")
    else:
        results.append(f"{fname}: WARN {n} calendar blocks - aborting")
        continue
    n2 = src.count(OLD_SCHED_BLOCK)
    if n2 == 1:
        src = src.replace(OLD_SCHED_BLOCK, NEW_SCHED_BLOCK, 1)
        results.append(f"{fname}: schedule installed (Mon-Fri 7am-4pm/10min, weekend 8/12/16)")
    elif n2 == 0:
        results.append(f"{fname}: WARN schedule block not found verbatim")
    else:
        results.append(f"{fname}: WARN {n2} schedule blocks - aborting")
        continue
    write(p, src)

# v5 + legacy: just widen the calendar window if present, leave schedule alone
for fname in ['poseidon-dashboard-v5.html', 'poseidon-dashboard.html']:
    p = os.path.join(REPO, fname)
    src = read(p)
    if OLD_CAL_BLOCK in src:
        src = src.replace(OLD_CAL_BLOCK, NEW_CAL_BLOCK, 1)
        write(p, src)
        results.append(f"{fname}: calendar window widened (no schedule change)")

for r in results:
    # Pure ASCII to avoid Windows console codec issues
    print(r)
