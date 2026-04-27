# CLAUDE.md — Poseidon Dashboard repo

This file is the entry point for Claude Code when working in the Poseidon repository. For the project-wide strategy, roadmap, and non-code context, see `C:\Users\ceo\OneDrive - CTI Group Worldwide Services Inc\POSEIDON\CLAUDE.md` and the docs in `C:\Users\ceo\OneDrive - CTI Group Worldwide Services Inc\POSEIDON\Poseidon-Dashboard\`.

## Project at a glance

CTI Group's single-page command center. Production deployed via GitHub Pages.

- **Live:** https://robert-upchurch.github.io/Poseidon/poseidon-dashboard-v6.html
- **Repo:** https://github.com/Robert-Upchurch/Poseidon (renamed from `Poseidon-Dashboard-V5` on 2026-04-25 — the old GitHub Pages URL `/Poseidon-Dashboard-V5/` returns 404)
- **Stack:** HTML + Tailwind CDN + Chart.js 4.4.0 + MSAL 3.6.0 + Lucide. No build step. GitHub Pages deploy.
- **Current version:** 6.1.0 ("Jarvis Release")

## Owner preferences

Robert Upchurch, CEO. Email `ceo@cti-usa.com`. Wants professional, to-the-point answers with proof. Avoid long chatty responses. Suggest options only with proof. Verify claims before stating them.

## File map

```
poseidon-dashboard-v6.html       — main dashboard (502 KB single file)
poseidon-dashboard-v5.html       — frozen prior version (safety fallback)
index.html                       — version picker (consider promoting v6 to index.html)
j1-housing-finder-index.html     — J-1 housing tool
contracts/                       — contracts dashboard + analytics + cruise + mobile
js/poseidon-modules/             — 10 modular JS files (Jarvis, Zoho, toolbar, etc.)
config/                          — runtime config (changelog, directory, training, Zoho snapshot)
briefings/                       — daily JSON briefings
docs/                            — session changelogs
templates/                       — phase planning markdown
```

## Critical facts

- **Azure Client ID:** `aff2df6d-cd54-48f3-bd24-3584fd9ea3de` (M365/OneDrive auth)
- **Current MSAL scopes:** `User.Read, Mail.Read, Calendars.Read, Tasks.Read, Files.Read` — read-only
- **For partner intake (pending):** add `Files.ReadWrite` — requires Azure portal consent
- **Zoho Books org_id:** `877439787` (CTI Group Worldwide Services Inc.)
- **Theme:** teal `#14b8a6` accent on navy `#0a1628`
- **Active branch:** `main` (deployed)
- **Obsolete branch:** `feat/v6.1-jarvis-release` — main is 10 commits ahead

## Never do these without asking

- Push to `main` directly — show diff first
- Modify `poseidon-dashboard-v6.html` without showing the diff
- Merge `feat/v6.1-jarvis-release` (obsolete)
- Bake Zoho or xAI API keys into client-side code
- Use Zoho file storage for partner files (deliberately avoiding cost)

## Always do these

- For new features: branch from `main`, work on `feat/<name>`, surface diff, let Robert review and push
- For style: match teal/navy theme — Tailwind config has `brand` namespace
- For new modules: drop into `js/poseidon-modules/<name>.js`, register in main HTML
- For commits: Conventional Commits format (`feat:`, `fix:`, `chore:`, `docs:`)

## Cowork vs Claude Code advisory (added 2026-04-25)

For every non-trivial task, advise Robert which tool fits:
- **Stay in Claude Code** for code edits, refactors, git ops, deploy.
- **Switch to Cowork** for strategy, planning, mind maps, documents, connector data pulls, exec briefings.

If a task could go either way, name both and recommend one with a one-sentence reason.

## Context window management (added 2026-04-25)

Tell Robert when to open a new Claude Code session:
- After ~50–75 turns
- On topic shift
- When stuck on a problem
- When token usage feels heavy

To resume in Claude Code: `claude --resume <session-id>`. To start fresh: `claude` from the repo root — `CLAUDE.md` will reload context automatically.

## Landing file

Robert's master landing page is `C:\Users\ceo\OneDrive - CTI Group Worldwide Services Inc\POSEIDON\START-HERE.md`. Point him there when he seems lost.

## Pending work (see OneDrive\POSEIDON\Poseidon-Dashboard\ROADMAP.md)

1. Promote `poseidon-dashboard-v6.html` → `index.html` for clean URL
2. Update README from `OneDrive\POSEIDON\Poseidon-Dashboard\README-PROPOSED.md`
3. Delete `feat/v6.1-jarvis-release` branch (local + remote)
4. Deploy partner-intake scaffold from `OneDrive\POSEIDON\Poseidon-Dashboard\partner-intake\`
5. Build multi-agent backend (Phase 2 — see OneDrive map for spec)

## Local development

Static site — no build step. To preview:
```powershell
cd "$env:USERPROFILE\OneDrive - CTI Group Worldwide Services Inc\POSEIDON\Claude-Workspace\Code-Projects\Poseidon-Dashboard-V5"
python -m http.server 8000   # http://localhost:8000/poseidon-dashboard-v6.html
```

## Deploying

```powershell
git add <files>
git commit -m "feat: <what>"
git push
# GitHub Pages rebuilds in ~60s
```

## When uncertain

For questions that span both code and project strategy, read the OneDrive docs first — they're the project-level source of truth.
