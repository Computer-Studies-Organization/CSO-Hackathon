import { defineStore } from 'pinia'
import {
  signInWithPopup,
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
  getDocs,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore'

import { auth, githubProvider, db } from '@/firebase/config'

const VALID_ROLES = ['superadmin', 'admin', 'staff']

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

    isStaff: (state) =>
      state.user != null &&
      ['superadmin', 'admin', 'staff'].includes(state.role),

    canAccessPanel() {
      return this.isAuthenticated && this.isStaff
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
      return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
          this.user = user

          if (!user) {
            this.role = null
            this.githubUsernameValue = null
            this.initialized = true

            resolve(null)
            return
          }

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

      const githubUsername =
        extractGithubUsername(
          this.user,
          usernameOverride
        )

      this.githubUsernameValue = githubUsername

      if (!githubUsername) {
        console.warn(
          'GitHub username unavailable.'
        )

        return null
      }

      try {
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
          // console.warn(
          //   `No active staff account found for @${githubUsername}`
          // )

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

        try {
          await updateDoc(
            staffDoc.ref,
            {
              lastLoginAt:
                serverTimestamp()
            }
          )
        } catch (error) {
          console.warn(
            'Unable to update lastLoginAt:',
            error
          )
        }

        // Link a canonical UID doc (staff/{uid}) so firestore.rules
        // isStaff()/isAdmin() — which resolve via UID doc — recognize
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