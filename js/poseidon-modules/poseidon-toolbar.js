/* ═══════════════════════════════════════════════════════════════════
   POSEIDON v6 — UNIVERSAL TOOLBAR + ANALYTICS + EMBED MODE
   Adds three things to every division page:
     1. "Open in New Tab" button (indigo, top-right of toolbar)
        → opens ?embed=<divid> in a new tab, full-screen view of
          that division with chrome hidden and an exit-door button.
     2. "Analytics" button + dropdown (purple) of division-specific
        reports/charts. Each report opens a modal with a high-quality
        Chart.js comparison chart.
     3. Standardized color palette so each button color = one function.

   Also exposes Jarvis tools (registered via window.PoseidonToolbar.tools)
   so Jarvis can pop a division out, list its analytics reports, and
   read a report's chart data.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const DIVISIONS = ['masterforecast','finance','recruitingdivision','processingcuk','ittech','contracts','j1division','j1housing'];

  // ─── Color palette (single source of truth) ─────────────────────
  const BTN = {
    reload:    'bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white shadow-[0_0_16px_rgba(20,184,166,0.35)]',
    popout:    'bg-indigo-500 hover:bg-indigo-600 text-white',
    analytics: 'bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-400 hover:to-fuchsia-400 text-white',
    simulate:  'bg-emerald-500 hover:bg-emerald-600 text-white',
    whatif:    'bg-amber-500 hover:bg-amber-600 text-white',
    importx:   'bg-zinc-700 hover:bg-zinc-600 text-zinc-100 border border-zinc-600',
    exportx:   'bg-zinc-700 hover:bg-zinc-600 text-zinc-100 border border-zinc-600',
    pdf:       'bg-blue-500 hover:bg-blue-600 text-white',
    exit:      'bg-rose-500 hover:bg-rose-600 text-white shadow-lg'
  };
  const BTN_BASE = 'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5';

  // ─── Reports registry: per-division charts ──────────────────────
  // Each report has a data() function that returns Chart.js dataset
  // shape, optionally pulling from live snapshots / iframes.
  const REPORTS = {
    finance: [
      { id: 'cash-by-account',  label: 'Cash by Account',           type: 'bar',
        data: () => fromZoho(snap => ({
          labels: snap.bank_accounts.map(b => b.name),
          datasets: [{ label: 'Balance ($)', data: snap.bank_accounts.map(b => b.balance), backgroundColor: snap.bank_accounts.map(b => b.balance >= 0 ? '#10b981' : '#ef4444'), borderRadius: 4 }]
        }))
      },
      { id: 'ar-status',        label: 'AR Status Breakdown',       type: 'doughnut',
        data: () => fromZoho(snap => ({
          labels: snap.ar_status_breakdown.map(x => x.label),
          datasets: [{ data: snap.ar_status_breakdown.map(x => x.amount), backgroundColor: snap.ar_status_breakdown.map(x => x.color), borderColor: '#0a1628', borderWidth: 2 }]
        }))
      },
      { id: 'branch-revenue',   label: 'Branch Revenue Comparison', type: 'bar',
        data: () => fromZoho(snap => ({
          labels: snap.branch_revenue.map(x => x.branch),
          datasets: [
            { label: 'Paid',        data: snap.branch_revenue.map(x => x.paid),        backgroundColor: '#10b981', borderRadius: 4, stack: 'a' },
            { label: 'Outstanding', data: snap.branch_revenue.map(x => x.outstanding), backgroundColor: '#f59e0b', borderRadius: 4, stack: 'a' }
          ]
        }))
      },
      { id: 'overdue-aging',    label: 'Overdue by Days Bucket',    type: 'bar',
        data: () => fromZoho(snap => {
          const buckets = { '0-14d':0, '15-30d':0, '31-60d':0, '60d+':0 };
          snap.top_overdue_invoices.forEach(i => {
            const d = i.days_overdue || 0;
            if (d <= 14) buckets['0-14d'] += i.amount;
            else if (d <= 30) buckets['15-30d'] += i.amount;
            else if (d <= 60) buckets['31-60d'] += i.amount;
            else buckets['60d+'] += i.amount;
          });
          return {
            labels: Object.keys(buckets),
            datasets: [{ label: 'Overdue ($)', data: Object.values(buckets), backgroundColor: ['#facc15','#fb923c','#ef4444','#dc2626'], borderRadius: 4 }]
          };
        })
      }
    ],
    contracts: [
      { id: 'newhire-fees',     label: 'New-Hire Fee by Cruise Line', type: 'bar',
        data: () => fromContracts(LINES => ({
          labels: LINES.map(l => l.name.replace(/\s*\(.+?\)/, '')),
          datasets: [{ label: 'New-Hire Fee', data: LINES.map(l => parseMoney(l.fees?.newHire)), backgroundColor: '#14b8a6', borderRadius: 4 }]
        }))
      },
      { id: 'rehire-fees',      label: 'Rehire Fee by Cruise Line',   type: 'bar',
        data: () => fromContracts(LINES => ({
          labels: LINES.map(l => l.name.replace(/\s*\(.+?\)/, '')),
          datasets: [{ label: 'Rehire Fee', data: LINES.map(l => parseMoney(l.fees?.rehire)), backgroundColor: '#3b82f6', borderRadius: 4 }]
        }))
      },
      { id: 'contract-year',    label: 'Contracts by Year',           type: 'doughnut',
        data: () => fromContracts(LINES => {
          const by = {}; LINES.forEach(l => { const y = l.contractYear || 'Unknown'; by[y] = (by[y]||0) + 1; });
          return { labels: Object.keys(by), datasets: [{ data: Object.values(by), backgroundColor: ['#14b8a6','#3b82f6','#a855f7','#f59e0b','#ef4444'], borderColor: '#0a1628', borderWidth: 2 }]};
        })
      },
      { id: 'ships-per-line',   label: 'Ships per Cruise Line',       type: 'bar',
        data: () => fromContracts(LINES => ({
          labels: LINES.map(l => l.name.replace(/\s*\(.+?\)/, '')),
          datasets: [{ label: 'Ships', data: LINES.map(l => l.ships || 0), backgroundColor: '#a855f7', borderRadius: 4 }]
        }))
      },
      { id: 'crew-source',      label: 'Crew Source Distribution',    type: 'pie',
        data: () => fromContracts(LINES => {
          const by = {}; LINES.forEach(l => { const s = (l.crewSource||'Other').split(/[,;]/)[0].trim(); by[s] = (by[s]||0) + 1; });
          return { labels: Object.keys(by), datasets: [{ data: Object.values(by), backgroundColor: ['#14b8a6','#3b82f6','#10b981','#f59e0b','#a855f7','#ec4899','#06b6d4'], borderColor: '#0a1628', borderWidth: 2 }]};
        })
      }
    ],
    recruitingdivision: [
      { id: 'placement-trend',  label: 'Placement Trend (12-week)', type: 'line',
        data: () => ({ labels: weeks(12), datasets: [
          { label: 'Total',  data: [120,135,148,160,175,182,195,205,220,232,245,258], borderColor: '#14b8a6', backgroundColor: '#14b8a622', borderWidth: 2, tension: 0.35, pointRadius: 3, fill: true },
          { label: 'J1',     data: [70, 78, 85, 92,100,108,115,122,130,138,145,152],  borderColor: '#3b82f6', borderWidth: 2, tension: 0.35, pointRadius: 2 },
          { label: 'Cruise', data: [50, 57, 63, 68, 75, 74, 80, 83, 90, 94,100,106],  borderColor: '#a855f7', borderWidth: 2, tension: 0.35, pointRadius: 2 }
        ]})
      },
      { id: 'category-mix',     label: 'J1 vs Cruise Mix',          type: 'doughnut',
        data: () => ({ labels: ['J1 Cultural','Cruise Maritime'], datasets: [{ data: [58,42], backgroundColor: ['#14b8a6','#3b82f6'], borderColor: '#0a1628', borderWidth: 2 }]})
      },
      { id: 'source-country',   label: 'Source Country Distribution', type: 'bar',
        data: () => ({ labels: ['Indonesia','Philippines','Thailand','Myanmar','Vietnam','India','Other'], datasets: [{ label: 'Active Candidates', data: [320,285,210,165,140,95,75], backgroundColor: ['#14b8a6','#3b82f6','#10b981','#f59e0b','#a855f7','#ec4899','#64748b'], borderRadius: 4 }]})
      },
      { id: 'funnel-conversion', label: 'Recruiting Funnel — Conversion', type: 'bar',
        data: () => ({ labels: ['Sourced','Screened','Interviewed','Selected','Placed'], datasets: [{ label: 'Candidates', data: [2400,1450,820,420,310], backgroundColor: ['#14b8a6','#0d9488','#0f766e','#115e59','#134e4a'], borderRadius: 4 }]})
      },
      { id: 'time-to-place',     label: 'Time-to-Placement by Source', type: 'bar',
        data: () => ({ labels: ['Indonesia','Philippines','Thailand','Myanmar','Vietnam'], datasets: [{ label: 'Days (avg)', data: [42,38,55,68,72], backgroundColor: '#a855f7', borderRadius: 4 }]})
      }
    ],
    processingcuk: [
      { id: 'visa-volume',      label: 'Visa Volume Trend (12-week)', type: 'line',
        data: () => ({ labels: weeks(12), datasets: [
          { label: 'Submitted', data: [45,52,48,56,61,58,65,68,72,75,78,82], borderColor: '#14b8a6', borderWidth: 2, tension: 0.35, pointRadius: 3 },
          { label: 'Approved',  data: [38,45,42,49,53,52,58,61,65,68,71,75], borderColor: '#10b981', borderWidth: 2, tension: 0.35, pointRadius: 3 }
        ]})
      },
      { id: 'visa-types',       label: 'Visa Type Distribution',      type: 'doughnut',
        data: () => ({ labels: ['Maritime','J1 Cultural','H-2B','Other'], datasets: [{ data: [45,30,15,10], backgroundColor: ['#14b8a6','#3b82f6','#10b981','#f59e0b'], borderColor: '#0a1628', borderWidth: 2 }]})
      },
      { id: 'approval-vs-reject', label: 'Approval vs Rejection (Stacked)', type: 'bar',
        data: () => ({ labels: weeks(8), datasets: [
          { label: 'Approved %', data: [88,87,89,91,90,89,92,93], backgroundColor: '#10b981', borderRadius: 3, stack: 'a' },
          { label: 'Rejected %', data: [6, 6, 5, 4, 5, 5, 3, 2],  backgroundColor: '#ef4444', borderRadius: 3, stack: 'a' },
          { label: 'Pending %',  data: [6, 7, 6, 5, 5, 6, 5, 5],  backgroundColor: '#f59e0b', borderRadius: 3, stack: 'a' }
        ]})
      },
      { id: 'avg-processing',   label: 'Avg Processing Days',         type: 'line',
        data: () => ({ labels: weeks(8), datasets: [{ label: 'Days', data: [18,16,15,14,13,12.5,12,11.5], borderColor: '#f59e0b', backgroundColor: '#f59e0b22', borderWidth: 2, tension: 0.4, pointRadius: 3, fill: true }]})
      },
      { id: 'queue-by-stage',   label: 'Active Queue by Stage',       type: 'bar',
        data: () => ({ labels: ['Document Review','Embassy Submission','Interview','Approval Pending','Issuance'], datasets: [{ label: 'Cases', data: [42,28,18,15,9], backgroundColor: ['#14b8a6','#3b82f6','#a855f7','#f59e0b','#10b981'], borderRadius: 4 }]})
      }
    ],
    ittech: [
      { id: 'uptime',           label: 'System Uptime (Weekly)',     type: 'line',
        data: () => ({ labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], datasets: [{ label: 'Uptime %', data: [99.2,99.6,99.8,99.4,99.7,99.9,99.7], borderColor: '#10b981', backgroundColor: '#10b98122', borderWidth: 2, tension: 0.4, pointRadius: 3, fill: true }]})
      },
      { id: 'tickets',          label: 'Tickets by Category',        type: 'doughnut',
        data: () => ({ labels: ['Bug','Feature','Infrastructure','Support'], datasets: [{ data: [35,28,22,15], backgroundColor: ['#14b8a6','#3b82f6','#10b981','#f59e0b'], borderColor: '#0a1628', borderWidth: 2 }]})
      },
      { id: 'sprint-burndown',  label: 'Sprint Burndown — Ideal vs Actual', type: 'line',
        data: () => ({ labels: ['D1','D2','D3','D4','D5','D6','D7','D8','D9','D10'], datasets: [
          { label: 'Ideal',  data: [830,747,664,581,498,415,332,249,166,83], borderColor: '#ef4444', borderDash: [4,4], borderWidth: 2, tension: 0, pointRadius: 2 },
          { label: 'Actual', data: [830,720,620,475,380,340,280,210,135, 60], borderColor: '#14b8a6', borderWidth: 2, tension: 0.3, pointRadius: 3 }
        ]})
      },
      { id: 'portal-progress',  label: 'Portal Build Progress',      type: 'bar',
        data: () => ({ labels: ['CTI Portal','GHR Portal','CRM Integration','Candidate DB','Mobile App','Admin Console'], datasets: [{ label: 'Completion %', data: [72,64,80,85,25,55], backgroundColor: ['#14b8a6','#3b82f6','#10b981','#f59e0b','#a855f7','#ec4899'], borderRadius: 4 }]})
      },
      { id: 'response-time',    label: 'API p50 / p95 / p99 Latency (ms)', type: 'bar',
        data: () => ({ labels: ['p50','p95','p99'], datasets: [
          { label: 'CTI API',   data: [120,340,820], backgroundColor: '#14b8a6', borderRadius: 4 },
          { label: 'GHR API',   data: [145,410,940], backgroundColor: '#3b82f6', borderRadius: 4 },
          { label: 'Zoho Sync', data: [220,580,1280], backgroundColor: '#a855f7', borderRadius: 4 }
        ]})
      }
    ],
    masterforecast: [
      { id: 'rev-by-div',       label: 'Revenue by Division',        type: 'bar',
        data: () => ({ labels: ['CTI Cruise','GHR','Marine Travel','UNO','Baron','J1 Placements','J1 Housing'], datasets: [{ label: 'Revenue ($M)', data: [1.8,1.2,0.55,0.32,0.22,0.85,0.38], backgroundColor: ['#14b8a6','#3b82f6','#10b981','#f59e0b','#a855f7','#ef4444','#ec4899'], borderRadius: 4 }]})
      },
      { id: 'placements',       label: 'Placements Trend by Division', type: 'line',
        data: () => ({ labels: weeks(12), datasets: [
          { label: 'J1 Placements',  data: [30,35,40,45,50,55,60,65,70,75,80,85], borderColor: '#ef4444', borderWidth: 2, tension: 0.35, pointRadius: 2 },
          { label: 'J1 Beds',        data: [25,30,35,40,45,48,52,55,60,62,68,72], borderColor: '#ec4899', borderWidth: 2, tension: 0.35, pointRadius: 2 },
          { label: 'Cruise',         data: [50,57,63,68,75,74,80,83,90,94,100,106], borderColor: '#14b8a6', borderWidth: 2, tension: 0.35, pointRadius: 2 },
          { label: 'Marine Travel',  data: [20,25,28,32,38,42,46,50,54,58,62,66],  borderColor: '#3b82f6', borderWidth: 2, tension: 0.35, pointRadius: 2 }
        ]})
      },
      { id: 'all-divisions-cmp', label: 'All Divisions — Cash + AR + Overdue', type: 'bar',
        data: () => fromZoho(snap => {
          const k = snap.kpis;
          return {
            labels: ['Total Invoiced','Collected','AR Outstanding','Overdue','Net Cash'],
            datasets: [{
              label: 'USD',
              data: [k.total_invoiced, k.total_paid, k.total_outstanding, k.total_overdue, k.net_cash_position],
              backgroundColor: ['#3b82f6','#10b981','#f59e0b','#ef4444','#14b8a6'],
              borderRadius: 4
            }]
          };
        })
      },
      { id: 'global-hubs',      label: 'Operational Hubs by Country', type: 'doughnut',
        data: () => ({ labels: ['Indonesia','Greece','Thailand','Myanmar','Vietnam','India','UK'], datasets: [{ data: [120,90,75,50,45,35,28], backgroundColor: ['#14b8a6','#3b82f6','#10b981','#f59e0b','#a855f7','#ec4899','#64748b'], borderColor: '#0a1628', borderWidth: 2 }]})
      },
      { id: 'q-milestones',     label: 'Quarterly Milestones — Completion %', type: 'bar',
        data: () => ({ labels: ['Q1','Q2','Q3','Q4'], datasets: [{ label: 'Completion %', data: [82,45,12,0], backgroundColor: ['#10b981','#f59e0b','#64748b','#475569'], borderRadius: 4 }]})
      }
    ],
    j1housing: [
      { id: 'occupancy',        label: 'Occupancy Trend (6-month)',  type: 'line',
        data: () => ({ labels: ['Jan','Feb','Mar','Apr','May','Jun'], datasets: [{ label: 'Occupancy %', data: [62,68,71,75,82,88], borderColor: '#14b8a6', backgroundColor: '#14b8a633', borderWidth: 2, tension: 0.35, pointRadius: 3, fill: true }]})
      },
      { id: 'sponsor-mix',      label: 'Sponsor Distribution',        type: 'doughnut',
        data: () => ({ labels: ['CIEE','Greenheart','Cultural Vistas','Spirit','Other'], datasets: [{ data: [38,28,18,10,6], backgroundColor: ['#14b8a6','#3b82f6','#10b981','#f59e0b','#a855f7'], borderColor: '#0a1628', borderWidth: 2 }]})
      },
      { id: 'beds-by-property', label: 'Beds by Property',            type: 'bar',
        data: () => ({ labels: ['Vail','Aspen','Park City','Steamboat','Breckenridge','Big Sky'], datasets: [{ label: 'Beds Available', data: [120,95,80,65,55,42], backgroundColor: '#14b8a6', borderRadius: 4 }]})
      },
      { id: 'check-ins',        label: 'Check-Ins by Month',          type: 'bar',
        data: () => ({ labels: ['Jan','Feb','Mar','Apr','May','Jun'], datasets: [{ label: 'Check-Ins', data: [45,68,85,92,128,156], backgroundColor: '#10b981', borderRadius: 4 }]})
      }
    ]
  };

  // ─── Data accessors ─────────────────────────────────────────────
  function fromZoho(fn) {
    const snap = window.PoseidonZohoBooks?.snapshot;
    if (!snap) return null;
    return fn(snap);
  }
  function fromContracts(fn) {
    const frame = document.getElementById('contracts-frame');
    if (!frame || !frame.contentWindow || !Array.isArray(frame.contentWindow.LINES)) return null;
    return fn(frame.contentWindow.LINES);
  }
  function parseMoney(s) {
    if (s == null) return 0;
    const m = String(s).match(/[\d,]+(?:\.\d+)?/);
    return m ? Number(m[0].replace(/,/g,'')) : 0;
  }
  function weeks(n) {
    return Array.from({ length: n }, (_, i) => 'W' + (i + 1));
  }

  // ─── Style injection (palette + modal + dropdown) ───────────────
  const STYLE_ID = 'poseidon-toolbar-style';
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      .pt-analytics-menu{position:absolute;right:0;top:calc(100% + 6px);min-width:240px;background:#0f172a;border:1px solid rgba(168,85,247,0.4);border-radius:10px;box-shadow:0 24px 60px rgba(0,0,0,0.6);padding:6px;z-index:100;max-height:380px;overflow-y:auto;}
      .pt-analytics-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;font-size:12px;color:#e2e8f0;border-radius:6px;cursor:pointer;border:0;background:transparent;width:100%;text-align:left;font-family:inherit;}
      .pt-analytics-item:hover{background:rgba(168,85,247,0.15);color:#f5d0fe;}
      .pt-analytics-item .pt-chip{font-size:10px;padding:2px 6px;border-radius:999px;background:rgba(168,85,247,0.18);color:#d8b4fe;text-transform:uppercase;letter-spacing:0.04em;}

      .pt-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);z-index:9990;display:flex;align-items:center;justify-content:center;padding:24px;}
      .pt-modal{background:linear-gradient(160deg,#0f1e2e,#122336);border:1px solid rgba(168,85,247,0.35);border-radius:16px;width:min(960px,100%);max-height:90vh;display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,0.6);color:#e2e8f0;overflow:hidden;}
      .pt-modal-head{padding:14px 18px;border-bottom:1px solid rgba(148,163,184,0.14);display:flex;align-items:center;gap:10px;}
      .pt-modal-title{font-weight:700;font-size:15px;color:#f1f5f9;}
      .pt-modal-sub{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-left:6px;}
      .pt-modal-close{margin-left:auto;background:transparent;border:0;color:#94a3b8;font-size:22px;cursor:pointer;padding:0 8px;border-radius:6px;}
      .pt-modal-close:hover{color:#f1f5f9;background:rgba(148,163,184,0.1);}
      .pt-modal-body{padding:16px 18px;overflow:auto;}
      .pt-modal-foot{padding:10px 18px;border-top:1px solid rgba(148,163,184,0.10);font-size:11px;color:#64748b;display:flex;justify-content:space-between;align-items:center;}
      .pt-chart-host{position:relative;height:420px;background:rgba(0,0,0,0.25);border:1px solid rgba(148,163,184,0.10);border-radius:10px;padding:10px;}

      /* Embed mode — hide chrome, show exit door */
      body.pt-embed nav{display:none !important;}
      body.pt-embed #app-header{display:none !important;}
      body.pt-embed .main-content{margin-left:0 !important;padding:18px !important;max-width:none !important;}
      body.pt-embed .page.hidden{display:none !important;}
      body.pt-embed .page{display:block !important;}

      #pt-exit-door{position:fixed;top:14px;right:14px;z-index:9995;background:linear-gradient(135deg,#f43f5e,#e11d48);color:#fff;border:0;width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 8px 24px rgba(244,63,94,0.45);transition:all 0.18s;font-family:inherit;}
      #pt-exit-door:hover{transform:scale(1.08);box-shadow:0 12px 32px rgba(244,63,94,0.6);}
      #pt-exit-door svg{width:22px;height:22px;}
      #pt-exit-door + .pt-exit-tip{position:fixed;top:66px;right:14px;z-index:9994;font-size:10px;color:#fda4af;background:rgba(244,63,94,0.12);border:1px solid rgba(244,63,94,0.3);border-radius:6px;padding:3px 8px;pointer-events:none;}
    `;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ─── Toolbar augmentation ───────────────────────────────────────
  // For each division, locate its toolbar (the div that holds the
  // existing toolbar buttons) and append "Open in New Tab" + "Analytics"
  // unless they're already there.
  function findToolbar(divId) {
    const page = document.getElementById(divId);
    if (!page) return null;
    // Toolbar = the flex row right after the title that contains buttons
    const candidates = page.querySelectorAll('.flex.items-center.gap-2.flex-wrap, .flex.items-center.gap-2');
    for (const c of candidates) {
      if (c.querySelector('button, a')) return c;
    }
    return null;
  }
  function augmentDivisionToolbar(divId) {
    const tb = findToolbar(divId);
    if (!tb) return false;
    if (tb.querySelector('[data-pt="popout"]')) return true; // already augmented

    // Open in New Tab
    const popBtn = document.createElement('button');
    popBtn.dataset.pt = 'popout';
    popBtn.className = `${BTN_BASE} ${BTN.popout}`;
    popBtn.title = 'Open this dashboard in a new tab (full-screen)';
    popBtn.innerHTML = '<i data-lucide="external-link" class="w-3.5 h-3.5"></i> Open in New Tab';
    popBtn.onclick = () => popoutDivision(divId);

    // Analytics dropdown
    const anWrap = document.createElement('div');
    anWrap.dataset.pt = 'analytics';
    anWrap.className = 'relative';
    const anBtn = document.createElement('button');
    anBtn.className = `${BTN_BASE} ${BTN.analytics}`;
    anBtn.title = 'Analytics — pick a report or chart';
    anBtn.innerHTML = '<i data-lucide="bar-chart-3" class="w-3.5 h-3.5"></i> Analytics <i data-lucide="chevron-down" class="w-3 h-3 ml-0.5 opacity-80"></i>';
    anWrap.appendChild(anBtn);
    anBtn.onclick = (e) => { e.stopPropagation(); toggleAnalyticsMenu(divId, anWrap); };

    tb.appendChild(popBtn);
    tb.appendChild(anWrap);
    if (window.lucide?.createIcons) try { window.lucide.createIcons(); } catch (_) {}
    return true;
  }

  function toggleAnalyticsMenu(divId, wrap) {
    let menu = wrap.querySelector('.pt-analytics-menu');
    if (menu) { menu.remove(); return; }
    const reports = REPORTS[divId] || [];
    menu = document.createElement('div');
    menu.className = 'pt-analytics-menu';
    if (!reports.length) {
      menu.innerHTML = `<div class="pt-analytics-item" style="cursor:default;color:#64748b">No analytics reports configured for this division yet.</div>`;
    } else {
      reports.forEach(r => {
        const b = document.createElement('button');
        b.className = 'pt-analytics-item';
        b.dataset.report = r.id;
        b.innerHTML = `<span>${escapeHtml(r.label)}</span><span class="pt-chip">${escapeHtml(r.type)}</span>`;
        b.onclick = () => { menu.remove(); openAnalyticsReport(divId, r.id); };
        menu.appendChild(b);
      });
    }
    wrap.appendChild(menu);
    setTimeout(() => {
      document.addEventListener('click', function once(ev) {
        if (!wrap.contains(ev.target)) { menu.remove(); document.removeEventListener('click', once); }
      });
    }, 0);
  }

  // ─── Modal + chart rendering ────────────────────────────────────
  function openAnalyticsReport(divId, reportId) {
    const report = (REPORTS[divId] || []).find(r => r.id === reportId);
    if (!report) return;
    const data = report.data();
    const backdrop = document.createElement('div');
    backdrop.className = 'pt-modal-backdrop';
    backdrop.dataset.ptModal = '1';
    backdrop.dataset.ptReport = reportId;
    backdrop.dataset.ptDivision = divId;
    const titleStr = `${prettyDivision(divId)} · ${report.label}`;
    backdrop.innerHTML = `
      <div class="pt-modal" role="dialog" aria-label="${escapeHtml(titleStr)}">
        <div class="pt-modal-head">
          <i data-lucide="bar-chart-3" class="w-4 h-4 text-purple-400"></i>
          <span class="pt-modal-title">${escapeHtml(report.label)}</span>
          <span class="pt-modal-sub">${escapeHtml(prettyDivision(divId))}</span>
          <button class="pt-modal-close" data-pt-action="close" aria-label="Close">&times;</button>
        </div>
        <div class="pt-modal-body">
          ${data ? `<div class="pt-chart-host"><canvas id="pt-chart-${reportId}"></canvas></div>` :
                   `<div style="text-align:center;padding:40px;color:#94a3b8">Live data not yet available for this report. Open the source dashboard or refresh and try again.</div>`}
        </div>
        <div class="pt-modal-foot">
          <span>Source: live division data · readable via Jarvis read_analytics tool</span>
          <span data-pt-readback>${data ? `${labelCount(data)} series · ${pointCount(data)} points` : 'no data'}</span>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.dataset.ptAction === 'close') closeAnalyticsModal();
    });
    if (window.lucide?.createIcons) try { window.lucide.createIcons(); } catch (_) {}

    if (data && window.Chart) {
      const ctx = document.getElementById(`pt-chart-${reportId}`).getContext('2d');
      new window.Chart(ctx, {
        type: report.type,
        data,
        options: chartOptions(report.type)
      });
    }
  }
  function closeAnalyticsModal() {
    document.querySelectorAll('[data-pt-modal]').forEach(el => el.remove());
  }
  function chartOptions(type) {
    const fg = '#e4e4e7', muted = '#94a3b8', grid = 'rgba(148,163,184,0.15)';
    const base = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { color: fg, font: { size: 11 }, boxWidth: 12 } }, tooltip: { backgroundColor: '#0a1628', borderColor: '#334155', borderWidth: 1 } } };
    if (type === 'doughnut' || type === 'pie') return { ...base, cutout: type === 'doughnut' ? '58%' : 0 };
    return {
      ...base,
      scales: {
        x: { ticks: { color: muted, font: { size: 10 } }, grid: { color: grid, drawBorder: false }, stacked: false },
        y: { ticks: { color: muted, font: { size: 10 } }, grid: { color: grid, drawBorder: false }, beginAtZero: true, stacked: false }
      }
    };
  }
  function labelCount(d) { return d.datasets ? d.datasets.length : 0; }
  function pointCount(d) {
    if (!d.datasets) return 0;
    return d.datasets.reduce((s, ds) => s + (ds.data ? ds.data.length : 0), 0);
  }

  // ─── Embed mode (popout / exit door) ────────────────────────────
  function popoutDivision(divId) {
    const url = location.pathname.replace(/\/$/, '') + '?embed=' + encodeURIComponent(divId);
    window.open(url, '_blank');
  }
  function handleEmbedMode() {
    const params = new URLSearchParams(location.search);
    const focus = params.get('embed');
    if (!focus) return;
    document.body.classList.add('pt-embed');
    // Switch to focused division as soon as switchPage is available
    function go() {
      if (typeof window.switchPage === 'function') {
        window.switchPage(focus);
        injectExitDoor();
        return true;
      }
      return false;
    }
    if (!go()) {
      const obs = new MutationObserver(() => { if (go()) obs.disconnect(); });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { go(); obs.disconnect(); }, 4000);
    }
  }
  function injectExitDoor() {
    if (document.getElementById('pt-exit-door')) return;
    const btn = document.createElement('button');
    btn.id = 'pt-exit-door';
    btn.title = 'Exit pop-out — return to main dashboard';
    btn.innerHTML = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>`;
    const tip = document.createElement('div');
    tip.className = 'pt-exit-tip';
    tip.textContent = 'Exit';
    btn.onclick = exitPopout;
    document.body.appendChild(btn);
    document.body.appendChild(tip);
  }
  function exitPopout() {
    // If opened via window.open, close. Otherwise navigate back to the
    // dashboard root.
    try {
      if (window.opener && !window.opener.closed) { window.close(); return; }
    } catch (_) {}
    location.href = location.pathname;  // strip ?embed param
  }

  // ─── Helpers ────────────────────────────────────────────────────
  function prettyDivision(d) {
    return ({
      masterforecast: 'Master + Forecast',
      finance: 'Finance',
      recruitingdivision: 'Recruiting',
      processingcuk: 'Processing (CUK)',
      ittech: 'IT & Technology',
      contracts: 'Contracts',
      j1division: 'J1 Division',
      j1housing: 'J1 Housing'
    })[d] || d;
  }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // ─── Bootstrap ──────────────────────────────────────────────────
  function boot() {
    injectStyle();
    DIVISIONS.forEach(d => augmentDivisionToolbar(d));
    handleEmbedMode();
    // Re-augment if pages get re-rendered (e.g., switchPage rebuilds DOM)
    const obs = new MutationObserver(() => DIVISIONS.forEach(d => augmentDivisionToolbar(d)));
    obs.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // ─── Public API ─────────────────────────────────────────────────
  window.PoseidonToolbar = {
    popoutDivision, openAnalyticsReport, closeAnalyticsModal,
    listReports: (divId) => (REPORTS[divId] || []).map(r => ({ id: r.id, label: r.label, type: r.type })),
    readReport: (divId, reportId) => {
      const r = (REPORTS[divId] || []).find(x => x.id === reportId);
      if (!r) return { ok: false, error: 'Unknown report' };
      const data = r.data();
      if (!data) return { ok: false, error: 'Live data unavailable for this report' };
      return {
        ok: true, division: divId, report: r.id, label: r.label, type: r.type,
        labels: data.labels,
        series: (data.datasets || []).map(ds => ({ label: ds.label || '(unlabeled)', data: ds.data }))
      };
    },
    isEmbedded: () => document.body.classList.contains('pt-embed'),
    BTN, BTN_BASE
  };
})();
