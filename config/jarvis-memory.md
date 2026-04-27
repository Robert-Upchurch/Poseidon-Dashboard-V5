# Jarvis — Memory Seed

> This file is Jarvis's long-term memory seed. It's served at
> `/config/jarvis-memory.md` and loaded into Jarvis on every session.
> Anything Robert tells Jarvis to remember during a conversation is
> appended to browser localStorage (key: `poseidon_jarvis_memory_v1`).
> Together they form Jarvis's "brain" across browser sessions.
>
> Robert can edit this file in the repo to seed/correct long-term facts.
> Use `recall("topic")` to query, `remember(...)` from a conversation
> to add a fact, `list_memory()` to dump everything, `forget("...")` to
> remove.

## Who Robert is
- Robert Upchurch — CEO, CTI Group Worldwide Services Inc.
- Operates Project Poseidon — a global expansion across maritime
  recruitment, hospitality staffing, J1 Cultural Exchange, travel,
  uniforms, and promotional materials.

## Operating company
- Legal name: CTI Group Worldwide Services Inc.
- HQ: Florida, USA
- Books org: Zoho Books org_id 877439787, USD currency
- Branches: Head Office, Marine Travel, Sea Based

## Brands / divisions
- CTI Group (parent)
- GHR — Global Human Resources (cruise/maritime crewing arm)
- Marine Travel (travel arm)
- UNO (uniforms)
- Baron (promotion & marketing)
- J1 Placements + J1 Housing (cultural exchange + accommodations)

## How Robert likes to work
- Ship fast, iterate on results.
- Concise updates in chat — long-form goes in PR descriptions.
- Always reference GitHub Pages live URL when announcing features
  (never bare localhost).
- PR-per-change workflow via the `gh` CLI on
  Robert-Upchurch/Poseidon (renamed from Poseidon-Dashboard-V5 on 2026-04-25).

## How to use this memory
- The first time Robert asks about a topic, check `recall("topic")`
  before answering.
- When Robert tells you something worth keeping
  ("remember that X is Y"), call `remember({ topic, fact })`.
- Don't over-remember. Keep entries crisp and factual; one or two
  lines each.

## Dashboards (as of 2026-04-27)

Two paired dashboards live in the same GitHub Pages site, with a
top-right teal pill button on each linking to the other:

- **Poseidon Master** (`poseidon-dashboard-v6.html`) — full CTI roll-up
  across every division. Default landing: Master + Forecast.
- **CTI Group · J1 System Dashboard** (`j1-system-dashboard.html`) —
  J1-only spinoff with a focused sidebar and the J1 Housing Finder as
  a top-level full-page route. Default landing: J1 Overview.

Both share the same Jarvis voice assistant module (`poseidon-jarvis-grok.js`)
and the same Chart.js / MSAL / Lucide stack.

## J1 Housing Finder — full readability

Reachable two ways: as a top-level page on the J1 System Dashboard
(page id `j1housingfinder`, full-bleed iframe across the monitor) and
as a nested tab inside the **"J1 Division"** sidebar entry on the J1
System Dashboard (page id `j1housing` — note the sidebar label is
**"J1 Division"** as of 2026-04-27, even though the underlying page id
is still `j1housing` for back-compat). Both load the same
`j1-housing-finder-index.html`.

**Filters bar (left → right) — every one is instant-search:**
1. **State** (50 + DC, two-letter abbreviation)
2. City (scoped by State; unfiltered when State is "All States")
3. Area / Neighborhood (depends on City)
4. Bedrooms (Studio / 1 / 2 / 3 / 4+)
5. Bathrooms (1 / 2 / 3+)
6. Max Price (up to $3000/mo)
7. Internet (Included / Not Included / Any)
8. Electricity (Included / Not Included / Any)
9. **Utilities** combo (All Included / Any Included / None Included / Any)

Plus: source tabs (All / Craigslist / Airbnb / Vrbo / Rent by Owner),
sort (price asc/desc, most beds, distance), and a Work Address geocoder
that computes distance to every filtered listing.

**Update cadence:** the listings dataset is refreshed every Monday,
Wednesday, and Friday. The header shows "Last refresh / Next" so
users always see when fresh data is expected.

**Source links — all canonical and live:**
- Craigslist → city subdomain + bed/price params (works for every listing city)
- Airbnb → `/s/{city}--{state}/homes` with monthly param
- Vrbo → `/search?destination={city}%2C+{state}` (canonical)
- RentByOwner → `/all/usa/{state-name}/{city-slug}` (their `?search=location` was retired and is gone from the page)

**Jarvis tool surface for housing:** `read_housing` returns every
dropdown's current value, every dropdown's available options
(including the live state/city/area lists), counts, the full filtered
listings array, the selected listing, and the work address.
`set_housing_filters` writes any combination of state, city, area,
beds, baths, max_price, internet, electric, utilities, source, sort —
state is applied first because it rebuilds the city dropdown.
`select_housing_listing` and `set_housing_work_address` complete the
surface.

## J1 System Dashboard sidebar (2026-04-27)

**J1 Division group (primary):**
- J1 Overview (`j1division`)
- Recruiting (`recruitingdivision`)
- **J1 Division** (`j1housing`) — housing & accommodations management + embedded J1 Housing Finder tab. Sidebar label was renamed from "J1 Housing" on 2026-04-27; underlying page id is unchanged.
- **Partner Onboarding** (`partneronboarding`) — pipeline of host companies moving through 5 stages (New Lead → MOU/NDA → Documentation → System Setup → Active) with a stalled-60-day flag and standard onboarding checklist
- **J1 Contract Analysis** (`j1contractanalysis`) — side-by-side comparison of Alliance Abroad / CIEE / Green Heart contracts (fees, terms, insurance, response time) plus fill-rate + pipeline-volume charts
- J1 Housing Finder (`j1housingfinder`)
- Partners (`partners`)
- Recruitment Videos (`videos`)
- (Sponsor Contracts entry was removed from the J1 dashboard sidebar
  on 2026-04-27. Cruise Line Contract Negotiation Dashboard +
  J1 Contract Analysis launcher both live on the Poseidon Master
  → Sponsor Contracts page only.)

**Other group (utility pages, was "Workspace"):**
- Home (`dashboard`), Tasks, Calendar, Tracker, Settings

## J1 Recruiting page — what's actually on it (2026-04-27)

Top-down on `recruitingdivision`:

1. **Zoho Live Snapshot** (teal block) — 12 KPIs + 4 charts (Sources,
   Stages, Sponsors donut, Top 10 Hosts) pulled from the Zoho Analytics
   J1 Programs Dashboard. Refreshes Mon/Wed/Fri.
2. **Positions by Sponsor** stacked bar — Alliance Abroad Group
   (1,048 / 0 / 1,048), CIEE (219 / 39 / 186), Green Heart (66 / 18 / 49).
3. **Open Orders** table — hosting companies with type, location,
   position, need, date received, date due, status. **Past-due rows
   are highlighted red with a PAST DUE badge.**
4. **KPI Scorecard** (indigo block) — Overall Division Score + 9
   metrics + Team Scores. Read via `read_kpi_scorecard`.
5. (Existing seed-driven KPI grid + weekly/monthly charts + pipeline
   donut + movement summary + stagnant positions table — these stay.)

Cruise-line content is GONE from the J1 dashboard — it lives on the
Poseidon Master. Don't claim cruise data on the J1 dashboard.

The Recruiting page sub-tab bar on the J1 dashboard now reads:
"Recruiting Overview" · "J-1 Candidates" · "Recruiting Workflow"
(no more "Cruise Ship Candidates" tab — removed 2026-04-27).
The full Cruise Ship Candidates panel with KPIs, openings table,
interview metrics, client directory, and markdown export lives on
the Poseidon Master at the same path. If asked about cruise
candidates, redirect: "That's on the Poseidon Master dashboard —
opening it now" and call go_to_page on Poseidon (or just navigate
the user to the cross-dashboard switcher).

## KPI Scorecard — the 9 metrics

Each metric is scored 0–100 with grade green ≥ 75 / amber 50-74 / red < 50.

| # | Metric | Source | Target |
|---|---|---|---|
| 1 | Orders vs Fulfillments | hired ÷ requisitions × 100 | 20% |
| 2 | Time to Placement | avg open-order age in days | ≤ 90 days |
| 3 | Visas Issued | Performance tab approved count | 100+ YTD |
| 4 | Visa Denial Rate | denied ÷ total interviews × 100 | ≤ 10% |
| 5 | Past-Due Orders | past-due count ÷ total orders × 100 | ≤ 15% |
| 6 | Office Balance | min ÷ mean across CTI offices | balanced |
| 7 | Country Coverage | source country count | 20+ |
| 8 | Sponsor Mix Evenness | spread across Alliance / CIEE / Green Heart | balanced |
| 9 | Partner (Sponsor) Health | avg fill rate across sponsors | 20%+ |

**Overall Division Score** = weighted composite. **Team Scores** roll
up per recruiting team (one per sponsor + Visa Processing).

When Robert asks any health / score / rating question, call
`read_kpi_scorecard` (NOT `read_full_dashboard`). Lead with the
overall score + grade, then call out the 1-2 worst-performing metrics.
