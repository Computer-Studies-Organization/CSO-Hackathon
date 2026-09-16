import { defineStore } from 'pinia'
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  getAdditionalUserInfo
} from 'firebase/auth'
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore'

import { auth, githubProvider, db } from '@/firebase/config'

const VALID_ROLES = ['superadmin', 'admin', 'staff']

function extractGithubUsername(user, override) {
  if (override) {
    const v = String(override).trim().replace(/^@/, '').toLowerCase()
    return v || null
  }
  const screen = user?.reloadUserInfo?.screenName
  if (screen) {
    return String(screen).trim().replace(/^@/, '').toLowerCase() || null
  }
  return null
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    role: null,
    isLoading: false,
    initialized: false,
    error: null
  }),

  getters: {
    isAuthenticated: (state) => !!state.user,

    isSuperadmin: (state) =>
      state.user != null &&
      state.role === 'superadmin',

    isAdmin: (state) =>
      state.user != null &&
      ['superadmin', 'admin'].includes(state.role),

    isStaff: (state) =>
      state.user != null &&
      ['superadmin', 'admin', 'staff'].includes(state.role),

    canAccessPanel() {
      return this.isAuthenticated && this.isStaff
    },

    githubUsername: (state) =>
      state.user?.reloadUserInfo?.screenName || null
  },

  actions: {
    async loginWithGithub() {
      this.isLoading = true
      this.error = null

      try {
        const result = await signInWithPopup(
          auth,
          githubProvider
        )

        this.user = result.user

        // GitHub username is most reliable from the sign-in result.
        // reloadUserInfo.screenName is used as fallback on reload.
        let extraUsername = null
        try {
          extraUsername =
            getAdditionalUserInfo(result)?.username ||
            result?._tokenResponse?.screenName ||
            null
        } catch {
          extraUsername = null
        }

        await this.fetchRole(extraUsername)

        return result.user
      } catch (error) {
        console.error('Login failed:', error)

        this.error = this.getFirebaseErrorMessage(error)

        throw error
      } finally {
        this.isLoading = false
      }
    },

    async logout() {
      try {
        await signOut(auth)

        this.user = null
        this.role = null
        this.error = null
      } catch (error) {
        console.error('Logout failed:', error)

        this.error = 'Unable to sign out.'
      }
    },

    initializeAuth() {
      return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
          this.user = user

          await this.fetchRole()

          this.initialized = true

          resolve(user)
        })
      })
    },

    async fetchRole(usernameOverride) {
      this.role = null

      if (!this.user) {
        return null
      }

      // 1) Canonical lookup: staff document ID = Firebase Auth UID.
      try {
        const staffRef = doc(
          db,
          'staff',
          this.user.uid
        )

        const snapshot = await getDoc(staffRef)

        if (snapshot.exists()) {
          const data = snapshot.data()

          // Inactive staff cannot access the panel
          if (data.active === false) {
            console.warn('Staff account is inactive.')

            return null
          }

          // Fail closed for invalid roles
          if (!VALID_ROLES.includes(data.role)) {
            console.warn(
              'Invalid staff role:',
              data.role
            )

            return null
          }

          this.role = data.role

          // Best-effort presence update (may fail if rules disallow).
          try {
            await updateDoc(staffRef, { lastLoginAt: serverTimestamp() })
          } catch {
            // ignore — role is already resolved
          }

          return this.role
        }
      } catch (error) {
        console.error('Fetch role error:', error)

        this.role = null

        return null
      }

      // 2) Fallback: invite created via Add Staff uses a random doc ID
      // with { githubUsername, uid: null }. Link it on first login.
      const githubUsername = extractGithubUsername(this.user, usernameOverride)

      if (!githubUsername) {
        console.warn(
          'No staff document found for:',
          this.user.uid,
          '(GitHub username unavailable)'
        )

        return null
      }

      try {
        const staffRef = collection(db, 'staff')
        const inviteQuery = query(
          staffRef,
          where('githubUsername', '==', githubUsername)
        )
        const inviteSnap = await getDocs(inviteQuery)

        if (inviteSnap.empty) {
          console.warn(
            'No staff document found for:',
            this.user.uid,
            `(@${githubUsername} not in staff list)`
          )

          return null
        }

        // Prefer unclaimed invite, or one already linked to this UID.
        const candidates = inviteSnap.docs
          .map((d) => ({ ref: d.ref, id: d.id, ...d.data() }))
          .filter((d) => d.active !== false && VALID_ROLES.includes(d.role))
          .filter((d) => d.uid == null || d.uid === this.user.uid)

        if (!candidates.length) {
          console.warn('Staff account is inactive.')

          return null
        }

        const invite = candidates[0]

        // Optimistic role so the panel opens even if linking hits rules.
        this.role = invite.role

        // 3) Create canonical UID doc so firestore.rules
        // (which resolves admin via staff/{uid}) recognizes the user.
        // Self-registration is restricted to `staff` in rules to prevent
        // privilege escalation — an existing admin upgrades to `admin`.
        const uidRef = doc(db, 'staff', this.user.uid)
        let requestedRole = invite.role
        const tryLink = async (roleToWrite) => {
          await setDoc(
            uidRef,
            {
              githubUsername,
              displayName: invite.displayName || githubUsername,
              role: roleToWrite,
              active: true,
              uid: this.user.uid,
              createdBy: invite.createdBy || null,
              createdAt: invite.createdAt || serverTimestamp(),
              linkedFrom: invite.id,
              linkedAt: serverTimestamp(),
              lastLoginAt: serverTimestamp()
            },
            { merge: true }
          )
        }

        try {
          await tryLink(requestedRole)
        } catch (linkError) {
          // If rules only allow self-claim as `staff`, retry as staff.
          // The invite stays as `admin` so an admin can upgrade later.
          if (requestedRole === 'admin' && linkError?.code === 'permission-denied') {
            try {
              await tryLink('staff')
              this.role = 'staff'
              console.warn(
                `Invite @${githubUsername} is admin; claimed as staff. Ask an existing admin to upgrade to admin in Accounts.`
              )
            } catch (retryError) {
              console.warn('UID link failed (will retry next login):', retryError)
            }
          } else {
            console.warn('UID link failed (will retry next login):', linkError)
          }
        }

        // 4) Mark the invite as claimed (best-effort).
        try {
          await updateDoc(invite.ref, {
            uid: this.user.uid,
            linkedUid: this.user.uid,
            claimedAt: serverTimestamp()
          })
        } catch {
          // ignore — UID doc is the source of truth
        }

        return this.role
      } catch (error) {
        console.error('Fetch role error:', error)

        this.role = null

        return null
      }
    },

    getFirebaseErrorMessage(error) {
      switch (error.code) {
        case 'auth/popup-closed-by-user':
          return 'The GitHub sign-in window was closed.'

        case 'auth/popup-blocked':
          return 'Your browser blocked the sign-in popup.'

        case 'auth/account-exists-with-different-credential':
          return 'An account already exists with another sign-in method.'

        case 'auth/cancelled-popup-request':
          return 'The sign-in request was cancelled.'

        case 'auth/unauthorized-domain':
          return 'This domain is not authorized for Firebase Authentication.'

        default:
          return 'Unable to sign in with GitHub. Please try again.'
      }
    }
  }
})