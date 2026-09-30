# Security Policy

## Supported versions

| Version / branch | Supported        |
| ---------------- | ---------------- |
| `main` (production) | :white_check_mark: |
| Other branches / older commits | :x: |

## Reporting a vulnerability

Report privately via **GitHub → Security → Advisories → Report a vulnerability** on this
repository. For non-sensitive bugs, open a normal issue. Include the route/endpoint, steps to
reproduce, and impact — never real credentials or user data. Expect an acknowledgement within a
few working days and a fix shipped with the next deploy to `main`.

## Security controls

- **AuthN / AuthZ** — Firebase Auth; route guards split `/admin` (admin, superadmin) from
  `/judges` (judge); role checks are enforced in `firestore.rules` (`isReviewer()`, `isAdmin()`,
  `isSuperadmin()`), not just in the UI.
- **Firestore rules** — invite-based registration bound to the GitHub identity, staff roles are
  immutable to admins, `video_submissions` can be created only for your own `uid` and updated only
  by admins (with `videoUrl` / `r2Key` pattern checks), and each judge writes only their own
  scores.
- **Worker (`cso-videos`)** — `POST /presign` requires a verified Firebase ID token (Google JWKS,
  RS256, issuer + audience); content-type allowlist; 1 GiB size cap → `413`; `Content-Type` is
  signed into the 15-minute presigned URL; keys are namespaced `videos/{uid}/…`.
- **Playback (`GET /videos/…`)** — only `videos/` keys, `..` rejected, no bucket listing,
  `X-Content-Type-Options: nosniff`, `Accept-Ranges` → `206`, `Cache-Control: public, max-age=31536000, immutable`.
- **CORS** — explicit allowlist (`ALLOWED_ORIGINS` in `worker/wrangler.toml`) with `Vary: Origin`
  (a browser-side control; the real gate is the ID token).
- **Secrets** — `.env`, `worker/.dev.vars`, `worker/.cloudflare` and service-account JSON files are
  gitignored; production secrets are supplied as Worker secrets. Rotate them if they ever appear
  in a commit, log, or screenshot.

## Known limitations

- Playback URLs are intentionally public so judges can stream and seek; object names are random
  UUIDs, but anyone holding a full URL can watch that video.
- The upload size is validated from the client-declared value; there is no per-PUT size limit on
  R2 and no rate limiting on `/presign`, so bucket usage is monitored operationally during events.
