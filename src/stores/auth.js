import { defineStore } from 'pinia'
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'firebase/auth'

import { auth, githubProvider } from '@/firebase/config'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    isLoading: false,
    initialized: false,
    error: null
  }),

  getters: {
    isAuthenticated: (state) => !!state.user,

    githubUsername: (state) => {
      return state.user?.reloadUserInfo?.screenName || null
    }
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

        // console.log('Logged in user:', result.user)

        return result.user
      } catch (error) {
        // console.error('GitHub login error:', error)

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
      } catch (error) {
        // console.error('Logout error:', error)

        this.error = 'Unable to sign out.'
      }
    },

    initializeAuth() {
      return new Promise((resolve) => {
        onAuthStateChanged(auth, (user) => {
          this.user = user
          this.initialized = true

          resolve(user)
        })
      })
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

        default:
          return 'Unable to sign in with GitHub. Please try again.'
      }
    }
  }
})