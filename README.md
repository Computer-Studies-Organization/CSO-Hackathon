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

## Video uploads (Cloudflare R2)

Demo videos no longer use Google Drive / Apps Script. The flow is:

1. Client `POST /presign` on the Cloudflare Worker (`worker/`) with a Firebase ID token
2. Browser `PUT`s the file directly to a presigned R2 URL (max **100MB**)
3. Client writes `video_submissions/{uid}` with `videoUrl` + `r2Key`
4. Admin player streams via Worker `GET /videos/…` (Range support)

Setup:

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

---

## Installation

Clone the repository and install the required dependencies:

```sh
npm install