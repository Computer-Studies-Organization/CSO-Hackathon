import { defineStore } from 'pinia'
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'firebase/auth'
import {
  doc,
  getDoc
} from 'firebase/firestore'

import { auth, githubProvider, db } from '@/firebase/config'

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

        await this.fetchRole()

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

    async fetchRole() {
      this.role = null

      if (!this.user) {
        return null
      }

      try {
        const staffRef = doc(
          db,
          'staff',
          this.user.uid
        )

        const snapshot = await getDoc(staffRef)

        if (!snapshot.exists()) {
          console.warn(
            'No staff document found for:',
            this.user.uid
          )

          return null
        }

        const data = snapshot.data()

        // Inactive staff cannot access the panel
        if (data.active === false) {
          console.warn('Staff account is inactive.')

          return null
        }

        // Fail closed for invalid roles
        if (
          !['superadmin', 'admin', 'staff'].includes(data.role)
        ) {
          console.warn(
            'Invalid staff role:',
            data.role
          )

          return null
        }

        this.role = data.role

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