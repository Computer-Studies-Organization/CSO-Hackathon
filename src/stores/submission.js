import { defineStore } from 'pinia'
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs
} from 'firebase/firestore'

import { db } from '@/firebase/config'

export const useSubmissionStore = defineStore('submission', {
  state: () => ({
    submission: null,
    isSubmitting: false,
    error: null,
    success: false
  }),

  actions: {
    async submitProject(user, form) {
      this.isSubmitting = true
      this.error = null
      this.success = false

      try {
        if (!user) {
          throw new Error('You must be signed in to submit a project.')
        }

        // Basic GitHub repository validation
        const githubRepoPattern =
          /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/

        if (!githubRepoPattern.test(form.repositoryUrl)) {
          throw new Error(
            'Please provide a valid GitHub repository URL.'
          )
        }

        // Check if this user already submitted
        const submissionsRef = collection(db, 'submissions')

        const existingQuery = query(
          submissionsRef,
          where('userId', '==', user.uid)
        )

        const existingSnapshot = await getDocs(existingQuery)

        if (!existingSnapshot.empty) {
          throw new Error(
            'You have already submitted a project.'
          )
        }

        // Save submission
        const docRef = await addDoc(submissionsRef, {
          userId: user.uid,

          githubUsername:
            user.reloadUserInfo?.screenName ||
            user.displayName ||
            null,

          githubUserId:
            user.providerData?.find(
              provider => provider.providerId === 'github.com'
            )?.uid || null,

          projectName: form.projectName.trim(),
          description: form.description.trim(),
          repositoryUrl: form.repositoryUrl.trim(),
          techStack: form.techStack.trim(),
          submittedAt: serverTimestamp(),

        })

        this.submission = {
          id: docRef.id,
          ...form
        }

        this.success = true

        return docRef
      } catch (error) {
        console.error('Submission error:', error)

        this.error =
          error.message ||
          'Something went wrong while submitting your project.'

        throw error
      } finally {
        this.isSubmitting = false
      }
    }
  }
})