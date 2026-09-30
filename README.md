# CSO Repository

## About CSO Open Source

**CSO Open Source** is the official repository submission platform for participants of the **ACLC College of Mandaue CSO Pre-Hackathon**.

Participants are required to submit their project repository and other necessary materials through the designated CSO Open Source repository. This platform serves as a centralized location for collecting, organizing, and reviewing project outputs throughout the competition.

### Required Submissions

Participants may be required to provide the following:

- **GitHub Repository** – The complete source code and project files of the developed system.
- **Project Documentation** – Documentation describing the system, its purpose, features, architecture, and implementation.
- **Project Presentation/Demo Video** – A video presentation demonstrating the system, its key features, and implementation.
- **Other Required Materials** – Additional files or resources specified by the CSO organizers.

Participants are responsible for ensuring that all submitted repositories, files, and video links are **complete, accessible, properly organized, and submitted before the specified deadline**.

### Purpose

CSO Open Source promotes proper **version control, collaboration, documentation, transparency, and open-source development practices**. It also provides the organizers and evaluators with a centralized platform for reviewing and assessing each team's project.

---

## Project Setup

This repository is built using **Vue 3** and **Vite**.

### Recommended IDE Setup

**VS Code** + **Vue (Official)** extension.

> If Vetur is installed, disable it when using the Vue (Official) extension.

### Recommended Browser Setup

#### Chromium-based Browsers

For Chrome, Edge, Brave, and other Chromium-based browsers:

- [Vue.js Devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
- [Enable Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)

#### Firefox

- [Vue.js Devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
- [Enable Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

### Customize Configuration

See the [Vite Configuration Reference](https://vite.dev/config/).

---

## Panels, roles & navigation

| Panel            | Route                                                                                       | Allowed roles             |
| ---------------- | ------------------------------------------------------------------------------------------- | ------------------------- |
| Participant site | `/`, `/submit/video`, `/submit/repository`, `/criteria`                                     | any signed-in participant |
| **Admin panel**  | `/admin` (+ `/admin/submissions`, `/admin/videos`, `/admin/scores`, `/admin/accounts`)      | `admin`, `superadmin`     |
| **Judges panel** | `/judges` (+ `/judges/scoring`, `/judges/repository`, `/judges/videos`, `/judges/criteria`) | `judge`                   |

- **Desktop** → fixed left sidebar (`src/views/Admin/layout.vue`, `src/views/Judges/layout.vue`).
- **Mobile / small screens** → **hamburger (☰) menu** in the header opens a slide-in drawer with the same items, plus _Back to Website_ and sign-out. (The old scrollable pill tabs were removed.)
- Header always shows a **breadcrumb**: `Superadmin ▸ Video Submissions`, `Admin ▸ Accounts`, `Judges ▸ Scoring`, etc. (the first segment reflects the signed-in role).
- **Video → theater mode**: clicking a thumbnail on the Videos page, or _Watch video_ on the Scoring page, plays **inline in an overlay** — no new tab. `Esc` or the backdrop closes it. (`Repository ↗` links still open a new tab by design.)
- Role enforcement lives in `firestore.rules` + the route guards in `src/router/index.js`.

---

## Video uploads (Cloudflare R2)

Demo videos no longer use Google Drive / Apps Script. The flow is:

1. Client `POST /presign` on the Cloudflare Worker (`worker/`) with a Firebase ID token
2. Browser `PUT`s the file directly to a presigned R2 URL (max **1 GiB**)
3. Client writes `video_submissions/{uid}` with `videoUrl` + `r2Key`
4. Player streams via Worker `GET /videos/…` (HTTP Range / `206` for seeking)

### Limits & validation

| Check                  | Where                                                                                                       | Value                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Max file size          | `worker/wrangler.toml` → `MAX_UPLOAD_BYTES` (also the live Worker var) + default in `worker/src/presign.js` | `1073741824` B = **1 GiB** → otherwise `413`                              |
| Client-side guard      | `src/stores/videosubmission.js`, `src/views/SubmitVideoView.vue`                                            | 1 GiB                                                                     |
| Allowed content types  | `worker/src/presign.js` → `ALLOWED_VIDEO_TYPES`                                                             | `video/mp4`, `video/webm`, `video/quicktime`, `video/x-m4v`, `video/mpeg` |
| Presigned URL lifetime | `worker/src/presign.js` → `expiresIn`                                                                       | `900` s (15 min)                                                          |
| CORS allowlist         | `worker/wrangler.toml` → `ALLOWED_ORIGINS`                                                                  | `localhost:5173`, `cso-opensource.pages.dev`, Firebase hosting domains    |
| Storage namespace      | presign key layout                                                                                          | `videos/{uid}/{uuid}.{ext}` (one folder per user)                         |

> If you raise the cap, update **all** of them (Worker var, `wrangler.toml`, the `presign.js` default, and the two client checks) and redeploy both Worker and Pages.

### Video guidelines (this is what fixes mobile buffering)

A raw 4K/60 capture (900 MB+, ~24 Mbps, `moov` atom at the **end** of the file) stalls on a phone. Before uploading:

- **1920×1080, 30 fps, H.264 High, CRF 23, `yuv420p`, AAC 128 k, `+faststart`**

```sh
ffmpeg -i input.mp4 \
  -vf "scale=-2:1080,fps=30" \
  -c:v libx264 -preset medium -crf 23 -profile:v high -level 4.1 \
  -pix_fmt yuv420p -g 60 \
  -c:a aac -b:a 128k -ac 2 \
  -movflags +faststart \
  output-1080p.mp4
```

Real result from this project: **954 MB 4K/60 → 44 MB** (≈1.1 Mbps), same duration, `moov` moved to the front.

Why it matters:

- `+faststart` puts `moov` first → the player can start playback immediately instead of downloading the whole file first.
- `Accept-Ranges` + `206` allow seeking; the Worker also sets `Cache-Control: public, max-age=31536000, immutable` and `X-Content-Type-Options: nosniff`.
- ~1–3 Mbps at 1080p30 fits comfortably inside typical mobile bandwidth, so judges don't hit the spinner.

### Setup

```sh
# Worker
cd worker && npm install
cp .dev.vars.example .dev.vars   # fill R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
npx wrangler deploy

# R2 dashboard
# - Create bucket: cso-video-submissions
# - Settings → CORS: paste worker/r2-cors.json

# App
# Set VITE_VIDEO_WORKER_URL=https://cso-videos.<account>.workers.dev in .env
npm run build

# Firestore rules
firebase deploy --only firestore:rules
```

> **Cloudflare Pages:** production builds are generated from git, and `.env` is gitignored — so the build has **no** `VITE_VIDEO_WORKER_URL` and the form shows _"Upload is not configured"_. Set it under **Pages → Settings → Environment variables** for **Production and Preview**, then redeploy.

---

## Testing

```sh
npm run test:worker   # Worker unit tests — Range parsing, presign validation (content type, 1 GB cap, auth), serve routing
npm run test:rules    # Firestore rules tests (Firebase emulator) — invites, role immutability, submissions
npm run build         # Production build (Vite)
npm run format        # Prettier over src/
```

---

## Installation

Clone the repository and install the required dependencies:

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env` and fill in the Firebase web config (and `VITE_VIDEO_WORKER_URL`), then `npm run build` for a production bundle.
