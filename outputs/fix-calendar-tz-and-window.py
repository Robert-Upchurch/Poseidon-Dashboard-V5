"""
Calendar fixes (Robert 2026-04-29):
  1. Use device IANA timezone (Graph returns local times, not UTC)
  2. Display times as AM/PM (12-hour), not 24-hour
  3. Extend window to next 24 months (was +60 days)
  4. Paginate via @odata.nextLink so we get all events in that range

Strategy:
  - Replace o365LoadCalendar with a version that paginates and sends
    Prefer: outlook.timezone="<local IANA>" so Graph returns local time.
    Keep storing time as 24-hour HH:mm (internal hour-bucketing relies on it).
  - Inject a _fmtTime12 helper (24-hour HH:mm -> "9:30 AM" / "2:00 PM").
  - Wrap all calendar DISPLAY sites with _fmtTime12(e.time). Leave the
    hour-bucketing site at e.time.startsWith(hrStr) untouched.
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

OLD_CAL_FN = (
    "async function o365LoadCalendar() {\n"
    "    // Widened 2026-04-29: was now..+14d top=50 (many events missing).\n"
    "    // Now: -7d through +60d, top=250 \xe2\x80\x94 covers running meetings,\n"
    "    // recurring expansions, and longer-horizon planning blocks.\n"
    "    const now = new Date();\n"
    "    const start = new Date(now.getTime() - 7*86400000).toISOString();\n"
    "    const end   = new Date(now.getTime() + 60*86400000).toISOString();\n"
    "    const data = await o365Fetch(`https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${start}&endDateTime=${end}&$top=250&$orderby=start/dateTime&$select=subject,start,end,location,isAllDay`);\n"
    "    if (!data || !data.value) return;\n"
    "\n"
    "    // Merge into calEvents\n"
    "    const outlookEvents = data.value.map((e, i) => ({\n"
    "        id: 90000 + i,\n"
    "        title: e.subject || '(no title)',\n"
    "        date: e.start.dateTime.split('T')[0],\n"
    "        time: e.isAllDay ? '' : e.start.dateTime.split('T')[1].substring(0,5),\n"
    "        location: e.location?.displayName || '',\n"
    "        color: '#0078d4',\n"
    "        source: 'Outlook'\n"
    "    }));\n"
    "\n"
    "    // Remove old Outlook events, add fresh ones\n"
    "    calEvents = calEvents.filter(e => e.source !== 'Outlook');\n"
    "    calEvents.push(...outlookEvents);\n"
    "    saveEvents();\n"
    "    if (currentPage === 'calendar') renderCalendar();\n"
    "    if (currentPage === 'dashboard') renderDashboardHome();\n"
    "}\n"
).encode('latin-1').decode('utf-8') if False else None  # placeholder

# Build the OLD_CAL_FN cleanly without escaped unicode trickery
OLD_CAL_FN = (
    "async function o365LoadCalendar() {\n"
    "    // Widened 2026-04-29: was now..+14d top=50 (many events missing).\n"
    "    // Now: -7d through +60d, top=250 — covers running meetings,\n"
    "    // recurring expansions, and longer-horizon planning blocks.\n"
    "    const now = new Date();\n"
    "    const start = new Date(now.getTime() - 7*86400000).toISOString();\n"
    "    const end   = new Date(now.getTime() + 60*86400000).toISOString();\n"
    "    const data = await o365Fetch(`https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${start}&endDateTime=${end}&$top=250&$orderby=start/dateTime&$select=subject,start,end,location,isAllDay`);\n"
    "    if (!data || !data.value) return;\n"
    "\n"
    "    // Merge into calEvents\n"
    "    const outlookEvents = data.value.map((e, i) => ({\n"
    "        id: 90000 + i,\n"
    "        title: e.subject || '(no title)',\n"
    "        date: e.start.dateTime.split('T')[0],\n"
    "        time: e.isAllDay ? '' : e.start.dateTime.split('T')[1].substring(0,5),\n"
    "        location: e.location?.displayName || '',\n"
    "        color: '#0078d4',\n"
    "        source: 'Outlook'\n"
    "    }));\n"
    "\n"
    "    // Remove old Outlook events, add fresh ones\n"
    "    calEvents = calEvents.filter(e => e.source !== 'Outlook');\n"
    "    calEvents.push(...outlookEvents);\n"
    "    saveEvents();\n"
    "    if (currentPage === 'calendar') renderCalendar();\n"
    "    if (currentPage === 'dashboard') renderDashboardHome();\n"
    "}\n"
)

NEW_CAL_FN = (
    "// 12-hour AM/PM formatter (\"14:30\" -> \"2:30 PM\"). Stored time stays\n"
    "// 24-hour HH:mm so the renderer's hour-bucketing keeps working;\n"
    "// only the display sites call _fmtTime12.\n"
    "function _fmtTime12(hhmm) {\n"
    "    if (!hhmm || typeof hhmm !== 'string') return hhmm || '';\n"
    "    const m = hhmm.match(/^(\\d{1,2}):(\\d{2})/);\n"
    "    if (!m) return hhmm;\n"
    "    let h = parseInt(m[1], 10);\n"
    "    const min = m[2];\n"
    "    const ampm = h >= 12 ? 'PM' : 'AM';\n"
    "    h = h % 12; if (h === 0) h = 12;\n"
    "    return h + ':' + min + ' ' + ampm;\n"
    "}\n"
    "\n"
    "async function o365LoadCalendar() {\n"
    "    // Robert 2026-04-29: extend to next 24 months, force device-local\n"
    "    // time (Prefer outlook.timezone), paginate via @odata.nextLink.\n"
    "    const now = new Date();\n"
    "    const start = new Date(now.getTime() -   7*86400000).toISOString();\n"
    "    const end   = new Date(now.getTime() + 730*86400000).toISOString(); // ~24 months\n"
    "    const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (_) { return 'UTC'; } })();\n"
    "    const token = await o365GetToken();\n"
    "    if (!token) return;\n"
    "    const headers = {\n"
    "        'Authorization': 'Bearer ' + token,\n"
    "        'Prefer':        'outlook.timezone=\"' + tz + '\"'\n"
    "    };\n"
    "    let url = 'https://graph.microsoft.com/v1.0/me/calendarView'\n"
    "            + '?startDateTime=' + start\n"
    "            + '&endDateTime=' + end\n"
    "            + '&$top=500&$orderby=start/dateTime'\n"
    "            + '&$select=subject,start,end,location,isAllDay';\n"
    "    const all = [];\n"
    "    for (let page = 0; page < 12 && url; page++) { // up to 6000 events\n"
    "        const resp = await fetch(url, { headers });\n"
    "        if (!resp.ok) { console.warn('[o365] calendar page ' + page + ' failed:', resp.status); break; }\n"
    "        const data = await resp.json();\n"
    "        if (!data) break;\n"
    "        if (Array.isArray(data.value)) all.push(...data.value);\n"
    "        url = data['@odata.nextLink'] || null;\n"
    "    }\n"
    "    if (!all.length) {\n"
    "        // No events in window; still wipe stale Outlook entries so the UI is consistent.\n"
    "        calEvents = calEvents.filter(e => e.source !== 'Outlook');\n"
    "        saveEvents();\n"
    "        if (currentPage === 'calendar') renderCalendar();\n"
    "        if (currentPage === 'dashboard') renderDashboardHome();\n"
    "        return;\n"
    "    }\n"
    "\n"
    "    const outlookEvents = all.map((e, i) => ({\n"
    "        id: 90000 + i,\n"
    "        title: e.subject || '(no title)',\n"
    "        date: e.start.dateTime.split('T')[0],\n"
    "        time: e.isAllDay ? '' : e.start.dateTime.split('T')[1].substring(0,5),\n"
    "        location: e.location?.displayName || '',\n"
    "        color: '#0078d4',\n"
    "        source: 'Outlook'\n"
    "    }));\n"
    "\n"
    "    calEvents = calEvents.filter(e => e.source !== 'Outlook');\n"
    "    calEvents.push(...outlookEvents);\n"
    "    saveEvents();\n"
    "    if (currentPage === 'calendar') renderCalendar();\n"
    "    if (currentPage === 'dashboard') renderDashboardHome();\n"
    "}\n"
)

# Display-site replacements. Each pattern targets a calendar render site.
# We DO NOT touch the hour-bucketing site (`e.time.startsWith(hrStr)`).
DISPLAY_REPLACEMENTS = [
    # ${e.time||'All day'}  ->  ${e.time?_fmtTime12(e.time):'All day'}
    ("${e.time||'All day'}",            "${e.time?_fmtTime12(e.time):'All day'}"),
    # ${e.time?e.time+' ':''}  ->  ${e.time?_fmtTime12(e.time)+' ':''}
    ("${e.time?e.time+' ':''}",         "${e.time?_fmtTime12(e.time)+' ':''}"),
    # ${e.date} ${e.time||''}  ->  ${e.date} ${e.time?_fmtTime12(e.time):''}
    ("${e.date} ${e.time||''}",         "${e.date} ${e.time?_fmtTime12(e.time):''}"),
    # '\xf0\x9f\x95\x90 '+e.time+'</div>'  ->  '...'+_fmtTime12(e.time)+'</div>'
    ("'\U0001F550 '+e.time+'</div>'",   "'\U0001F550 '+_fmtTime12(e.time)+'</div>'"),
]

results = []
for fname in ['poseidon-dashboard-v6.html', 'j1-system-dashboard.html']:
    p = os.path.join(REPO, fname)
    src = read(p)
    if '_fmtTime12' in src:
        results.append(f"{fname}: _fmtTime12 already present (skipping function rewrite)")
    else:
        if OLD_CAL_FN not in src:
            results.append(f"{fname}: WARN old o365LoadCalendar not found verbatim - aborting this file")
            continue
        src = src.replace(OLD_CAL_FN, NEW_CAL_FN, 1)
        results.append(f"{fname}: o365LoadCalendar replaced (24mo window, Prefer header, pagination, AM/PM helper)")

    # Apply display replacements (replace ALL occurrences for each pattern)
    rep_count = 0
    for old, new in DISPLAY_REPLACEMENTS:
        n = src.count(old)
        if n:
            src = src.replace(old, new)
            rep_count += n
    results.append(f"{fname}: {rep_count} display sites updated to AM/PM")
    write(p, src)

for r in results:
    print(r)
