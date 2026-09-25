import { defineStore } from 'pinia'
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getAdditionalUserInfo
} from 'firebase/auth'

import {
  collection,
  doc,
  query,
  setDoc,
  where,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore'

import { auth, githubProvider, db } from '@/firebase/config'

const VALID_ROLES = ['superadmin', 'admin', 'judge']

function extractGithubUsername(user, override) {
  if (override) {
    const v = String(override)
      .trim()
      .replace(/^@/, '')
      .toLowerCase()

    return v || null
  }

  const screen = user?.reloadUserInfo?.screenName

  if (screen) {
    return String(screen)
      .trim()
      .replace(/^@/, '')
      .toLowerCase() || null
  }

  return null
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    role: null,
    githubUsernameValue: null,
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

    isJudge: (state) =>
      state.user != null &&
      state.role === 'judge',

    // /admin is superadmin + admin only. The old `staff` role no longer
    // exists — judges get their own panel at /judges.
    canAccessPanel() {
      return this.isAuthenticated && this.isAdmin
    },

    // /judges is judges only.
    canAccessJudges() {
      return this.isAuthenticated && this.isJudge
    },

    githubUsername: (state) =>
      state.githubUsernameValue
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

        let extraUsername = null

        try {
          extraUsername =
            getAdditionalUserInfo(result)?.username ||
            result?._tokenResponse?.screenName ||
            null
        } catch {
          extraUsername = null
        }

        const githubUsername = extractGithubUsername(
          result.user,
          extraUsername
        )

        this.githubUsernameValue = githubUsername

        await this.fetchRole(githubUsername)

        return result.user

      } catch (error) {
        console.error('Login failed:', error)

        this.error =
          this.getFirebaseErrorMessage(error)

        throw error

      } finally {
        this.isLoading = false
      }
    },

    // Email + password sign-in for judges. No GitHub fallback — judges are
    // provisioned by an admin (Phase 3) and have no GitHub linkage.
    async loginJudge(email, password) {
      this.isLoading = true
      this.error = null

      try {
        const result = await signInWithEmailAndPassword(
          auth,
          String(email || '').trim(),
          password
        )

        this.user = result.user
        this.githubUsernameValue = null

        await this.fetchRole()

        return result.user

      } catch (error) {
        console.error('Judge login failed:', error)

        this.error =
          this.getFirebaseErrorMessage(error)

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
        this.githubUsernameValue = null
        this.error = null

      } catch (error) {
        console.error('Logout failed:', error)

        this.error = 'Unable to sign out.'
      }
    },

    initializeAuth() {
      if (this._initPromise) {
        return this._initPromise
      }

      this._initPromise = new Promise((resolve) => {
        let settled = false

        const finish = (value) => {
          if (settled) return
          settled = true
          this.initialized = true
          resolve(value)
        }

        const timer = setTimeout(() => finish(null), 8000)

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
            await this.fetchRole()
          } catch {
            // fetchRole already set this.error + role = null
          } finally {
            clearTimeout(timer)
            finish(user)
          }
        })
      })

      return this._initPromise
    },

    fetchRole(usernameOverride) {
      if (this._roleInflight) {
        return this._roleInflight
      }

      const run = this._fetchRole(usernameOverride)
      this._roleInflight = run.finally(() => {
        this._roleInflight = null
      })
      return this._roleInflight
    },

    async _fetchRole(usernameOverride) {
      this.role = null

      if (!this.user) {
        return null
      }

      const githubUsername =
        extractGithubUsername(
          this.user,
          usernameOverride
        )

      this.githubUsernameValue = githubUsername

      try {
        // 1) Canonical UID doc (staff/{uid}). This is the only lookup that
        //    resolves for email/password judges — they have no GitHub
        //    username — and it short-circuits admins who already linked.
        const uidRef = doc(
          db,
          'staff',
          this.user.uid
        )
        const uidDoc = await getDoc(uidRef)

        if (uidDoc.exists()) {
          const uidData = uidDoc.data()

          if (
            VALID_ROLES.includes(uidData.role) &&
            uidData.active !== false
          ) {
            this.role = uidData.role

            await this.touchLastLogin(uidRef)

            return this.role
          }
        }

        // 2) GitHub invite/mirror lookup — first sign-in only. The link
        //    step below creates staff/{uid}, so step 1 takes over after.
        if (!githubUsername) {
          return null
        }

        const staffQuery = query(
          collection(db, 'staff'),
          where(
            'githubUsername',
            '==',
            githubUsername
          ),
          where(
            'active',
            '==',
            true
          )
        )

        const snapshot =
          await getDocs(staffQuery)

        if (snapshot.empty) {
          return null
        }

        const staffDoc =
          snapshot.docs[0]

        const data =
          staffDoc.data()

        if (
          !VALID_ROLES.includes(data.role)
        ) {
          console.warn(
            'Invalid staff role:',
            data.role
          )

          return null
        }

        this.role = data.role

        await this.touchLastLogin(
          staffDoc.ref
        )

        // Link a canonical UID doc (staff/{uid}) so firestore.rules
        // isReviewer()/isAdmin() — which resolve via UID doc — recognize
        // this user (dashboard/submissions reads need it). Allowed only
        // when a matching active invite exists (role pinned to invite).
        // Best-effort: role is already resolved above.
        try {
          await setDoc(
            doc(db, 'staff', this.user.uid),
            {
              githubUsername,
              displayName: data.displayName || githubUsername,
              role: data.role,
              active: true,
              uid: this.user.uid,
              linkedFrom: staffDoc.id,
              linkedAt: serverTimestamp(),
              lastLoginAt: serverTimestamp()
            },
            { merge: true }
          )
        } catch (error) {
          console.warn(
            'Unable to link UID doc:',
            error
          )
        }

        return this.role

      } catch (error) {
        console.error('Fetch role error:', error)

        this.role = null
        this.error = error.message

        throw error
      }
    },

    // Presence touch on the caller's own staff doc. Rules allow this
    // for any signed-in user when it only affects `lastLoginAt`.
    async touchLastLogin(ref) {
      try {
        await updateDoc(ref, {
          lastLoginAt: serverTimestamp()
        })
      } catch (error) {
        console.warn(
          'Unable to update lastLoginAt:',
          error
        )
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

        case 'auth/invalid-email':
          return 'Please enter a valid email address.'

        case 'auth/missing-password':
          return 'Please enter your password.'

        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
          return 'Incorrect email or password.'

        case 'auth/user-disabled':
          return 'This account has been disabled. Contact the administrator.'

        case 'auth/too-many-requests':
          return 'Too many attempts. Please wait a moment and try again.'

        case 'auth/network-request-failed':
          return 'Network error. Check your connection and try again.'

        default:
          return 'Unable to sign in. Please try again.'
      }
    }
  }
})