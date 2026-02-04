# Craft (V1 foundation)

Craft is an AI-assisted system that translates non-authoritative conceptual geometry (**CRG**) + an authoritative conversational brief (**DIB**) into a validated parametric specification (**PSPEC**) suitable for deterministic CAD generation.

## Quick start
Prereqs: Node.js 18+.

1. Install deps: `npm install`
2. Run dev server: `npm run dev`
3. Open: `http://localhost:3000`

For Onshape generation, set these in `.env.local`:
- `ONSHAPE_CLIENT_ID`
- `ONSHAPE_CLIENT_SECRET`
- `ONSHAPE_REDIRECT_URI`
- `ONSHAPE_OAUTH_BASE`
- `ONSHAPE_API_BASE`
- `ONSHAPE_TEMPLATE_DID`
- `ONSHAPE_TEMPLATE_WID`
- `ONSHAPE_TEMPLATE_EID`

## Artifact lineage
Every project persists artifacts under `artifacts/<project_id>/`:
- `crg/` (uploaded reference geometry; non-authoritative)
- `dib/` (authoritative once confirmed)
- `pspec/` (validated output; review + approval)
- `meta/run.json` (timestamps, revisions, approval state)

## Architecture (non-negotiable)
See `docs/architecture.md`.
