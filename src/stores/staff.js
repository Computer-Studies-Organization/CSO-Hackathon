import { defineStore } from 'pinia'
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore'

import { db } from '@/firebase/config'

const GITHUB_USERNAME_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i

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
        const snapshot = await getDocs(collection(db, 'staff'))
        const all = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() ?? 0
            const tb = b.createdAt?.toMillis?.() ?? 0
            return tb - ta
          })
        // Dedupe by githubUsername: after first login there are 2 docs
        // (random-ID invite + canonical staff/{uid}). Prefer canonical.
        const byName = new Map()
        for (const item of all) {
          const key = (item.githubUsername || '').toLowerCase()
          if (!key) {
            byName.set(`id:${item.id}`, item)
            continue
          }
          const existing = byName.get(key)
          if (!existing) {
            byName.set(key, item)
          } else {
            const existingCanonical = existing.id === existing.uid
            const itemCanonical = item.id === item.uid
            if (itemCanonical && !existingCanonical) {
              byName.set(key, item)
            }
          }
        }
        this.staff = [...byName.values()].sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? 0
          const tb = b.createdAt?.toMillis?.() ?? 0
          return tb - ta
        })
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

        const staffRef = collection(db, 'staff')
        const existing = await getDocs(
          query(staffRef, where('githubUsername', '==', username.toLowerCase()))
        )
        if (!existing.empty) {
          throw new Error(`@${username} is already in the staff list.`)
        }

        const docRef = await addDoc(staffRef, {
          githubUsername: username.toLowerCase(),
          displayName: username,
          role,
          active: true,
          uid: null,
          createdBy: adminUser?.uid || null,
          createdAt: serverTimestamp()
        })

        await this.fetchStaff()
        return docRef
      } catch (error) {
        console.error('Add staff error:', error)
        this.error = friendlyError(error, 'Unable to add staff account.')
        throw error
      } finally {
        this.isSaving = false
      }
    },

    async toggleActive(member) {
      if (member.role === 'superadmin') {
        throw new Error('Superadmin accounts cannot be disabled.')
      }
      try {
        const nextActive = !(member.active !== false)
        // Apply to all docs with same githubUsername (invite + UID doc).
        const targets = await this.relatedDocs(member)
        for (const t of targets) {
          if (t.role === 'superadmin') continue
          await updateDoc(doc(db, 'staff', t.id), {
            active: nextActive
          })
        }
        // Fallback: at least update the displayed doc.
        if (!targets.length) {
          await updateDoc(doc(db, 'staff', member.id), {
            active: nextActive
          })
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
        if (!username) return [{ id: member.id, ...member }]
        const snap = await getDocs(
          query(collection(db, 'staff'), where('githubUsername', '==', username))
        )
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        // Always include the displayed doc (e.g. UID doc without username yet).
        if (!docs.some((d) => d.id === member.id)) docs.push({ id: member.id, ...member })
        // Include by UID match as well (canonical doc).
        if (member.uid && !docs.some((d) => d.id === member.uid)) {
          try {
            const u = await getDoc(doc(db, 'staff', member.uid))
            if (u.exists()) docs.push({ id: u.id, ...u.data() })
          } catch {
            // ignore
          }
        }
        return docs
      } catch {
        return [{ id: member.id, ...member }]
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
          await deleteDoc(doc(db, 'staff', t.id))
        }
        if (!targets.length) {
          await deleteDoc(doc(db, 'staff', member.id))
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
