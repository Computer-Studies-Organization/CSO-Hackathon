import { defineStore } from 'pinia'
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
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
      } catch (error) {
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

      // Roles resolve solely from the `staff` collection in Firestore.
      // The first superadmin must be created manually via Firebase
      // Console (document ID = Firebase Auth UID, role = 'superadmin').
      try {
        let data = null

        // 1. Staff document with ID = UID
        const byId = await getDoc(doc(db, 'staff', this.user.uid))
        if (byId.exists()) {
          data = byId.data()
        }

        // 2. Fallback: staff created via UI (auto-ID documents),
        // matched by uid field or GitHub username
        if (!data) {
          let snap = await getDocs(
            query(collection(db, 'staff'), where('uid', '==', this.user.uid))
          )
          let match = snap.docs.find((d) => d.data().active !== false)

          if (!match && this.githubUsername) {
            snap = await getDocs(
              query(
                collection(db, 'staff'),
                where('githubUsername', '==', this.githubUsername.toLowerCase())
              )
            )
            match = snap.docs.find((d) => d.data().active !== false)
          }

          if (match) data = match.data()
        }

        if (!data) {
          return null
        }

        // Inactive staff cannot access the panel
        if (data.active === false) {
          return null
        }

        // Keep the raw role so superadmin/admin/staff stay distinct.
        // Unknown values grant nothing (fail-closed).
        this.role = ['superadmin', 'admin', 'staff'].includes(data.role)
          ? data.role
          : null


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

        default:
          return 'Unable to sign in with GitHub. Please try again.'
      }
    }
  }
})