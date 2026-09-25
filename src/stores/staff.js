import { defineStore } from 'pinia'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore'

import { db } from '@/firebase/config'

const GITHUB_USERNAME_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Identity Toolkit REST base. Used directly instead of the Firebase JS SDK
// so creating a judge never replaces the signed-in admin's own auth session
// (SDK signUp would sign the admin out).
const IDENTITY_TOOLKIT =
  'https://identitytoolkit.googleapis.com/v1/accounts'

const FIREBASE_API_KEY = import.meta.env.VITE_FIREBASE_API_KEY

// Temp password generator: 14 chars, crypto-grade randomness, alphabet
// strips look-alikes (l / o / O / I / 0 / 1) so it is unambiguous when an
// admin reads it aloud or types it into a chat. Shown once, never stored.
function generateTempPassword(length = 14) {
  const alphabet =
    'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const buf = new Uint32Array(length)
  crypto.getRandomValues(buf)

  let out = ''
  for (let i = 0; i < length; i++) {
    out += alphabet[buf[i] % alphabet.length]
  }
  return out
}

async function identityToolkit(endpoint, body) {
  const res = await fetch(
    `${IDENTITY_TOOLKIT}:${endpoint}?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  )

  const payload = await res.json().catch(() => ({}))

  return { ok: res.ok, payload, code: payload?.error?.message || '' }
}

// Maps Identity Toolkit error strings to copy an admin can act on.
function identityToolkitMessage(code) {
  if (code.includes('EMAIL_EXISTS')) {
    return 'That email already has a Firebase account. Send a password reset instead.'
  }
  if (code.includes('INVALID_EMAIL')) {
    return 'Firebase rejected that email address.'
  }
  if (code.includes('MISSING_PASSWORD') || code.includes('WEAK_PASSWORD')) {
    return 'That password is too weak. Use at least 6 characters.'
  }
  if (code.includes('TOO_MANY_ATTEMPTS')) {
    return 'Too many attempts. Wait a moment and try again.'
  }
  if (code.includes('USER_NOT_FOUND')) {
    return 'No Firebase account exists for that email yet.'
  }
  if (code.includes('NETWORK_REQUEST_FAILED')) {
    return 'Network error. Check your connection and try again.'
  }
  return code || 'Unable to reach Firebase Authentication.'
}

// Numeric GitHub account id for an invitee — the identity firestore.rules
// binds invite claims to (request.auth.token.firebase.identities).
// Mirrors verifyRepositoryExists in submission.js: fail-closed, 10s cap.
async function lookupGithubId(username) {
  let response
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    })
    clearTimeout(timeout)
  } catch {
    throw new Error('Could not verify the GitHub account. Check your connection and try again.')
  }

  if (response.status === 404) {
    throw new Error(`GitHub account @${username} does not exist.`)
  }
  if (response.status === 403) {
    throw new Error(
      'GitHub verification is rate-limited right now. Please wait a minute and try again.',
    )
  }
  if (!response.ok) {
    throw new Error('Could not verify the GitHub account. Please try again.')
  }

  const data = await response.json().catch(() => ({}))

  if (!data.id) {
    throw new Error('Could not verify the GitHub account. Please try again.')
  }

  return String(data.id)
}

// Invites live in `staff_invites/{usernameLower}` (admin-only writes).
// Canonical role docs live in `staff/{uid}`.
// Legacy random-ID invites in `staff` (uid: null) are merged read-only
// until migrateLegacyInvites() copies them over.
function friendlyError(error, fallback) {
  if (error?.code === 'permission-denied') {
    return 'Missing or insufficient permissions. Deploy the latest firestore.rules and make sure your account is an admin.'
  }
  return error?.message || fallback
}

export const useStaffStore = defineStore('staff', {
  state: () => ({
    staff: [],
    isLoading: false,
    isSaving: false,
    error: null
  }),

  actions: {
    async fetchStaff() {
      this.isLoading = true
      this.error = null

      try {
        const [staffSnap, inviteSnap] = await Promise.all([
          getDocs(collection(db, 'staff')),
          getDocs(collection(db, 'staff_invites')).catch(() => ({ docs: [] }))
        ])
        const staffDocs = staffSnap.docs.map((d) => ({
          id: d.id,
          source: 'staff',
          ...d.data()
        }))
        const inviteDocs = (inviteSnap.docs || []).map((d) => ({
          id: d.id,
          source: 'invite',
          githubUsername: d.id,
          ...d.data()
        }))
        const all = [...staffDocs, ...inviteDocs].sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? 0
          const tb = b.createdAt?.toMillis?.() ?? 0
          return tb - ta
        })
        // Dedupe by githubUsername: prefer canonical staff/{uid},
        // then new invite, then legacy random-ID invite.
        const rank = (item) => {
          if (item.id === item.uid) return 0
          if (item.source === 'invite') return 1
          return 2
        }
        const byName = new Map()
        for (const item of all) {
          const key = (item.githubUsername || '').toLowerCase()
          if (!key) {
            byName.set(`id:${item.source}:${item.id}`, item)
            continue
          }
          const existing = byName.get(key)
          if (!existing) {
            byName.set(key, item)
          } else if (rank(item) < rank(existing)) {
            byName.set(key, item)
          }
        }
        this.staff = [...byName.values()].sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? 0
          const tb = b.createdAt?.toMillis?.() ?? 0
          return tb - ta
        })
        // Linked = some doc in the group was claimed (uid set) or ever
        // logged in (presence touch). Carried onto the merged row so the
        // UI can show linked/not-yet-signed-in correctly.
        for (const item of all) {
          const key = (item.githubUsername || '').toLowerCase()
          if (!key) continue
          const winner = byName.get(key)
          if (winner && (item.uid != null || item.lastLoginAt != null)) {
            winner.linked = true
          }
        }
        return this.staff
      } catch (error) {
        console.error('Fetch staff error:', error)
        this.error = friendlyError(error, 'Unable to load staff accounts.')
        throw error
      } finally {
        this.isLoading = false
      }
    },

    async addStaff(adminUser, { githubUsername, role }) {
      this.isSaving = true
      this.error = null

      try {
        const username = (githubUsername || '').trim().replace(/^@/, '')

        if (!GITHUB_USERNAME_PATTERN.test(username)) {
          throw new Error('Please provide a valid GitHub username.')
        }
        // Only admin/judge can be created via UI.
        // Superadmin is assigned manually (console/allowlist).
        if (!['admin', 'judge'].includes(role)) {
          throw new Error('Invalid role selected.')
        }

        // Direct admin write to the invite allowlist.
        const key = username.toLowerCase()

        // Duplicate check across invites + canonical/legacy docs.
        const [inviteExisting, staffExisting] = await Promise.all([
          getDoc(doc(db, 'staff_invites', key)).catch(() => null),
          getDocs(
            query(collection(db, 'staff'), where('githubUsername', '==', key))
          ).catch(() => ({ empty: true }))
        ])
        if ((inviteExisting && inviteExisting.exists?.()) || !staffExisting.empty) {
          throw new Error(`@${username} is already in the account list.`)
        }

        // Fail-closed identity binding: firestore.rules requires this id on
        // the invite before anyone may claim it, so no lookup -> no write.
        const githubId = await lookupGithubId(username)

        await setDoc(doc(db, 'staff_invites', key), {
          githubUsername: key,
          displayName: username,
          role,
          active: true,
          githubId,
          createdBy: adminUser?.uid || null,
          createdAt: serverTimestamp(),
        })

        // Mirror into `staff`: the login flow (auth.js) resolves roles by
        // querying `staff` by githubUsername, so an invite living only in
        // `staff_invites` would never be found at login. Same role/active
        // so toggle/remove cascades stay consistent.
        await addDoc(collection(db, 'staff'), {
          githubUsername: key,
          displayName: username,
          role,
          active: true,
          githubId,
          uid: null,
          createdBy: adminUser?.uid || null,
          createdAt: serverTimestamp(),
          mirrorOf: `staff_invites/${key}`,
        })

        await this.fetchStaff()
        return key
      } catch (error) {
        console.error('Add staff error:', error)
        this.error = friendlyError(error, 'Unable to add staff account.')
        throw error
      } finally {
        this.isSaving = false
      }
    },

    // Judge provisioning (email + password). Two-step:
    //   1) Identity Toolkit REST signUp — creates the Firebase Auth user and
    //      returns the uid. Raw fetch, so the admin's session is untouched.
    //   2) setDoc(staff/{uid}, { role: 'judge', ... }) — the canonical role
    //      doc that firestore.rules' isReviewer()/isAdmin() resolve against.
    // The temp password is returned once and never persisted anywhere.
    async addJudge(adminUser, { email, displayName }) {
      this.isSaving = true
      this.error = null

      try {
        if (!FIREBASE_API_KEY) {
          throw new Error(
            'VITE_FIREBASE_API_KEY is missing. Add it to .env to provision judges.'
          )
        }

        const normalizedEmail = String(email || '')
          .trim()
          .toLowerCase()

        if (!EMAIL_PATTERN.test(normalizedEmail)) {
          throw new Error('Please provide a valid email address.')
        }

        const name =
          String(displayName || '').trim() ||
          normalizedEmail.split('@')[0]

        // Duplicate check in Firestore first — clearer than a raw 400 and
        // catches a doc left behind by a previously failed provisioning.
        const existing = await getDocs(
          query(
            collection(db, 'staff'),
            where('email', '==', normalizedEmail)
          )
        ).catch(() => ({ empty: true }))

        if (!existing.empty) {
          throw new Error(
            `${normalizedEmail} is already in the account list.`
          )
        }

        const tempPassword = generateTempPassword()

        const { ok, code, payload } = await identityToolkit('signUp', {
          email: normalizedEmail,
          password: tempPassword,
          returnSecureToken: true
        })

        if (!ok) {
          throw new Error(identityToolkitMessage(code))
        }

        const uid = payload.localId

        if (!uid) {
          throw new Error(
            'Account was created but Firebase returned no user id.'
          )
        }

        // Rules pin role:'judge' + active:true for admin-created staff docs.
        await setDoc(doc(db, 'staff', uid), {
          email: normalizedEmail,
          displayName: name,
          role: 'judge',
          active: true,
          uid,
          createdBy: adminUser?.uid || null,
          createdAt: serverTimestamp(),
          createdVia: 'email-password'
        })

        await this.fetchStaff()

        return {
          uid,
          email: normalizedEmail,
          displayName: name,
          tempPassword
        }
      } catch (error) {
        console.error('Add judge error:', error)
        this.error = friendlyError(
          error,
          'Unable to create the judge account.'
        )
        throw error
      } finally {
        this.isSaving = false
      }
    },

    // Password reset for an existing judge. UI-visible to superadmin only
    // (decision), but the endpoint itself is public — it only mails the
    // owner of that address and is rate-limited by Firebase.
    async sendJudgeReset(member) {
      this.isSaving = true
      this.error = null

      try {
        if (!FIREBASE_API_KEY) {
          throw new Error(
            'VITE_FIREBASE_API_KEY is missing. Add it to .env to send resets.'
          )
        }

        const email = String(member?.email || '')
          .trim()
          .toLowerCase()

        if (!EMAIL_PATTERN.test(email)) {
          throw new Error('This account has no email on file.')
        }

        const { ok, code } = await identityToolkit('sendOobCode', {
          requestType: 'PASSWORD_RESET',
          email
        })

        if (!ok) {
          throw new Error(identityToolkitMessage(code))
        }

        return email
      } catch (error) {
        console.error('Send judge reset error:', error)
        this.error = friendlyError(
          error,
          'Unable to send the password reset email.'
        )
        throw error
      } finally {
        this.isSaving = false
      }
    },

    // One-time migration (both directions, run as admin):
    // 1) legacy random-ID invites in `staff` (uid: null) -> staff_invites.
    // 2) staff_invites without a `staff` mirror -> create the mirror so
    //    the login username-query can find them.
    // Also backfills `githubId` on claimable (role:'admin') invites — the
    // field firestore.rules requires before anyone may claim them. Judge
    // invites are inert (never claimable), so no API quota is spent there.
    // Returns { migrated, backfilled, failed } so the admin can verify
    // coverage before the rules deploy that consumes githubId.
    async migrateLegacyInvites() {
      const snap = await getDocs(collection(db, 'staff'))
      let migrated = 0
      let backfilled = 0
      const failed = new Set()

      const idFor = async (username) => {
        try {
          return await lookupGithubId(username)
        } catch (error) {
          console.warn(`githubId lookup failed for @${username}:`, error.message)
          failed.add(username)
          return null
        }
      }

      for (const d of snap.docs) {
        const data = d.data()
        const username = (data.githubUsername || '').toLowerCase()
        if (!username || data.uid != null) continue
        if (d.id === data.uid) continue
        if (!['admin', 'judge'].includes(data.role)) continue
        const inviteRef = doc(db, 'staff_invites', username)
        const existing = await getDoc(inviteRef).catch(() => null)
        if (existing && existing.exists?.()) continue
        const githubId = data.role === 'admin' ? await idFor(username) : null
        await setDoc(inviteRef, {
          githubUsername: username,
          displayName: data.displayName || username,
          role: data.role,
          active: data.active !== false,
          ...(githubId ? { githubId } : {}),
          createdBy: data.createdBy || null,
          createdAt: data.createdAt || serverTimestamp(),
          migratedFrom: d.id,
          migratedAt: serverTimestamp(),
        })
        migrated += 1
      }
      const inviteSnap = await getDocs(collection(db, 'staff_invites')).catch(() => ({
        docs: []
      }))
      for (const d of inviteSnap.docs || []) {
        const data = d.data()
        const username = (data.githubUsername || d.id || '').toLowerCase()
        if (!username || !['admin', 'judge'].includes(data.role)) continue

        // Backfill before the mirror check: coverage matters even when the
        // mirror already exists.
        let githubId = data.githubId || null
        if (data.role === 'admin' && !githubId) {
          githubId = await idFor(username)
          if (githubId) {
            await updateDoc(doc(db, 'staff_invites', d.id), { githubId })
            backfilled += 1
          }
        }

        const existing = await getDocs(
          query(collection(db, 'staff'), where('githubUsername', '==', username))
        ).catch(() => ({ empty: true }))
        if (!existing.empty) continue
        await addDoc(collection(db, 'staff'), {
          githubUsername: username,
          displayName: data.displayName || username,
          role: data.role,
          active: data.active !== false,
          ...(githubId ? { githubId } : {}),
          uid: null,
          createdBy: data.createdBy || null,
          createdAt: data.createdAt || serverTimestamp(),
          mirrorOf: `staff_invites/${username}`,
        })
        migrated += 1
      }
      await this.fetchStaff()
      return { migrated, backfilled, failed: [...failed] }
    },

    // One-time role rename: `staff` -> `judge`.
    //
    // The `staff` role was removed from VALID_ROLES and from the
    // firestore.rules role allowlists in the same deploy that added this
    // button, so any doc still carrying role:'staff' cannot sign in until
    // this runs. Superadmin is unaffected (its role never changed), so it
    // stays able to reach Accounts and run the migration.
    //
    // A `staff` invite can no longer be claimed either (hasValidInvite
    // only accepts 'admin' now), so converting it to 'judge' simply makes
    // the stale row consistent — it stays inert, which is fine because
    // judges authenticate by email, not by GitHub invite.
    async migrateStaffToJudges() {
      this.isLoading = true
      this.error = null

      try {
        const [staffSnap, inviteSnap] =
          await Promise.all([
            getDocs(collection(db, 'staff')),
            getDocs(collection(db, 'staff_invites')).catch(
              () => ({ docs: [] })
            )
          ])

        let staffConverted = 0
        let invitesConverted = 0

        for (const d of staffSnap.docs) {
          if (d.data().role !== 'staff') continue
          await updateDoc(d.ref, {
            role: 'judge',
            migratedAt: serverTimestamp()
          })
          staffConverted += 1
        }

        for (const d of inviteSnap.docs || []) {
          if (d.data().role !== 'staff') continue
          await updateDoc(d.ref, {
            role: 'judge',
            migratedAt: serverTimestamp()
          })
          invitesConverted += 1
        }

        await this.fetchStaff()

        return { staffConverted, invitesConverted }
      } catch (error) {
        console.error('Migrate staff -> judge error:', error)
        this.error = friendlyError(
          error,
          'Unable to migrate staff accounts to judges.'
        )
        throw error
      } finally {
        this.isLoading = false
      }
    },

    async toggleActive(member) {
      if (member.role === 'superadmin') {
        throw new Error('Superadmin accounts cannot be disabled.')
      }
      try {
        const nextActive = !(member.active !== false)
        // Apply to invite + all UID/legacy docs with same username.
        const targets = await this.relatedDocs(member)
        for (const t of targets) {
          if (t.role === 'superadmin') continue
          if (t.source === 'invite') {
            await updateDoc(doc(db, 'staff_invites', t.id), {
              active: nextActive
            })
          } else {
            await updateDoc(doc(db, 'staff', t.id), {
              active: nextActive
            })
          }
        }
        // Fallback: at least update the displayed doc.
        if (!targets.length) {
          if (member.source === 'invite') {
            await updateDoc(doc(db, 'staff_invites', member.id), {
              active: nextActive
            })
          } else {
            await updateDoc(doc(db, 'staff', member.id), {
              active: nextActive
            })
          }
        }
        await this.fetchStaff()
      } catch (error) {
        console.error('Toggle staff error:', error)
        this.error = friendlyError(error, 'Unable to update staff status.')
        throw error
      }
    },

    async relatedDocs(member) {
      try {
        const username = (member.githubUsername || '').toLowerCase()
        const docs = []
        if (username) {
          const [inviteDoc, staffQuery] = await Promise.all([
            getDoc(doc(db, 'staff_invites', username)).catch(() => null),
            getDocs(
              query(collection(db, 'staff'), where('githubUsername', '==', username))
            ).catch(() => ({ docs: [] }))
          ])
          if (inviteDoc && inviteDoc.exists?.()) {
            docs.push({ id: inviteDoc.id, source: 'invite', ...inviteDoc.data() })
          }
          for (const d of staffQuery.docs || []) {
            docs.push({ id: d.id, source: 'staff', ...d.data() })
          }
        }
        // Always include the displayed doc.
        if (!docs.some((d) => d.id === member.id)) {
          docs.push({ id: member.id, source: member.source || 'staff', ...member })
        }
        // Include by UID match as well (canonical doc).
        if (member.uid && !docs.some((d) => d.id === member.uid)) {
          try {
            const u = await getDoc(doc(db, 'staff', member.uid))
            if (u.exists()) docs.push({ id: u.id, source: 'staff', ...u.data() })
          } catch {
            // ignore
          }
        }
        return docs
      } catch {
        return [{ id: member.id, source: member.source || 'staff', ...member }]
      }
    },

    async removeStaff(member) {
      if (member.role === 'superadmin') {
        throw new Error('Superadmin accounts cannot be removed.')
      }
      try {
        const targets = await this.relatedDocs(member)
        for (const t of targets) {
          if (t.role === 'superadmin') continue
          if (t.source === 'invite') {
            await deleteDoc(doc(db, 'staff_invites', t.id))
          } else {
            await deleteDoc(doc(db, 'staff', t.id))
          }
        }
        if (!targets.length) {
          if (member.source === 'invite') {
            await deleteDoc(doc(db, 'staff_invites', member.id))
          } else {
            await deleteDoc(doc(db, 'staff', member.id))
          }
        }
        await this.fetchStaff()
      } catch (error) {
        console.error('Remove staff error:', error)
        this.error = friendlyError(error, 'Unable to remove staff account.')
        throw error
      }
    }
  }
})
