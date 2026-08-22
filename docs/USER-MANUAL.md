# 5Ws Seychelles — User Manual

*Civil Society Coordination Platform — Who does What, Where, When, for Whom*

This manual covers everyday use of the system for **organization focal points**
(who report their organization's work) and **administrators** (who manage
master data and user accounts).

---

## 1. The public overview

The system's front page (`/`) is **public** — no login required. It shows:

- Headline totals: organizations, projects, activities, beneficiaries targeted, geographic coverage
- The **coverage map** (choropleth/circles per district; switch between Map and Satellite basemaps; the *Organizations* overlay shows office locations of organizations that have set one)
- Projects by sector and by status, and the beneficiary demographics breakdown

Share this page with partners and the public — nothing sensitive (contacts, budgets)
is shown there. Use the **Log in** button to enter the full application.

## 2. Signing in

1. Open the site and click **Log in** (or go to `/login`).
2. Enter your username (or email) and password.
3. **Forgot your password?** Contact your coordinator/administrator — they will
   issue you a *temporary password*. When you next sign in with it, the system
   requires you to set your own password before continuing.
4. Change your password anytime via the **Password** button in the top-right corner.

Two roles exist:

| Role | Can do |
|---|---|
| **Organization focal point** | Report and edit their own organization's projects/activities; edit their organization's profile; view everything |
| **Administrator** | All of the above for any organization, plus master data (sectors, locations, groups, disaggregations, disaster events) and user accounts |

## 3. Dashboard

The dashboard (`/dashboard`) shows the same widgets as the public page plus
budgets and full filtering:

- **Filters** (organization, sector, status, location, disaster event, dates) apply to every widget at once.
- **Map**: click an area for details; *Drill into…* descends a level; *Filter dashboard* in a popup applies that area as a filter. Toggle the *Organizations* point overlay and the *Satellite* basemap from the layers control (top-right of the map).
- **Export**: *5W matrix (CSV)* / *(Excel)* download the OCHA-style long-format matrix honouring the active filters. Row 2 contains HXL hashtags; admin columns include P-codes.

## 4. Organizations directory

**Organizations** (sidebar) lists all active organizations for every user —
searchable and filterable by type and commission. Click a name for the
**profile page**: contacts, webpage, office location on a map, and the
organization's project portfolio.

- Focal points edit their own profile via **My organization** (sidebar) — including placing the **office point on the map** (click the map; use the satellite view to find the building).
- Administrators can edit any organization from its profile page or Admin → Organizations.

## 5. Projects

Projects group the activities an organization reports.

- **New project**: title, description, dates, status (planned/ongoing/completed), optional disaster/emergency context, budget (SCR/USD/EUR), funding sources and partner organizations (both from the organization registry).
- The form **auto-saves a draft** as you type — if the browser closes, reopening the form offers to restore the draft.

## 6. Reporting activities

An activity is one 5W report under a project.

1. **Activities → New activity.**
2. Pick the **project** (defines the reporting organization), title and **sector**.
3. Add every **location** the activity covers.
4. Set the implementation **dates**.
5. Add **beneficiary groups** with targeted counts, optionally disaggregated (gender/age/PWD as configured by the administrator). If a breakdown is entered, the total is raised to at least the breakdown sum on save.
6. **Submit.** Drafts auto-save here too — an unfinished report can be resumed later.

## 7. Bulk import (CSV)

- **Activities → Import CSV**: download the template, fill one row per activity *per beneficiary group* (repeat the Project Title / Activity Title / Start Date on consecutive rows to add more groups to the same activity). Locations are semicolon-separated P-codes or names. The import first **validates every row** and shows errors/warnings per line — nothing is imported until all rows pass. Projects must already exist.
- **Admin → Organizations → Import CSV** (admins): bulk-add organizations; rows whose name already exists are skipped.

## 8. Exports

- **5W matrix** (CSV or Excel) from the Dashboard or Activities page — one row per activity × location × beneficiary group, with HXL hashtags and P-codes. *Do not sum beneficiary totals across location rows of the same activity.*
- Every table (projects, organizations, users, master data) has an **Export CSV** button for what is currently on screen.

## 9. Administration

- **Master data** (Admin section): organizations, sectors/commissions, locations (with P-codes, centroids and optional GeoJSON boundaries), beneficiary groups, disaggregation categories, disaster events. Records referenced by activities are *deactivated* rather than deleted.
- **Users**: create accounts, assign roles/organizations, deactivate accounts, and reset passwords. Tick **"Require password change at next login"** when issuing a temporary password.

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| Can't log in | Check username/password; if the account was deactivated or you forgot the password, contact the administrator |
| "Password change required" | Your admin issued a temporary password — the system takes you to the change-password screen |
| Signed out unexpectedly | Sessions last 8 hours (extended automatically while you are active); sign in again |
| Import rejected | Fix the rows listed in the error preview — unknown sectors/locations/groups are matched by exact name or P-code |
| Map looks empty | The overview shows only areas with reported work; check the active filters |
