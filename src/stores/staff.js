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
        // Only admin/staff can be created via UI.
        // Superadmin is assigned manually (console/allowlist).
        if (!['admin', 'staff'].includes(role)) {
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
          throw new Error(`@${username} is already in the staff list.`)
        }

        await setDoc(doc(db, 'staff_invites', key), {
          githubUsername: key,
          displayName: username,
          role,
          active: true,
          createdBy: adminUser?.uid || null,
          createdAt: serverTimestamp()
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
          uid: null,
          createdBy: adminUser?.uid || null,
          createdAt: serverTimestamp(),
          mirrorOf: `staff_invites/${key}`
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

    // One-time migration (both directions, run as admin):
    // 1) legacy random-ID invites in `staff` (uid: null) -> staff_invites.
    // 2) staff_invites without a `staff` mirror -> create the mirror so
    //    the login username-query can find them.
    async migrateLegacyInvites() {
      const snap = await getDocs(collection(db, 'staff'))
      let migrated = 0
      for (const d of snap.docs) {
        const data = d.data()
        const username = (data.githubUsername || '').toLowerCase()
        if (!username || data.uid != null) continue
        if (d.id === data.uid) continue
        if (!['admin', 'staff'].includes(data.role)) continue
        const inviteRef = doc(db, 'staff_invites', username)
        const existing = await getDoc(inviteRef).catch(() => null)
        if (existing && existing.exists?.()) continue
        await setDoc(inviteRef, {
          githubUsername: username,
          displayName: data.displayName || username,
          role: data.role,
          active: data.active !== false,
          createdBy: data.createdBy || null,
          createdAt: data.createdAt || serverTimestamp(),
          migratedFrom: d.id,
          migratedAt: serverTimestamp()
        })
        migrated += 1
      }
      const inviteSnap = await getDocs(collection(db, 'staff_invites')).catch(() => ({
        docs: []
      }))
      for (const d of inviteSnap.docs || []) {
        const data = d.data()
        const username = (data.githubUsername || d.id || '').toLowerCase()
        if (!username || !['admin', 'staff'].includes(data.role)) continue
        const existing = await getDocs(
          query(collection(db, 'staff'), where('githubUsername', '==', username))
        ).catch(() => ({ empty: true }))
        if (!existing.empty) continue
        await addDoc(collection(db, 'staff'), {
          githubUsername: username,
          displayName: data.displayName || username,
          role: data.role,
          active: data.active !== false,
          uid: null,
          createdBy: data.createdBy || null,
          createdAt: data.createdAt || serverTimestamp(),
          mirrorOf: `staff_invites/${username}`
        })
        migrated += 1
      }
      await this.fetchStaff()
      return migrated
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
