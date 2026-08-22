# 5Ws Seychelles — Operations Guide

Deployment, backups, logs and maintenance for the platform
(Vue 3 SPA + Express API + MongoDB).

## Environment variables (`backend/.env`)

| Variable | Default | Notes |
|---|---|---|
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/fivews` | |
| `JWT_SECRET` | — | **Set a long random value in production** |
| `JWT_EXPIRES_IN` | `8h` | Sessions renew silently while the user is active |
| `PORT` | `5000` | |
| `SEED_ADMIN_PASSWORD` | `ChangeMe123!` | Used only by `npm run seed` |

## Running

```powershell
# Development
cd backend;  npm run dev     # nodemon on :5000
cd frontend; npm run dev     # Vite on :5173, proxies /api

# Production
cd frontend; npm run build   # emits frontend/dist
cd backend;  node src/server.js
```

Serve `frontend/dist` from any static host / reverse proxy that forwards
`/api/*` to the backend. Run the backend under a process manager (pm2,
NSSM or a systemd unit) so logs are captured and the process restarts.

## Public endpoints

`GET /api/public/summary` and `GET /api/public/geojson` are the only
unauthenticated routes (they power the public landing page). Responses are
cached in memory for 60 s, so they are cheap; if the site faces the open
internet without a proxy-level rate limit, consider adding `express-rate-limit`
on `/api/public`.

## Logs

- **Request log**: every API call is logged to stdout by morgan —
  `<iso date> <ip> user=<user id> <method> <url> <status> <bytes> <ms>`.
  Capture via the process manager (`pm2 logs`, journald, or NSSM file redirection).
- **Audit trail**: the `auditlogs` collection records who created/updated/
  deleted which entity (plus logins, password changes and imports). Query with
  mongosh, e.g.:
  ```js
  use fivews
  db.auditlogs.find().sort({ createdAt: -1 }).limit(20)
  ```
  It grows unbounded by design (audit value); prune manually if ever needed.

## Backups

Daily `mongodump`, keep at least 14 days:

```powershell
# Backup (run daily via Task Scheduler)
mongodump --uri "mongodb://127.0.0.1:27017/fivews" --out "D:\backups\fivews\$(Get-Date -Format yyyy-MM-dd)"

# Restore (DESTRUCTIVE — replaces current data)
mongorestore --uri "mongodb://127.0.0.1:27017" --drop "D:\backups\fivews\2026-08-22"
```

Also back up `backend/.env` (secrets) and any uploaded GeoJSON boundaries
(they live inside the database, so mongodump covers them).

## Seeding & migrations

- `npm run seed` (backend) is idempotent — upserts sectors, locations, groups, the 73 CEPS organizations and the admin user. `npm run seed -- --iasc` adds the 11 IASC clusters.
- One-off migrations live in `backend/seed/` (`migrate-org-refs.js`, `migrate-simplify.js`) and are re-runnable.

## Upgrade checklist

1. Back up the database (above).
2. `git pull` / copy the new release.
3. `npm install` in `backend/` and `frontend/` (only when dependencies changed).
4. `npm run build` in `frontend/`.
5. Restart the backend process; hard-refresh the browser.
6. Smoke test: public page loads anonymously; login works; dashboard renders; a CSV and an Excel export download.
