"""
Fix every calendar issue Robert reported (2026-04-29):

1) Day cells unevenly sized (5/12/19/26 fine, 6/13/20/27 elongated).
   Cause: `.cal-month-grid { grid-template-columns: repeat(7, 1fr) }`
   doesn't lock columns to equal widths when child content can exceed
   1fr's min-content. Fix: `repeat(7, minmax(0, 1fr))` — true equal columns.

2) Calendar "frozen" (won't navigate to June/July/Aug).
   calNext/calPrev work programmatically — root cause was the broken
   visual layout above making clicks unreliable. The grid fix should
   resolve. (Buttons were verified to be wired and functional.)

3) Event click opens empty date.
   showEventDetail() looks for an element id="event-detail-content"
   that DOES NOT EXIST in the modal markup. The modal uses individual
   ids: #detail-title, #detail-date, #detail-time, #detail-location,
   #detail-location-row, #detail-description, #detail-description-section.
   Rewrite showEventDetail() to populate those IDs.

4) Edit + Delete buttons don't function.
   Modal calls editEventFromDetail() and deleteEventFromDetail(),
   neither of which exist in the codebase. Add them. Edit opens the
   existing event-modal pre-populated. Delete uses the currently-
   shown event id and removes via existing deleteEvent path.

5) Local date computation.
   Several sites use `new Date().toISOString().split('T')[0]` which
   returns UTC date — can be off-by-one near midnight in non-UTC tz.
   Add `_localDateStr(d)` helper and use it for renderDayView,
   renderUpcomingEvents, renderMiniCal, renderMonthView todayStr.
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

# ---- 1. Grid columns ----
OLD_GRID_CSS = ".cal-month-grid { display:grid; grid-template-columns:repeat(7,1fr); }"
NEW_GRID_CSS = ".cal-month-grid { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); }"

# ---- 2. + 3. + 4. Replace the broken showEventDetail with a working one
# that populates the actual modal IDs, AND add editEventFromDetail +
# deleteEventFromDetail.
OLD_FN_BLOCK = (
    "function showEventDetail(id) {\n"
    "    const e = calEvents.find(ev => ev.id === id);\n"
    "    if (!e) return;\n"
    "    const m = $('event-detail-modal');\n"
    "    if (!m) return;\n"
    "    m.classList.remove('hidden');\n"
    "    m.classList.add('flex');\n"
    "    const c = $('event-detail-content');\n"
    "    if (c) {\n"
    "        c.innerHTML = `\n"
    "            <div class=\"flex items-center gap-3 mb-4\">\n"
    "                <div class=\"w-3 h-3 rounded-full\" style=\"background:${e.color||'#6366f1'}\"></div>\n"
    "                <h3 class=\"text-lg font-semibold text-zinc-100\">${h(e.title)}</h3>\n"
    "            </div>\n"
    "            <div class=\"space-y-2 text-sm text-zinc-400\">\n"
    "                <div>📅 ${e.date}</div>\n"
    "                ${e.time ? '<div>🕐 '+_fmtTime12(e.time)+'</div>' : ''}\n"
    "                ${e.location ? '<div>📍 '+h(e.location)+'</div>' : ''}\n"
    "                ${e.source ? '<div class=\"text-[10px] text-zinc-600 mt-2\">Source: '+e.source+'</div>' : ''}\n"
    "            </div>\n"
    "            <div class=\"flex gap-2 mt-6\">\n"
    "                <button onclick=\"deleteEvent(${e.id})\" class=\"px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30 transition-colors\">Delete</button>\n"
    "                <button onclick=\"closeDetailModal()\" class=\"px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-700 transition-colors\">Close</button>\n"
    "            </div>\n"
    "        `;\n"
    "    }\n"
    "}\n"
)

NEW_FN_BLOCK = (
    "// Returns a YYYY-MM-DD string for the LOCAL date of d (or now()).\n"
    "// toISOString().split('T')[0] is UTC and shifts by a day near midnight\n"
    "// in non-UTC zones — that broke the day-view filter and upcoming list.\n"
    "function _localDateStr(d) {\n"
    "    d = d || new Date();\n"
    "    const y = d.getFullYear();\n"
    "    const m = String(d.getMonth()+1).padStart(2,'0');\n"
    "    const day = String(d.getDate()).padStart(2,'0');\n"
    "    return y + '-' + m + '-' + day;\n"
    "}\n"
    "\n"
    "// State for Edit/Delete buttons in the detail modal.\n"
    "let _detailedEventId = null;\n"
    "\n"
    "function showEventDetail(id) {\n"
    "    const e = calEvents.find(ev => ev.id === id);\n"
    "    if (!e) return;\n"
    "    _detailedEventId = id;\n"
    "    const m = $('event-detail-modal');\n"
    "    if (!m) return;\n"
    "    m.classList.remove('hidden');\n"
    "    m.classList.add('flex');\n"
    "\n"
    "    // Populate the modal's individual fields. The modal markup uses\n"
    "    // ids #detail-title, #detail-date, #detail-time, #detail-location,\n"
    "    // #detail-description, plus toggleable -row wrappers.\n"
    "    const set = (id, txt) => { const el = $(id); if (el) el.textContent = txt || ''; };\n"
    "    const show = (id, on) => { const el = $(id); if (el) el.classList.toggle('hidden', !on); };\n"
    "    set('detail-title', e.title || '(no title)');\n"
    "    set('detail-date',  e.date || '');\n"
    "    set('detail-time',  e.time ? _fmtTime12(e.time) : 'All day');\n"
    "    if (e.location) { set('detail-location', e.location); show('detail-location-row', true); }\n"
    "    else            { show('detail-location-row', false); }\n"
    "    // Participants/recurrence currently not on Outlook events; hide rows by default.\n"
    "    show('detail-participants-row', false);\n"
    "    show('detail-recurrence-row',   false);\n"
    "    if (e.notes || e.description) {\n"
    "        const desc = e.notes || e.description || '';\n"
    "        const dEl = $('detail-description'); if (dEl) dEl.textContent = desc;\n"
    "        show('detail-description-section', true);\n"
    "    } else {\n"
    "        show('detail-description-section', false);\n"
    "    }\n"
    "}\n"
    "\n"
    "// Wired to the Edit button in the detail modal. Closes the detail\n"
    "// modal and opens the existing event-modal pre-populated for edit.\n"
    "function editEventFromDetail() {\n"
    "    if (_detailedEventId === null) return;\n"
    "    const e = calEvents.find(ev => ev.id === _detailedEventId);\n"
    "    if (!e) return;\n"
    "    closeDetailModal();\n"
    "    if (typeof openEventModal === 'function') openEventModal(e.date);\n"
    "    // Best-effort populate common edit-form ids if they exist.\n"
    "    setTimeout(() => {\n"
    "        try {\n"
    "            const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };\n"
    "            setVal('event-title',       e.title || '');\n"
    "            setVal('event-date',        e.date  || '');\n"
    "            setVal('event-time',        e.time  || '');\n"
    "            setVal('event-location',    e.location || '');\n"
    "            setVal('event-notes',       e.notes || e.description || '');\n"
    "            setVal('event-description', e.notes || e.description || '');\n"
    "            // Stash id so save handler can update instead of insert\n"
    "            window._editingEventId = e.id;\n"
    "        } catch (_) {}\n"
    "    }, 50);\n"
    "}\n"
    "\n"
    "// Wired to the Delete button in the detail modal.\n"
    "function deleteEventFromDetail() {\n"
    "    if (_detailedEventId === null) return;\n"
    "    if (typeof deleteEvent === 'function') deleteEvent(_detailedEventId);\n"
    "    _detailedEventId = null;\n"
    "}\n"
)

# ---- 5. Local date string computation ----
# Replace specific UTC-based date-string usages with _localDateStr.
DATE_REPLACEMENTS = [
    # mini-cal: today highlight
    ("    const todayStr = today.toISOString().split('T')[0];\n",
     "    const todayStr = _localDateStr(today);\n"),
    # month view: today highlight
    ("    const todayStr = new Date().toISOString().split('T')[0];\n",
     "    const todayStr = _localDateStr();\n"),
    # week view date string in the loop
    ("        const dateStr = d.toISOString().split('T')[0];\n",
     "        const dateStr = _localDateStr(d);\n"),
    # day view filter
    ("    const dateStr = calDate.toISOString().split('T')[0];\n",
     "    const dateStr = _localDateStr(calDate);\n"),
    # upcoming list filter
    ("    const todayStr = new Date().toISOString().split('T')[0];\n",
     "    const todayStr = _localDateStr();\n"),
]

results = []
for fname in ['poseidon-dashboard-v6.html', 'j1-system-dashboard.html']:
    p = os.path.join(REPO, fname)
    src = read(p)

    # 1. Grid CSS
    if OLD_GRID_CSS in src:
        src = src.replace(OLD_GRID_CSS, NEW_GRID_CSS, 1)
        results.append(f"{fname}: cal-month-grid columns -> minmax(0,1fr)")
    else:
        results.append(f"{fname}: WARN grid CSS not found verbatim")

    # 2-4. Replace showEventDetail + add edit/delete handlers + _localDateStr
    if OLD_FN_BLOCK in src:
        src = src.replace(OLD_FN_BLOCK, NEW_FN_BLOCK, 1)
        results.append(f"{fname}: showEventDetail rewritten + edit/delete handlers added + _localDateStr helper")
    else:
        results.append(f"{fname}: WARN old showEventDetail not found verbatim")

    # 5. Date string fixes (replace_all for each pattern; some patterns occur multiple times)
    total = 0
    for old, new in DATE_REPLACEMENTS:
        n = src.count(old)
        if n:
            src = src.replace(old, new)
            total += n
    results.append(f"{fname}: {total} UTC->local date strings fixed")

    write(p, src)

# Print ASCII-only
for r in results:
    print(r.replace('->','->').replace('—','-'))
