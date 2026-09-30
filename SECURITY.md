# Security Policy

## Supported versions

| Version / branch           | Supported             |
| -------------------------- | --------------------- |
| `main` (production)        | :white_check_mark:    |
| Preview / feature branches | :warning: best effort |
| Older commits / releases   | :x:                   |

Only `main` receives security fixes. It is what Cloudflare Pages deploys from and what the
`cso-videos` Worker, Firestore rules, and R2 bucket are configured against.

## Reporting a vulnerability

- **Preferred (private):** GitHub → **Security → Advisories → Report a vulnerability** on this
  repository. It reaches the maintainers without disclosing the issue publicly.
- **Non-sensitive bugs** (UI issues, broken links, misbehaviour that exposes no data): open a
  normal GitHub issue.
- **Please include:** affected route/endpoint, reproduction steps, impact, and whether the issue
  was actually exploited. **Never include real credentials, tokens, or user data** in a report.
- **Expected response:** acknowledgement within a few working days, then a fix or mitigation
  shipped with the next deploy to `main`; critical issues are handled ahead of feature work.

## Security model

### Application

- **Authentication** — Firebase Auth (email/password + GitHub-linked identity). Route guards in
  `src/router/index.js` split `/admin` (admin/superadmin) from `/judges` (judge) and redirect
  unauthenticated visitors to the matching login page.
- **Authorization** — enforced server-side in `firestore.rules`, not only in the UI:
  - role helpers `isReviewer()` / `isAdmin()` / `isSuperadmin()` decide create/read/update/delete
  - staff **roles are immutable** to admins (only superadmin can grant `superadmin`)
  - `video_submissions`: create only for your own `uid`, **update is admin-only**, and
    `videoUrl` / `r2Key` must match strict URL/key patterns
  - `scores`: a judge writes only their own score documents; admins/superadmins can read all
- Registration is **invite-based** (invite token bound to the GitHub identity in the claim).

### Cloudflare Worker (`worker/` → `cso-videos`)

- `POST /presign` requires `Authorization: Bearer <Firebase ID token>`, verified against Google's
  JWKS with `issuer`/`audience`/`RS256` checks (`worker/src/auth.js`). Missing/invalid → `401`.
- Upload hardening (`worker/src/presign.js`): content-type allowlist, size cap
  (`MAX_UPLOAD_BYTES`, currently **1 GiB**) → `413`, `Content-Type` is **signed into the
  presigned URL** (the client must send the exact same header), URL valid for 15 minutes,
  keys namespaced as `videos/{uid}/…` so users cannot address each other's prefixes.
- `GET /videos/…` (`worker/src/serve.js`): only keys starting with `videos/`, rejects `..`
  (no path traversal), no directory listing (the bucket itself is not publicly listable),
  sets `X-Content-Type-Options: nosniff`, `Accept-Ranges` + `206` for seeking, and
  `Cache-Control: public, max-age=31536000, immutable`.
- **CORS** is an explicit allowlist (`ALLOWED_ORIGINS` in `worker/wrangler.toml`) with
  `Vary: Origin`. Treat CORS as a browser-side control only — the real gate is the Firebase
  ID token.

### Secrets & configuration

- Never committed (gitignored): `.env` (only `.env.example` is tracked), `worker/.dev.vars`,
  `worker/.cloudflare`, `*.runtimeconfig.json`, `*service-account*.json`, `serviceAccountKey.json`.
- R2 S3 credentials and the Wrangler API token are supplied out-of-band (`.dev.vars` locally,
  Worker secrets / dashboard in production) — rotate them if they ever appear in a commit, log,
  or screenshot.
- The build output `dist/` and `node_modules/` are not tracked.

## Known limitations (accepted for this deployment)

- **Playback URLs are public by design** so judges can stream and seek without auth. Object names
  are random UUIDs (not enumerable), but anyone who has the full URL can view that video.
- **Declared upload size is trusted**: the Worker validates the client-reported `size`, not the
  bytes actually sent — a modified client could exceed the 1 GiB intent. Mitigation is operational
  (watch R2 usage/metrics); R2 has no per-PUT size limit.
- **No rate limiting / quotas** on `POST /presign`; any signed-in account may upload up to the cap.
  Participants are trusted competition entrants — monitor bucket growth during the event.
- CORS reflects the first configured origin to unlisted origins; unlisted origins are still blocked
  by the browser, and unauthenticated requests fail at token verification.
