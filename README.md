# 5Ws System — Who does What, Where, When, for Whom

A humanitarian-standard **5W coordination system** (OCHA-style) that tracks
**Organizations → Projects → Activities**. Each activity is one 5W report:

| Dimension | Captured as |
|---|---|
| **Who** | Organization (seeded with the 73 CEPS member CSOs, full register fields) |
| **What** | Sector (19 seeded: 5 CEPS commissions + 11 IASC clusters + DRR / CCA / LIV) |
| **Where** | Configurable 3-level hierarchy (seeded: Regions → Districts → Localities / Islands, with ISO 3166-2 and INFORM P-codes) |
| **When** | Start/end dates (status — planned / ongoing / completed — lives on the project) |
| **For Whom** | Beneficiary groups (12 seeded) with targeted counts |
| **+1 How many** | Gender × age-group disaggregation (girls/boys 0–17, women/men 18–59, elderly 60+) + PWD |
| **DRM context** | Optional per activity: DRM cycle phase (prevention & mitigation / preparedness / response / recovery / cross-cutting), INFORM risk component addressed, and data source. Projects link to disaster events (GLIDE numbers). Budget/funding/partners live on the project. |

**Stack:** Vue 3 (Vite, Pinia, Vue Router, Chart.js, Leaflet) · Express 4 · MongoDB (Mongoose 8)

**Docs:** [User Manual](docs/USER-MANUAL.md) · [Operations Guide](docs/OPERATIONS.md)

## Prerequisites

- Node.js 18+
- MongoDB running locally (Windows service `MongoDB` or `mongod`)
- Python 3 with `pypdf` (only needed to re-extract organizations from the PDF)

## Setup & run

```powershell
# 1. Backend
cd backend
npm install
copy .env.example .env        # edit JWT_SECRET for production
npm run seed                  # idempotent: sectors, locations, groups, 73 orgs, admin user
npm run dev                   # API on http://localhost:5000

# 2. Frontend (second terminal)
cd frontend
npm install
npm run dev                   # UI on http://localhost:5173 (proxies /api to :5000)
```

Sign in with **admin / ChangeMe123!** (or the `SEED_ADMIN_PASSWORD` you set in
`.env`) — then change the password and create organization focal-point accounts
under **Admin → Users**.

## Roles

- **Administrator** — manages master data (organizations, sectors, locations,
  activity types, beneficiary groups) and user accounts; can edit any record.
- **Organization focal point** — tied to one organization; creates and edits
  only that organization's projects and activities. All authenticated users see
  the full dashboard (coordination visibility is the point).

## Key behaviours

- **Public landing page** — `/` is a no-login overview (stats, charts, coverage
  map with satellite basemap and org-location overlay) backed by cached
  `/api/public/*` endpoints that expose no contacts or budgets. The full app
  lives behind `/login`; the authenticated dashboard is at `/dashboard`.
- **Organization directory & profiles** — all users can browse organizations,
  open profile pages (contacts, office map point, project portfolio); focal
  points maintain their own profile via *My organization*, including a
  click-to-place office location shown on the maps.
- **CSV import** — Activities → *Import CSV* (template download, per-row
  dry-run validation, all-or-nothing commit); admin bulk-import for
  organizations. Excel (.xlsx) export alongside the CSV 5W matrix.
- **Drafts & account self-service** — project/activity forms auto-save drafts
  to the browser; users change their own password; admins issue temporary
  passwords with forced change at next login; sessions renew silently while
  active. Request logging (morgan) + an `auditlogs` collection record who did what.
- **Configurable geography** — level names (e.g. Region/District) are set in
  Admin → Locations and flow into every label, filter and export header. Add a
  GeoJSON boundary to a location to switch it from a proportional circle to a
  choropleth polygon on the dashboard map. (Seychelles boundaries: HDX dataset
  `syc_admbnda_adm2`; simplify before pasting.)
- **Beneficiary counts are per-activity totals** — locations indicate coverage.
  The CSV export repeats totals on each location row; do not sum across rows of
  the same activity.
- **Soft delete** — master data referenced by activities is deactivated, not
  deleted, so historical reports keep resolving.
- **5W matrix export** — Dashboard/Activities → *Export 5W matrix*: one row per
  activity × location × beneficiary group, honouring the active filters. Row 2
  carries **HXL hashtags** (hxlstandard.org) so the file loads directly into
  HDX Quick Charts and other HXL-aware tools; admin-unit columns include
  **P-codes** alongside names.
- **Disaster events (DRM)** — Admin → Disaster Events registers emergencies
  (hazard type, GLIDE number, status, dates). Projects link to an event;
  activities optionally carry a DRM cycle phase, the INFORM risk component
  they address (Admin → INFORM Components) and a data source — so the same
  system serves steady-state coordination and emergency response.
- **International code lists** — every location carries an editable P-code,
  ISO 3166-2:SC code and INFORM ADM1/ADM2 P-codes (Admin → Locations → Edit).
  All 19 sectors (CEPS commissions, IASC clusters, DRR/CCA/LIV) seed by
  default — the old `--iasc` flag is no longer needed.

## Re-seeding & upgrading

`npm run seed` is idempotent (upserts by natural key; official location
names/codes and blank org acronyms are refreshed on re-run). **Existing
databases** created before the REV1 gazetteer must run the migration first:

```powershell
cd backend
npm run migrate:rev1          # once: level 3, REV1 renames/codes, Anse Kerlan move
npm run seed
```

To re-extract the organization list from the CEPS directory PDF:

```powershell
cd backend
python seed/extract-orgs.py   # rewrites seed/data/organizations.json
npm run seed
```

## API overview

Base `/api`. Auth via `Authorization: Bearer <JWT>` from `POST /auth/login`.

- `/organizations` `/sectors` `/activity-types` `/beneficiary-groups` — CRUD (writes admin-only)
- `/locations` (+`/tree`, `/geojson`), `/admin-level-config`
- `/projects`, `/activities` — org-scoped writes, filterable lists
- `/dashboard/summary` — all widgets in one call, accepts 5W filters
- `/export/activities.csv` — 5W matrix, same filters
