import { defineStore } from 'pinia'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp
} from 'firebase/firestore'
import { db } from '@/firebase/config'

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
            ...docSnap.data()
          }

          return this.submission
        }

        this.submission = null
        return null
      } catch (err) {
        console.error('Fetch my video submission error:', err)

        this.error =
          err.message || 'Unable to load your video submission.'

        throw err
      }
    },

    // Staff/Admin/Superadmin: list all video submissions for judging
    async fetchAll() {
      this.isLoading = true
      this.error = null

      try {
        const snapshot = await getDocs(
          collection(db, 'video_submissions')
        )

        this.submissions = snapshot.docs
          .map((d) => ({
            id: d.id,
            ...d.data()
          }))
          .sort((a, b) => {
            const ta = a.submittedAt?.toMillis?.() ?? 0
            const tb = b.submittedAt?.toMillis?.() ?? 0

            return tb - ta
          })

        return this.submissions
      } catch (err) {
        console.error(
          'Fetch video submissions error:',
          err
        )

        this.error =
          err.message ||
          'Unable to load video submissions.'

        throw err
      } finally {
        this.isLoading = false
      }
    },

    // Upload video to Google Drive through Google Apps Script
    // and save the submission metadata to Firestore.
    //
    // repoSubmission = submissions/{uid}
    async submitVideo(
      user,
      formPayload,
      gasWebAppUrl,
      repoSubmission
    ) {
      this.isSubmitting = true
      this.error = null

      try {
        // --------------------------------------------------
        // 1. Validate user
        // --------------------------------------------------

        if (!user) {
          throw new Error(
            'You must be logged in before submitting a video.'
          )
        }

        // --------------------------------------------------
        // 2. Validate repository submission
        // --------------------------------------------------

        if (!repoSubmission) {
          throw new Error(
            'Submit your repository first before uploading a video.'
          )
        }

        // --------------------------------------------------
        // 3. Validate Apps Script URL
        // --------------------------------------------------

        if (!gasWebAppUrl) {
          throw new Error(
            'Google Drive upload service is not configured.'
          )
        }

        // --------------------------------------------------
        // 4. Validate video file
        // --------------------------------------------------

        const videoFile = formPayload?.videoFile

        if (!videoFile) {
          throw new Error(
            'Please select a video file.'
          )
        }

        // Optional: validate video MIME type
        if (!videoFile.type.startsWith('video/')) {
          throw new Error(
            'The selected file must be a video.'
          )
        }

        // --------------------------------------------------
        // 5. Prepare submission information
        // --------------------------------------------------

        const groupName =
          String(
            repoSubmission.groupName || ''
          ).trim() || 'Untitled Group'

        const description =
          String(
            repoSubmission.description || ''
          ).trim()

        // GitHub username
        const githubUsername =
          user.reloadUserInfo?.screenName ||
          repoSubmission.githubUsername ||
          user.displayName ||
          'Unknown'

        // Members
        const members = Array.isArray(
          repoSubmission.members
        )
          ? repoSubmission.members
          : (repoSubmission.membersName || '')
              .split(',')
              .map((member) => member.trim())
              .filter(Boolean)

        // --------------------------------------------------
        // 6. Convert video File → Base64
        // --------------------------------------------------

        const base64File = await new Promise(
          (resolve, reject) => {
            const reader = new FileReader()

            reader.readAsDataURL(videoFile)

            reader.onload = () => {
              try {
                const result = String(
                  reader.result || ''
                )

                const base64 = result.split(',')[1]

                if (!base64) {
                  reject(
                    new Error(
                      'Unable to convert the video to Base64.'
                    )
                  )

                  return
                }

                resolve(base64)
              } catch (error) {
                reject(error)
              }
            }

            reader.onerror = () => {
              reject(
                new Error(
                  'Failed to read the video file.'
                )
              )
            }
          }
        )

        // --------------------------------------------------
        // 7. Generate safe file name
        // --------------------------------------------------

        const safeGroupName = groupName
          .replace(/[^\w\-]+/g, '_')
          .replace(/^_+|_+$/g, '')

        const fileName =
          `${safeGroupName || 'Untitled_Group'}_${videoFile.name}`

        // --------------------------------------------------
        // 8. Upload video → Google Apps Script → Google Drive
        // --------------------------------------------------

        const driveResponse = await fetch(
          gasWebAppUrl,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'text/plain;charset=utf-8'
            },

            body: JSON.stringify({
              base64: base64File,
              fileName,
              mimeType:
                videoFile.type ||
                'application/octet-stream'
            })
          }
        )

        // HTTP-level error
        if (!driveResponse.ok) {
          throw new Error(
            `Drive upload request failed (${driveResponse.status}).`
          )
        }

        // --------------------------------------------------
        // 9. Parse Apps Script response
        // --------------------------------------------------

        let driveResult

        try {
          driveResult =
            await driveResponse.json()
        } catch {
          throw new Error(
            'Google Drive returned an invalid response.'
          )
        }

        // Apps Script application-level error
        if (
          driveResult.status !== 'success'
        ) {
          throw new Error(
            driveResult.message ||
            'Failed to upload the video to Google Drive.'
          )
        }

        // --------------------------------------------------
        // 10. Get Google Drive file ID
        // --------------------------------------------------

        const fileId =
          String(
            driveResult.fileId || ''
          ).trim()

        if (!fileId) {
          throw new Error(
            'Upload succeeded but no Drive file ID was returned.'
          )
        }

        // --------------------------------------------------
        // 11. Generate Google Drive preview URL
        // --------------------------------------------------

        const videoUrl =
          `https://drive.google.com/file/d/${fileId}/preview`

        // --------------------------------------------------
        // 12. Prepare Firestore document
        // --------------------------------------------------

        const submissionData = {
          userId: user.uid,

          // Repository submission data
          groupName,
          description,

          projectName:
            repoSubmission.projectName || '',

          members,

          membersName:
            repoSubmission.membersName ||
            members.join(', '),

          repositoryUrl:
            repoSubmission.repositoryUrl || '',

          techStack:
            repoSubmission.techStack || '',

          // Video data
          videoUrl,
          driveFileId: fileId,

          // User data
          githubUsername,

          email:
            user.email ||
            repoSubmission.email ||
            '',

          // Timestamp
          submittedAt: serverTimestamp()
        }

        // --------------------------------------------------
        // 13. Save to Firestore
        // --------------------------------------------------

        const docRef = doc(
          db,
          'video_submissions',
          user.uid
        )

        await setDoc(
          docRef,
          submissionData
        )

        // --------------------------------------------------
        // 14. Update local Pinia state
        // --------------------------------------------------

        this.submission = {
          id: user.uid,
          ...submissionData
        }

        return this.submission

      } catch (err) {
        console.error(
          'Submit video error:',
          err
        )

        this.error =
          err.message ||
          'Unable to submit video.'

        throw err

      } finally {
        this.isSubmitting = false
      }
    }
  }
})