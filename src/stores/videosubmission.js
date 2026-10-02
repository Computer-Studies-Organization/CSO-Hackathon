import { defineStore } from 'pinia'
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase/config'
import { TRANSCODE_MAX_BYTES } from '@/utils/videoLimits'

const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024 // 1GB

const fmtMB = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`

// One submit at a time — module scope keeps the AbortController and the
// (lazily loaded) ffmpeg canceller out of reactive store state.
let activeAbort = null
let cancelTranscoder = null

export const useVideoSubmissionStore = defineStore('videoSubmission', {
  state: () => ({
    submission: null,
    submissions: [],
    isSubmitting: false,
    isLoading: false,
    error: null,
    // { stage: 'transcode'|'upload', percent: 0..1|null, detail?: string }
    progress: null,
    // human note about what was actually uploaded (compressed / as-is)
    note: null,
  }),

  actions: {
    // Abort the in-flight submit (kills the ffmpeg worker + every fetch).
    cancelSubmit() {
      if (!this.isSubmitting) return
      cancelTranscoder?.()
      activeAbort?.abort()
    },

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

    // Upload video → reduce it in the browser (ffmpeg.wasm) → Cloudflare R2
    // (presigned PUT) → save metadata to Firestore.
    //
    // Flow:
    //   0. transcode to 1080p/CRF23 (files ≤ TRANSCODE_MAX_BYTES) so the
    //      public object is small; the untouched source is kept beside it at
    //      `{key}.original` when the source actually shrank
    //   1. POST {workerUrl}/presign with Firebase ID token
    //   2. PUT bytes → returned uploadUrl (Content-Type signed)
    //   3. setDoc video_submissions/{uid} with publicUrl + r2Key
    //
    // repoSubmission = submissions/{uid}
    async submitVideo(user, formPayload, workerUrl, repoSubmission) {
      this.isSubmitting = true
      this.error = null
      this.progress = null
      this.note = null
      activeAbort = new AbortController()
      const signal = activeAbort.signal

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
          throw new Error('Video file size must be 1GB or less.')
        }

        // --------------------------------------------------
        // 0. Reduce (browser, ffmpeg.wasm) — never blocks the submit:
        //    any failure falls back to uploading the source file.
        // --------------------------------------------------
        let uploadFile = videoFile
        let uploadContentType = videoFile.type
        let reducedBlob = null
        let reduceNote = null

        if (videoFile.size <= TRANSCODE_MAX_BYTES) {
          this.progress = { stage: 'transcode', percent: null, detail: 'Loading encoder…' }
          try {
            const { transcodeVideo, terminateTranscoder } = await import('@/utils/transcode')
            cancelTranscoder = terminateTranscoder

            const blob = await transcodeVideo(videoFile, {
              signal,
              onProgress: (percent) => {
                this.progress = {
                  stage: 'transcode',
                  percent,
                  detail: 'Compressing video in your browser…',
                }
              },
            })

            if (blob.size < videoFile.size) {
              reducedBlob = blob
              uploadFile = blob
              uploadContentType = 'video/mp4'
              reduceNote = `Compressed ${fmtMB(videoFile.size)} → ${fmtMB(blob.size)} (original file kept).`
            } else {
              reduceNote = 'Video was already compact — uploaded as-is.'
            }
          } catch (err) {
            if (signal.aborted || err?.name === 'AbortError') {
              throw new Error('Upload cancelled.')
            }
            console.warn('Browser compression failed, uploading the original file:', err)
            reduceNote = 'Compression unavailable — uploaded the original file.'
          } finally {
            cancelTranscoder = null
          }
        } else {
          reduceNote = 'Large file — uploaded as-is (will be compressed by the organizers).'
        }

        if (signal.aborted) throw new Error('Upload cancelled.')

        // --------------------------------------------------
        // 1. Request presigned PUT URL(s) from Worker
        // --------------------------------------------------
        this.progress = { stage: 'upload', percent: null, detail: 'Preparing upload…' }

        const idToken = await user.getIdToken()

        const presignRes = await fetch(`${workerUrl.replace(/\/$/, '')}/presign`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          signal,
          body: JSON.stringify({
            contentType: videoFile.type,
            size: uploadFile.size,
            originalSize: videoFile.size,
            reduce: !!reducedBlob,
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

        const { uploadUrl, key, publicUrl, originalKey, originalUploadUrl } = presignData || {}
        if (!uploadUrl || !key || !publicUrl) {
          throw new Error('Upload service returned an invalid response.')
        }
        if (reducedBlob && !originalUploadUrl) {
          throw new Error('Upload service did not return an original-file slot.')
        }

        // --------------------------------------------------
        // 2. PUT bytes → R2 (direct, Content-Type signed)
        // --------------------------------------------------
        this.progress = {
          stage: 'upload',
          percent: null,
          detail: reducedBlob ? 'Uploading compressed video…' : 'Uploading video…',
        }

        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': uploadContentType,
          },
          signal,
          body: uploadFile,
        })

        if (!putRes.ok) {
          throw new Error(`Video upload failed (${putRes.status}). Please try again.`)
        }

        // 2b. Keep the untouched source at {key}.original
        if (reducedBlob) {
          const putOriginalRes = await fetch(originalUploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': videoFile.type,
            },
            signal,
            body: videoFile,
          })

          if (!putOriginalRes.ok) {
            throw new Error(
              `The compressed video uploaded, but keeping the original failed (${putOriginalRes.status}). Please try again.`,
            )
          }
        }

        if (signal.aborted) throw new Error('Upload cancelled.')

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

          // Video data (Cloudflare R2 via Worker) — videoUrl/r2Key always
          // point at the SMALL file; the source sits at r2OriginalKey.
          videoUrl: publicUrl,
          r2Key: key,
          contentType: uploadContentType,
          sizeBytes: uploadFile.size,
          ...(reducedBlob ? { r2OriginalKey: originalKey, sizeBytesOriginal: videoFile.size } : {}),

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

        this.note = reduceNote
        return this.submission
      } catch (err) {
        console.error('Submit video error:', err)

        this.error = err.message || 'Unable to submit video.'

        throw err
      } finally {
        this.isSubmitting = false
        this.progress = null
        cancelTranscoder = null
        activeAbort = null
      }
    },
  },
})
