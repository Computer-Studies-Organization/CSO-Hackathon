# Fix Prior High Issues — auth hang, duplicate writes, superadmin escalation

> **STATUS (executed):** Phase 1 ✓ (auth.js), pagination ✓ (separate request), Phase 2 ✓
> (staff.js githubId lookup + backfill), Phase 3 ✓ (rules 3a identity binding + 3b role
> immutability), rules tests **15/15 green** (`npm run test:rules`), build ✓, worker 16/16 ✓.
> Proven: HEAD rules allow admin→superadmin flip (E1/E2 ALLOWED) → current rules DENY it.
> The `evaluation error at L###:24` seen on deny paths is a **pre-existing artifact** (also
> on HEAD) — outcomes are correct. **Remaining: deploy order below (client → backfill →
> rules) — rules NOT yet deployed.**

Scope: the three issues from the codebase review. Video-flow issues deferred (next plan).

- **#1 (High)** `initializeAuth()` can hang `/admin` navigation forever — `src/stores/auth.js:143-164`
- **#2 (Medium)** duplicate auth subscriptions / duplicate `fetchRole` writes — `auth.js` + `App.vue:18` + `router/index.js:20,48`
- **#3 (Critical)** open `staff` read + username-only invite claim → any participant can become superadmin — `firestore.rules:102-143`

Environment verified: Java 25 ✓, `firebase-tools` 15.30.1 (npx) ✓ → Firestore emulator rules tests are possible. Stack is Spark plan (per `submission.js:227` comment) → **no Cloud Functions / Custom Claims** — fixes must live in client + rules.

---

## Phase 1 — `src/stores/auth.js` (fixes #1 + #2)

### 1a. Memoize + never-hang `initializeAuth` (#1)

```js
initializeAuth() {
  if (this._initPromise) return this._initPromise          // #2: one subscription only
  this._initPromise = new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      this.initialized = true                               // #1: always set, even on failure
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), 8000)      // safety: auth callback never fires
    onAuthStateChanged(auth, async (user) => {
      this.user = user
      if (!user) {
        this.role = null
        this.githubUsernameValue = null
        clearTimeout(timer)
        finish(null)
        return
      }
      try {
        await this.fetchRole()                              // rethrows today → hang
      } catch {
        // fetchRole already set this.error + role = null; fail open to login redirect
      } finally {
        clearTimeout(timer)
        finish(user)
      }
    })
  })
  return this._initPromise
}
```

Effect: guards (`router/index.js:20,48`) can never block forever; `App.vue:18` and guards share one subscription (max 1 listener instead of 2).

### 1b. Single-flight `fetchRole` (#2)

Rename current body to `_fetchRole(usernameOverride)`, wrap:

```js
fetchRole(usernameOverride) {
  if (this._roleInflight) return this._roleInflight         // listener + loginWithGithub join
  const run = this._fetchRole(usernameOverride)
  this._roleInflight = run.finally(() => { this._roleInflight = null })
  return this._roleInflight
}
```

Keep `await this.fetchRole(githubUsername)` in `loginWithGithub` (`auth.js:110`) — **required**: `Admin/Login.vue:20` decides auto-logout from `canAccessPanel` immediately after the await.

### 1c. Kill the denied link-write on every re-login (#2 side effect)

In `_fetchRole`, the `setDoc(merge)` (`auth.js:256-268`) sends `linkedAt: serverTimestamp()` on an *existing* doc → rules `hasOnly(['lastLoginAt'])` denies it every login after the first (silent `console.warn` at `:270`).

Fix using data already fetched — the username query result contains our own UID doc after first login:

```js
const ownDoc = snapshot.docs.find((d) => d.id === this.user.uid)
if (ownDoc) {
  await updateDoc(doc(db, 'staff', this.user.uid), { lastLoginAt: serverTimestamp() })   // allowed
} else {
  await setDoc(doc(db, 'staff', this.user.uid), { /* existing full payload */ })          // create path
}
```

No rules change needed; re-login = 1 clean write instead of 1 denied attempt.

---

## Phase 2 — `src/stores/staff.js` (invite → GitHub identity binding, #3 prep)

### 2a. `addStaff` stores the invitee's numeric GitHub ID

After the username pattern check, before any write:

```js
const githubId = await lookupGithubId(username)
```

`lookupGithubId` is a shared helper mirroring `verifyRepositoryExists` in `submission.js:27-76` (10s timeout, `Accept: application/vnd.github+json`, 404 → "GitHub account @x does not exist.", 403/other/network → friendly retry error). Returns `String(data.id)`.

- Store `githubId` in **both** `staff_invites/{key}` and the `staff` mirror.
- Fail-closed: lookup error → no invite write (an invite without `githubId` would be unusable after Phase 3a).
- Rate limit: unauth 60/hr — only used during staff onboarding; same client-side GitHub API pattern already used by `submission.js`.

### 2b. `migrateLegacyInvites` backfills `githubId`

Extend both loops — **role:'admin' invites only** (judge invites are inert: `hasValidInvite` only accepts `'admin'`, so rules never read their `githubId` — saves API quota):

- Loop 1 (legacy `staff` uid:null → creates `staff_invites`): look up `githubId`, include it; on lookup failure create the invite anyway but record the username in `failed`.
- Loop 2 (invite without `staff` mirror): if `role === 'admin' && !githubId` → lookup → `updateDoc({ githubId })`, carry it onto the created mirror.
- Return `{ migrated, backfilled, failed }`; update the `Accounts.vue:137-139` message to show all three (`console.warn` lists `failed` usernames so the admin can verify coverage before Phase 3).

---

## Phase 3 — `firestore.rules` (#3 hardening, single deploy AFTER Phase 2 backfill)

### 3a. Bind invite claim to caller's GitHub identity (kills Gap A)

```rules
function hasValidInvite(username, role) {
  return hasInvite(username)
    && inviteData(username).githubUsername == username
    && inviteData(username).role == role
    && inviteData(username).role in ['admin']
    && inviteData(username).active != false
    && ('githubId' in inviteData(username))
    && inviteData(username).githubId
         == request.auth.token.firebase.identities['github.com'][0];
}
```

Knowing alice's username+role (from the open roster read) no longer helps — the attacker's ID token carries *their own* GitHub numeric ID. Fail-closed: invite without `githubId`, or a password-provider token (no `github.com` identity → map access errors → deny).

### 3b. Make `role` immutable for admins (kills Gap B)

```rules
allow update: if (isSuperadmin() && resource.data.role != 'superadmin')
  || (isAdmin() && !isSuperadmin()
      && resource.data.role == 'judge'
      && request.resource.data.role == resource.data.role)   // role immutable
  || (request.auth != null
      && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['lastLoginAt']));
```

- Re-based vs the old snippet: the current **create** split is already correct (superadmin→`'admin'`, admin→`'judge'`, self-claim→`'admin'`) — only the admin **update** branch was missing the pin.
- Superadmin branch stays unpinned: `migrateStaffToJudges` (client role rewrite `'staff'`→`'judge'`) and break-glass must keep working; superadmin is already the top role.
- Admin can still toggle `active` / edit `displayName` on judge docs — but can no longer flip a judge (incl. one they provisioned via `addJudge`) to `admin`/`superadmin`.
- Superadmin provisioning stays console-only (Firestore console bypasses rules).

### 3c. Known tradeoffs (documented, unchanged)

- `allow read: if request.auth != null` on `staff` (`:126`) stays — rules cannot verify GitHub username, and the login query (`staff` by `githubUsername+active`) needs it. After 3a, enumeration leaks names/roles but **cannot escalate**. Full fix needs server-side role resolution (Blaze plan) — out of scope.
- GitHub rename after invite breaks username-keyed lookup (pre-existing, unchanged).

---

## ⚠ Deployment order (lockout risk — rules fail closed)

1. **Deploy client** (Phase 1 + 2 code) — old rules still active, everything keeps working.
2. **Run backfill** (Accounts → Migrate) → verify every `staff_invites` doc has `githubId` (check in Firestore console or a quick rules test).
3. **Deploy rules** (Phase 3) — deploying before step 2 would deny the link step → `staff/{uid}` never created → `isStaff()` false → **staff locked out of dashboard**.

---

## Testing (per request: "after that i testing sya")

### A. Automated

1. `npm run build` — must pass.
2. `npm run test:worker` — 16/16 must stay green (untouched).

### B. New: Firestore rules tests (emulator)

Add devDep `@firebase/rules-unit-testing` + npm script:

```json
"test:rules": "firebase emulators:exec --only firestore -- node --test \"test/rules/**/*.test.js\""
```

Seed: invite `staff_invites/bob` `{githubUsername:'bob', role:'admin', active:true, githubId:'777'}`, invite `staff_invites/carol` (same, no `githubId`), staff docs (superadmin/admin/judge), legacy `role:'staff'` doc for R11. Token claims fabricate `firebase.identities['github.com']` per context.

| # | Case | Expect |
|---|------|--------|
| R1 | claim own `staff/{uid}` with matching invite `githubId` + token identity `['777']` | ALLOW |
| R2 | **attacker claims bob's invite (right username, attacker's token identity `['999']`)** | **DENY** |
| R3 | claim invite missing `githubId` (carol — not backfilled) | DENY |
| R4 | admin flips judge doc `role` → `'superadmin'` | DENY |
| R5 | admin creates doc with `role:'superadmin'` | DENY |
| R6 | admin toggles `active` / edits `displayName` on judge doc | ALLOW |
| R7 | any signed-in user updates only `lastLoginAt` | ALLOW |
| R8 | admin update targeting a `superadmin` doc | DENY |
| R9 | admin creates judge doc (`role:'judge'`, `active:true`) | ALLOW |
| R10 | regression: `submissions`/`video_submissions` create by owner | ALLOW |
| R11 | superadmin runs staff→judge role migration (`'staff'` → `'judge'`) | ALLOW |
| R12 | admin flips judge doc `role` → `'admin'` | DENY |
| R13 | superadmin flips admin doc `role` → `'superadmin'` (break-glass) | ALLOW |

**R1 proves the rules can read the `identities` claim path** (emulator fabricates tokens). Real GitHub tokens always carry `firebase.identities['github.com']` = numeric provider ID — but verify live with ONE invite right after the rules deploy (checklist below); if the link write is denied, roll back rules.

### C. Manual checklist (ikaw, after deploy)

- [ ] `npm run dev` → sign in as **non-staff** → visit `/admin` → redirected to `/admin/login` with message (no blank/hang page)
- [ ] Sign in as **staff** → Dashboard loads → DevTools: exactly **one** `staff` query, console has **no** `PERMISSION_DENIED` / "Unable to link UID doc"
- [ ] **Sign out + sign in again** → same as above (single query, no denied writes)
- [ ] Hard-reload `/admin` while **offline** → lands on login page within ~8 s (not infinite spinner)
- [ ] Accounts → add a new staff username → `staff_invites` doc contains `githubId` → that person can then sign in and open Dashboard
- [ ] Accounts → Migrate → shows migrated/backfilled/failed counts; spot-check an old **admin** invite now has `githubId`
- [ ] After rules deploy: one live admin-invite claim → Dashboard opens (no `Unable to link UID doc` warn). If denied → roll rules back.
- [ ] Attempt the escalation manually (rules playground): authenticated as participant, `create staff/{self}` with `githubUsername:'<invited>'`, `role:'admin'` → DENIED

---

## Files touched

| File | Change |
|------|--------|
| `src/stores/auth.js` | memoized `initializeAuth`, try/finally + 8s timeout, single-flight `fetchRole`, existence-aware link write |
| `src/stores/staff.js` | `githubId` lookup in `addStaff`, backfill in `migrateLegacyInvites` |
| `firestore.rules` | `hasValidInvite` identity binding, role immutability, create-role cap |
| `package.json` | devDep `@firebase/rules-unit-testing`, script `test:rules` |
| `firebase.json` | emulators config (if needed for `emulators:exec`) |
| `test/rules/*.test.js` | new — R1–R10 matrix |

No changes to `App.vue`, router, views, or worker.

## Out of scope (next plan)

Video-flow medium/low issues (upload progress/cancel, orphaned R2 objects, content-type mismatch), bundle splitting, Vue `rc` pinning, `SECURITY.md`.
