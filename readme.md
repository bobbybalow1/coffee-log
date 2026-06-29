# Bobby's Beans

A personal coffee-roast tracker for logging roast profiles, phase timing, weight
loss, and tasting ratings. It runs entirely in the browser and saves every roast
to a Google Sheet.

**Live app:** https://bobbybalow1.github.io/coffee-log/

---

## Features

- **Phase timer** — lap-style Start / Mark / Stop timing for Drying, Roasting,
  Developing, and an optional Additional phase. First-crack and second-crack
  markers feed a true development ratio.
- **Removable phases** — drop any phase (e.g. Drying) with an ✕; it's recorded as
  `N/A` in the sheet so a skipped step is distinguishable from a blank one.
- **Roast curve** — inline SVG of temperature vs. time that scales to your data
  and the container size.
- **Flexible duration entry** — type `6:30`, `6.5` (decimal minutes), or `6 30`
  (space-separated); the field auto-formats to `m:ss`.
- **Ratings & favorites** — half-star ratings and a favorites toggle.
- **History** — searchable, sortable list of past roasts with full edit / delete /
  re-roast, plus CSV export.
- **Origin autocomplete** — suggestions built from origins you've logged before.
- **Verified saves** — after writing, the app reads the sheet back to confirm the
  roast actually landed instead of assuming success.
- **Home-screen ready** — installable on iOS with a custom icon.

---

## How it works

The whole front end is a single self-contained `index.html` (vanilla JavaScript,
inline SVG, no build step, no frameworks). It talks to a Google Apps Script web
app that reads and writes a Google Sheet.

Because the app and the script live on different origins, the two directions use
different techniques:

- **Reads** use JSONP (a `<script>` tag), since a normal cross-origin `fetch`
  can't read an Apps Script response.
- **Writes** use a `fetch` POST in `no-cors` mode. The reply isn't readable, so
  the app confirms a save by reading the sheet back afterward.

Durations are stored as **decimal minutes** in the sheet (e.g. `5.5`) for easy
math and analysis, and only formatted to `m:ss` for display and entry.

---

## Project structure

```
index.html        The entire web app (front end)
backend/Code.gs   Google Apps Script backend (source of truth — see note below)
icon.png          Home-screen app icon
README.md         This file
```

---

## Setup

### 1. Front end (GitHub Pages)

1. The repo must be **public** for free GitHub Pages.
2. Repo **Settings → Pages → Deploy from a branch → `main` / root**.
3. The app is served at `https://<user>.github.io/<repo>/`.

### 2. Backend (Google Apps Script)

1. Open your Google Sheet → **Extensions → Apps Script**.
2. Replace everything in the editor with the contents of `backend/Code.gs`, then
   **Save**.
3. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Authorize when prompted, then copy the **`/exec` URL**.

### 3. Connect them

Open the app, go to **Connection settings**, and paste the `/exec` URL. The app
remembers it on that device. Use **Test connection** to confirm.

---

## ⚠️ Editing the backend: you must redeploy

The `backend/Code.gs` in this repo is the **source of truth**, not the running
code. Committing a change here does **not** update the live endpoint.

After editing `Code.gs`, redeploy:

> **Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy**

This keeps the same `/exec` URL. Choosing *New deployment* instead would create a
different URL and you'd have to re-paste it into the app.

**Sanity check:** the script auto-repairs the sheet header when it runs, so after
a successful deploy the header row should include every current column (e.g.
`Favorite`). If a column you expect is missing, the new code isn't live yet.

---

## Notes

- Nothing secret lives in `Code.gs` — it runs as the sheet's owner via the
  deployment settings, and the `/exec` URL is stored only in the browser.
- The front end and backend are coupled: the `HEADERS` / `KEYS` arrays in
  `Code.gs` must stay in lockstep with the fields the app sends and reads.
