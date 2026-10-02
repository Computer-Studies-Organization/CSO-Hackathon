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

## Installation

Clone the repository and install the required dependencies:

```sh
npm install
```

Create your local environment file and fill in the Firebase web config:

```sh
cp .env.example .env
```

| Variable                 | Description                                             |
| ------------------------ | ------------------------------------------------------- |
| `VITE_FIREBASE_*`        | Firebase web app config (Console → Project settings)    |
| `VITE_VIDEO_WORKER_URL`  | Worker base URL, e.g. `https://cso-videos.<account>.workers.dev` |

Then run the app:

```sh
npm run dev      # local dev server (http://localhost:5173)
npm run build    # production bundle → dist/
npm run preview  # serve the built bundle
npm run format   # Prettier over src/
```

### Tests

```sh
npm run test:worker   # Worker unit tests (presign validation, Range parsing, serve routing)
npm run test:rules    # Firestore rules tests (Firebase emulator)
```

---

## Video upload flow (Cloudflare R2)

Demo videos no longer use Google Drive / Apps Script.

```
┌──────────┐  1. POST /presign (Firebase ID token)  ┌──────────────┐
│  Browser │ ─────────────────────────────────────▶ │ cso-videos   │
│  (Vue)   │ ◀─ 2. presigned URL + r2Key + publicUrl│ Worker       │
│          │                                        └──────┬───────┘
│          │  3. PUT file ────────────────────────────▶ R2  │
│          │  4. write video_submissions/{uid}              │
│          │  5. player GET /videos/… (Range → 206) ◀───────┘
└──────────┘
```

1. Client `POST /presign` on the Cloudflare Worker with a Firebase ID token
2. Browser `PUT`s the file directly to the presigned R2 URL (**max 1 GiB** = `1073741824`)
3. Client writes `video_submissions/{uid}` with `videoUrl` + `r2Key`
4. Player streams via Worker `GET /videos/…` with HTTP Range support (seeking)

### Worker setup

```sh
cd worker && npm install
cp .dev.vars.example .dev.vars   # fill R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
npx wrangler dev                 # local
npx wrangler deploy              # production
```

Configuration lives in `worker/wrangler.toml`:

| Key                   | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| `MAX_UPLOAD_BYTES`    | upload cap (`"1073741824"` = 1 GiB); mirrored in `worker/src/presign.js` and the two client checks |
| `ALLOWED_ORIGINS`     | CORS allowlist (localhost, Pages, Firebase hosting)         |
| `FIREBASE_PROJECT_ID` | used to verify the Firebase ID token                        |
| `PLAYBACK_ORIGIN`     | playback origin for new `publicUrl`s + 302 from legacy `workers.dev` URLs — set to the Pages origin (edge caching runs there) |
| `[[r2_buckets]]`      | `VIDEOS` binding → bucket `cso-video-submissions`           |

### Edge caching (fixes playback buffering)

`functions/videos/[[path]].js` is a **Pages Function** that runs the same
Range/206 playback pipeline as the Worker, but with the Cache API — each video
is cached once at the Cloudflare edge and every later Range/seek request is
served from the cache instead of R2. The Cache API works on Pages Functions
even on `*.pages.dev` (it no-ops on `*.workers.dev`, which is why playback
lives here and not on the Worker).

Setup:

1. Pages → your project → Settings → Bindings → **R2 bucket**
   `cso-video-submissions`, binding name **`VIDEOS`**.
2. In `worker/wrangler.toml`, set
   `PLAYBACK_ORIGIN = "https://cso-opensource.pages.dev"` and
   `npx wrangler deploy` — new uploads store Pages playback URLs, and legacy
   `workers.dev` URLs stored in Firestore get 302'd there automatically.
3. Rebuild/deploy the Pages project (the `functions/` and `public/_routes.json`
   files ship with the normal git build).

`public/_routes.json` limits function invocations to `/videos/*` so static
requests stay on the free unlimited tier. Objects over 512 MiB are never cached
(Cloudflare's cache object cap) and keep serving straight from R2.

Allowed content types (`worker/src/presign.js`): `video/mp4`, `video/webm`, `video/quicktime`, `video/x-m4v`, `video/mpeg`. Presigned URLs expire after **15 minutes**.

### R2 dashboard

1. Create bucket: `cso-video-submissions`
2. Settings → CORS: paste `worker/r2-cors.json`
3. R2 → Manage API Tokens → Object Read & Write for that bucket → put the keys in `worker/.dev.vars` (and Worker secrets in production)

### Firestore rules

```sh
firebase deploy --only firestore:rules
```

### Cloudflare Pages (app hosting)

- Production builds are generated from git, and `.env` is gitignored — so the build has no
  `VITE_VIDEO_WORKER_URL` unless you set it under **Pages → Settings → Environment variables**
  (Production **and** Preview). Without it the form shows *"Upload is not configured"*.

### Recommended video encoding

Upload 1080p / 30 fps H.264 with `+faststart` (the `moov` atom goes to the front of the file so
playback can start immediately):

```sh
ffmpeg -i input.mp4 \
  -vf "scale=-2:1080,fps=30" \
  -c:v libx264 -preset medium -crf 23 -profile:v high -level 4.1 \
  -pix_fmt yuv420p -g 60 \
  -c:a aac -b:a 128k -ac 2 \
  -movflags +faststart \
  output-1080p.mp4
```

### Playback URL

```
https://cso-videos.<account>.workers.dev/videos/<uid>/<file>.mp4
```

The Worker serves `Accept-Ranges: bytes` (→ `206 Partial Content`), `Cache-Control: public,
max-age=31536000, immutable`, and `X-Content-Type-Options: nosniff`. The bucket itself is not
publicly listable — playback goes through the Worker only. With `PLAYBACK_ORIGIN` set (see
*Edge caching* above), playback goes through the Pages Function instead, served from the edge
cache after the first viewer.

---

## Panels & roles

| Panel            | Route                                  | Allowed roles             |
| ---------------- | -------------------------------------- | ------------------------- |
| Participant site | `/`, `/submit/video`, `/submit/repository`, `/criteria` | any signed-in participant |
| Admin panel      | `/admin`                               | `admin`, `superadmin`     |
| Judges panel     | `/judges`                              | `judge`                   |

Roles are enforced in `firestore.rules` and by the route guards in `src/router/index.js`.

---

## Security

See [SECURITY.md](./SECURITY.md) for the supported branch, vulnerability reporting, and the
security model (Worker auth, upload hardening, Firestore rules, secrets).
