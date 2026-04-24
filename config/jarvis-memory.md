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
  Robert-Upchurch/Poseidon-Dashboard-V5.

## How to use this memory
- The first time Robert asks about a topic, check `recall("topic")`
  before answering.
- When Robert tells you something worth keeping
  ("remember that X is Y"), call `remember({ topic, fact })`.
- Don't over-remember. Keep entries crisp and factual; one or two
  lines each.
