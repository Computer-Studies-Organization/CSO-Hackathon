import { defineStore } from 'pinia'
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase/config'

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024 // 100MB

export const useVideoSubmissionStore = defineStore('videoSubmission', {
  state: () => ({
    submission: null,
    submissions: [],
    isSubmitting: false,
    isLoading: false,
    error: null,
  }),

  actions: {
    // Check if the current user has already submitted a video
    async fetchMine(user) {
      if (!user) return null

      this.error = null

      try {
        const docRef = doc(db, 'video_submissions', user.uid)
        const docSnap = await getDoc(docRef)

        if (docSnap.exists()) {
          this.submission = {
            id: docSnap.id,
            ...docSnap.data(),
          }

          return this.submission
        }

        this.submission = null
        return null
      } catch (err) {
        console.error('Fetch my video submission error:', err)

        this.error = err.message || 'Unable to load your video submission.'

        throw err
      }
    },

    // Judges/Admin/Superadmin: list all video submissions for judging
    async fetchAll() {
      this.isLoading = true
      this.error = null

      try {
        const snapshot = await getDocs(collection(db, 'video_submissions'))

        this.submissions = snapshot.docs
          .map((d) => ({
            id: d.id,
            ...d.data(),
          }))
          .sort((a, b) => {
            const ta = a.submittedAt?.toMillis?.() ?? 0
            const tb = b.submittedAt?.toMillis?.() ?? 0

            return tb - ta
          })

        return this.submissions
      } catch (err) {
        console.error('Fetch video submissions error:', err)

        this.error = err.message || 'Unable to load video submissions.'

        throw err
      } finally {
        this.isLoading = false
      }
    },

    // Upload video → Cloudflare R2 (presigned PUT) → save metadata to Firestore.
    //
    // Flow:
    //   1. POST {workerUrl}/presign with Firebase ID token
    //   2. PUT raw File to returned uploadUrl (Content-Type signed)
    //   3. setDoc video_submissions/{uid} with publicUrl + r2Key
    //
    // repoSubmission = submissions/{uid}
    async submitVideo(user, formPayload, workerUrl, repoSubmission) {
      this.isSubmitting = true
      this.error = null

      try {
        if (!user) {
          throw new Error('You must be logged in before submitting a video.')
        }

        if (!repoSubmission) {
          throw new Error('Submit your repository first before uploading a video.')
        }

        if (!workerUrl) {
          throw new Error('Video upload is not configured. Set VITE_VIDEO_WORKER_URL in .env.')
        }

        const videoFile = formPayload?.videoFile

        if (!videoFile) {
          throw new Error('Please select a video file.')
        }

        if (!videoFile.type.startsWith('video/')) {
          throw new Error('The selected file must be a video.')
        }

        if (videoFile.size > MAX_UPLOAD_BYTES) {
          throw new Error('Video file size must be 100MB or less.')
        }

        // --------------------------------------------------
        // 1. Request presigned PUT URL from Worker
        // --------------------------------------------------
        const idToken = await user.getIdToken()

        const presignRes = await fetch(`${workerUrl.replace(/\/$/, '')}/presign`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contentType: videoFile.type,
            size: videoFile.size,
            filename: videoFile.name,
          }),
        })

        let presignData = null
        try {
          presignData = await presignRes.json()
        } catch {
          // fall through to status error
        }

        if (!presignRes.ok) {
          throw new Error(presignData?.error || `Could not prepare upload (${presignRes.status}).`)
        }

        const { uploadUrl, key, publicUrl } = presignData || {}
        if (!uploadUrl || !key || !publicUrl) {
          throw new Error('Upload service returned an invalid response.')
        }

        // --------------------------------------------------
        // 2. PUT file bytes → R2 (direct, Content-Type signed)
        // --------------------------------------------------
        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': videoFile.type,
          },
          body: videoFile,
        })

        if (!putRes.ok) {
          throw new Error(`Video upload failed (${putRes.status}). Please try again.`)
        }

        // --------------------------------------------------
        // 3. Prepare Firestore document
        // --------------------------------------------------
        const groupName = String(repoSubmission.groupName || '').trim() || 'Untitled Group'

        const description = String(repoSubmission.description || '').trim()

        const githubUsername =
          user.reloadUserInfo?.screenName ||
          repoSubmission.githubUsername ||
          user.displayName ||
          'Unknown'

        const members = Array.isArray(repoSubmission.members)
          ? repoSubmission.members
          : (repoSubmission.membersName || '')
              .split(',')
              .map((member) => member.trim())
              .filter(Boolean)

        const submissionData = {
          userId: user.uid,

          groupName,
          description,

          projectName: repoSubmission.projectName || '',

          members,

          membersName: repoSubmission.membersName || members.join(', '),

          repositoryUrl: repoSubmission.repositoryUrl || '',

          techStack: repoSubmission.techStack || '',

          // Video data (Cloudflare R2 via Worker)
          videoUrl: publicUrl,
          r2Key: key,
          contentType: videoFile.type,
          sizeBytes: videoFile.size,

          githubUsername,

          email: user.email || repoSubmission.email || '',

          submittedAt: serverTimestamp(),
        }

        const docRef = doc(db, 'video_submissions', user.uid)

        await setDoc(docRef, submissionData)

        this.submission = {
          id: user.uid,
          ...submissionData,
        }

        return this.submission
      } catch (err) {
        console.error('Submit video error:', err)

        this.error = err.message || 'Unable to submit video.'

        throw err
      } finally {
        this.isSubmitting = false
      }
    },
  },
})
