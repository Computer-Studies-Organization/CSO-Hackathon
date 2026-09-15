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

// Verify via GitHub API that the repository exists and is public.
// Throws with a user-friendly message when it does not.
async function verifyRepositoryExists(owner, repo) {
  if (!owner || !repo) {
    throw new Error('Please provide a valid GitHub repository URL.')
  }

  let response
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal
      }
    )
    clearTimeout(timeout)
  } catch {
    throw new Error(
      'Could not verify the repository. Check your connection and try again.'
    )
  }

  if (response.status === 404) {
    throw new Error(
      'Repository not found. Make sure the URL is correct and the repository is public.'
    )
  }

  if (response.status === 403) {
    throw new Error(
      'Repository verification is rate-limited right now. Please wait a minute and try again.'
    )
  }

  if (!response.ok) {
    throw new Error('Could not verify the repository. Please try again.')
  }

  const data = await response.json()

  if (data.private) {
    throw new Error('Repository must be public so judges can review it.')
  }
}

export const useSubmissionStore = defineStore('submission', {
  state: () => ({
    submission: null,
    submissions: [],
    isSubmitting: false,
    isLoading: false,
    error: null,
    success: false
  }),

  actions: {
    async fetchAll() {
      this.isLoading = true
      this.error = null

      try {
        const submissionsRef = collection(db, 'submissions')
        const snapshot = await getDocs(submissionsRef)

        this.submissions = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .sort((a, b) => {
            const ta = a.submittedAt?.toMillis?.() ?? 0
            const tb = b.submittedAt?.toMillis?.() ?? 0
            return tb - ta
          })

        return this.submissions
      } catch (error) {
        console.error('Fetch submissions error:', error)
        this.error = error.message || 'Unable to load submissions.'
        throw error
      } finally {
        this.isLoading = false
      }
    },
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

        // Verify the repository exists and is publicly accessible
        const [, owner, repo] =
          form.repositoryUrl
            .trim()
            .replace(/\/$/, '')
            .match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/) || []

        await verifyRepositoryExists(owner, repo)

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

        // Members: array preferred, comma string accepted (legacy form)
        const members = Array.isArray(form.members)
          ? form.members.map((m) => String(m).trim()).filter(Boolean)
          : String(form.membersName || '')
              .split(',')
              .map((m) => m.trim())
              .filter(Boolean)

        if (!members.length) {
          throw new Error('Please add at least one team member.')
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

          groupName: form.groupName.trim(),
          projectName: (form.projectName || '').trim(),
          members,
          membersName: members.join(', '),
          description: form.description.trim(),
          repositoryUrl: form.repositoryUrl.trim(),
          repoVerified: true,
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