import { defineStore } from 'pinia'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc
} from 'firebase/firestore'

import { db } from '@/firebase/config'

// Verify via GitHub API that the repository exists and is public.
// Throws with a user-friendly message when it does not.
// Error codes: INVALID, NOT_FOUND, PRIVATE, RATE_LIMITED, NETWORK, UNKNOWN.
// RATE_LIMITED/NETWORK are non-blocking — the submission goes through
// flagged unverified and judges confirm via the repo link (school
// networks share one public IP, so the 60/hr unauthenticated quota
// exhausts fast).
async function verifyRepositoryExists(owner, repo) {
  if (!owner || !repo) {
    const err = new Error('Please provide a valid GitHub repository URL.')
    err.code = 'INVALID'
    throw err
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
    const err = new Error(
      'Could not verify the repository. Check your connection and try again.'
    )
    err.code = 'NETWORK'
    throw err
  }

  if (response.status === 404) {
    const err = new Error(
      'Repository not found. Make sure the URL is correct and the repository is public.'
    )
    err.code = 'NOT_FOUND'
    throw err
  }

  if (response.status === 403) {
    const err = new Error(
      'Repository verification is rate-limited right now. Please wait a minute and try again.'
    )
    err.code = 'RATE_LIMITED'
    throw err
  }

  if (!response.ok) {
    const err = new Error('Could not verify the repository. Please try again.')
    err.code = 'UNKNOWN'
    throw err
  }

  const data = await response.json()

  if (data.private) {
    const err = new Error('Repository must be public so judges can review it.')
    err.code = 'PRIVATE'
    throw err
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
    async fetchMine(user) {
      if (!user) {
        this.submission = null
        return null
      }
      try {
        const snap = await getDoc(doc(db, 'submissions', user.uid))
        this.submission = snap.exists() ? { id: snap.id, ...snap.data() } : null
        return this.submission
      } catch (error) {
        console.error('Fetch own submission error:', error)
        throw error
      }
    },
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

        // Verify the repository exists and is publicly accessible.
        // Rate-limit/network failures are non-blocking (school networks
        // share one public IP, so the 60/hr quota exhausts fast) — the
        // submission goes through flagged unverified and judges confirm
        // via the repo link. Definitive failures (not-found/private/bad
        // URL) still block here.
        const [, owner, repo] =
          form.repositoryUrl
            .trim()
            .replace(/\/$/, '')
            .match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/) || []

        let repoVerified = false
        let repoCheckNote = ''
        try {
          await verifyRepositoryExists(owner, repo)
          repoVerified = true
          repoCheckNote = 'Pre-check passed (client-side).'
        } catch (precheckError) {
          if (
            precheckError?.code === 'RATE_LIMITED' ||
            precheckError?.code === 'NETWORK'
          ) {
            console.warn(
              'Repo pre-check skipped, judges verify via link:',
              precheckError
            )
            repoCheckNote =
              'Pre-check skipped (rate-limited); verify link manually.'
          } else {
            throw precheckError
          }
        }

        // One submission per user: doc ID = Firebase Auth UID.
        // Second submit fails (doc already exists) both client-side
        // (check below) and server-side (rules: create only + docId == uid).
        const submissionsRef = collection(db, 'submissions')
        const ownRef = doc(submissionsRef, user.uid)
        const ownSnap = await getDoc(ownRef)

        if (ownSnap.exists()) {
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

        // Save submission (doc ID = UID enforces one-per-user).
        await setDoc(ownRef, {
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
          // Client-side pre-check result only (Spark: no server trigger).
          // Judges confirm via the repo link for unverified entries.
          repoVerified,
          repoCheckNote,
          techStack: form.techStack.trim(),
          submittedAt: serverTimestamp(),

        })

        this.submission = {
          id: user.uid,
          userId: user.uid,
          ...form
        }

        this.success = true

        return this.submission
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