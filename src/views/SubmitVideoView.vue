<script setup>
import { onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import AppLoader from '@/components/uiverse_component/apploader.vue'
import { useAuthStore } from '@/stores/auth'
import { useVideoSubmissionStore } from '@/stores/videosubmission'
import { useSubmissionStore } from '@/stores/submission'

const authStore = useAuthStore()
const videoStore = useVideoSubmissionStore()
const submissionStore = useSubmissionStore()
const router = useRouter()

// Gikan sa .env (VITE_GAS_WEB_APP_URL) — dili i-hardcode diri
const GAS_WEB_APP_URL = import.meta.env.VITE_GAS_WEB_APP_URL

if (!GAS_WEB_APP_URL) {
  console.warn('VITE_GAS_WEB_APP_URL is not set in .env')
}

const form = reactive({
  videoFile: null
})

const fileName = ref('')
const fileError = ref('')

const alreadySubmitted = ref(false)
const checkingExisting = ref(true)

// Repo submission — source of truth for group name / description / etc.
const repoSubmission = ref(null)
const loadingRepo = ref(true)

const loadRepoSubmission = async () => {
  if (!authStore.isAuthenticated) {
    repoSubmission.value = null
    loadingRepo.value = false
    return
  }
  loadingRepo.value = true
  try {
    repoSubmission.value = await submissionStore.fetchMine(authStore.user)
  } catch {
    repoSubmission.value = null
  } finally {
    loadingRepo.value = false
  }
}

// Check kung naa nay record sa video_submissions collection
const checkExisting = async () => {
  if (!authStore.isAuthenticated) {
    alreadySubmitted.value = false
    checkingExisting.value = false
    return
  }
  checkingExisting.value = true
  try {
    const mine = await videoStore.fetchMine(authStore.user)
    alreadySubmitted.value = !!mine
  } catch {
    alreadySubmitted.value = false
  } finally {
    checkingExisting.value = false
  }
}

const refresh = async () => {
  await Promise.all([checkExisting(), loadRepoSubmission()])
}

onMounted(refresh)
watch(() => authStore.isAuthenticated, refresh)

// Handle Video Upload
const handleFileUpload = (event) => {
  fileError.value = ''
  const file = event.target.files[0]

  if (file) {
    const maxSize = 50 * 1024 * 1024 // 50MB limit (gi-adjust nato para dili mo-crash ang GAS)
    if (file.size > maxSize) {
      fileError.value = 'Video file size must be less than 50MB.'
      form.videoFile = null
      fileName.value = ''
      event.target.value = ''
      return
    }

    if (!file.type.startsWith('video/')) {
      fileError.value = 'Please upload a valid video file (MP4, WebM, etc).'
      form.videoFile = null
      fileName.value = ''
      event.target.value = ''
      return
    }

    form.videoFile = file
    fileName.value = file.name
  }
}

// Submit Video — group name / description etc. mirrored from repo submission
const submitVideoProject = async () => {
  if (!authStore.isAuthenticated) {
    router.push('/login')
    return
  }

  if (!form.videoFile) {
    fileError.value = 'Please select a video to upload.'
    return
  }

  if (!GAS_WEB_APP_URL) {
    fileError.value = 'Upload is not configured. Set VITE_GAS_WEB_APP_URL in .env.'
    return
  }

  if (!repoSubmission.value) {
    fileError.value = 'Submit your repository first before uploading a video.'
    return
  }

  try {
    await videoStore.submitVideo(
      authStore.user,
      { videoFile: form.videoFile },
      GAS_WEB_APP_URL,
      repoSubmission.value
    )

    alert('Video submitted successfully!')

    alreadySubmitted.value = true
    form.videoFile = null
    fileName.value = ''
    fileError.value = ''

  } catch (error) {
    console.error('Video submission failed:', error)
    fileError.value = videoStore.error || 'Failed to upload video.'
  }
}
</script>

<template>
  <main class="container mx-auto px-6 py-10">

    <!-- Page Header -->
    <section class="mb-10 text-white">
      <p class="text-sm font-semibold uppercase tracking-wider text-yellow-400">
        ACLC CODEFEST 2026
      </p>

      <h1 class="text-4xl md:text-5xl font-extrabold tracking-tight mt-2">
        Submit Your Video
      </h1>

      <p class="mt-4 max-w-2xl text-base md:text-lg leading-relaxed text-gray-400">
        Showcase your project in action! Upload your demo video here so the judges
        and the community can see how your system works.
      </p>
    </section>

    <!-- Submission Section -->
    <section
      class="relative overflow-hidden rounded-3xl bg-gray-900 border border-white/10 shadow-2xl shadow-black/20 p-6 md:p-10 text-white"
    >
      <!-- Decorative glow -->
      <div class="absolute -right-20 -top-20 w-56 h-56 rounded-full bg-purple-500/10 blur-3xl"></div>

      <div class="relative">

        <!-- NOT LOGGED IN -->
        <template v-if="!authStore.isAuthenticated">
          <p class="text-sm font-semibold uppercase tracking-wider text-yellow-400">
            Ready?
          </p>
          <h2 class="text-2xl md:text-3xl font-extrabold mt-1">
            Submit Your Video
          </h2>
          <p class="mt-3 max-w-2xl text-sm md:text-base leading-relaxed text-gray-400">
            Sign in with GitHub to continue with your video submission.
          </p>

          <div class="mt-6">
            <RouterLink
              to="/login"
              class="inline-flex items-center justify-center gap-3 px-6 py-3 rounded-xl bg-white text-gray-950 font-bold text-sm hover:bg-gray-200 transition duration-200 shadow-lg"
            >
              Continue with GitHub
            </RouterLink>
          </div>
        </template>

        <!-- LOGGED IN -->
        <template v-else>
          <p class="text-sm font-semibold uppercase tracking-wider text-green-400">
            GitHub Verified
          </p>
          <h2 class="text-2xl md:text-3xl font-extrabold mt-1">
            Upload Demonstration Video
          </h2>

          <!-- Checking existing submission -->
          <div v-if="checkingExisting || loadingRepo" class="mt-6 p-4 rounded-2xl bg-white/5 border border-white/10">
            <p class="text-sm text-gray-400">Checking your submission…</p>
          </div>

          <!-- Already submitted video -->
          <div v-else-if="alreadySubmitted" class="mt-6 p-6 rounded-2xl bg-green-500/10 border border-green-500/20">
            <p class="text-sm font-bold text-green-300">✓ Video already submitted</p>
            <p class="mt-3 text-xs text-gray-400 leading-relaxed">
              You have already uploaded a video for your group. If you need changes, please contact the organizers.
            </p>
          </div>

          <!-- No repo submission yet -->
          <div v-else-if="!repoSubmission" class="mt-6 p-6 rounded-2xl bg-yellow-500/10 border border-yellow-500/20">
            <p class="text-sm font-bold text-yellow-300">Repository submission required</p>
            <p class="mt-2 text-xs text-gray-400 leading-relaxed">
              Submit your project repository first — group name and details will be mirrored from that submission.
            </p>
            <RouterLink
              to="/submit"
              class="inline-block mt-4 px-5 py-2.5 rounded-xl bg-white text-gray-950 font-bold text-sm hover:bg-gray-200 transition"
            >
              Go to Repository Submission
            </RouterLink>
          </div>

          <template v-else>
            <!-- User Info -->
            <div class="mt-6 flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
              <img
                v-if="authStore.user?.photoURL"
                :src="authStore.user.photoURL"
                alt="GitHub profile"
                class="w-12 h-12 rounded-full"
              />
              <div>
                <p class="font-semibold">
                  {{ authStore.githubUsername
                    ? '@' + authStore.githubUsername
                    : (authStore.user?.displayName || 'GitHub User') }}
                </p>
                <p v-if="authStore.user?.email" class="text-xs text-gray-400">
                  {{ authStore.user.email }}
                </p>
              </div>
            </div>

            <!-- Mirrored from repo submission -->
            <div class="mt-4 p-4 rounded-2xl bg-white/5 border border-white/10">
              <p class="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3">
                From your repository submission
              </p>

              <div class="space-y-3">
                <div>
                  <p class="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Group Name
                  </p>
                  <p class="mt-0.5 font-semibold text-sm text-white">
                    {{ repoSubmission.groupName || '—' }}
                  </p>
                </div>

                <div v-if="repoSubmission.projectName">
                  <p class="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Project Name
                  </p>
                  <p class="mt-0.5 text-sm text-gray-200">
                    {{ repoSubmission.projectName }}
                  </p>
                </div>

                <div>
                  <p class="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Description
                  </p>
                  <p class="mt-0.5 text-xs text-gray-400 leading-relaxed">
                    {{ repoSubmission.description || 'No description.' }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Video Form -->
            <form class="mt-8 space-y-6 relative" @submit.prevent="submitVideoProject">

              <!-- AppLoader — full screen; mawala ra kung ok na (isSubmitting = false) -->
              <Teleport to="body">
                <div
                  v-if="videoStore.isSubmitting"
                  class="fixed inset-0 z-[9999] flex flex-col items-center justify-center
                         bg-black"
                  aria-live="polite"
                  aria-busy="true"
                >
                  <AppLoader />
                  <p class="mt-4 text-sm text-gray-300 text-center px-4">
                    Uploading your video… please wait
                  </p>
                </div>
              </Teleport>

              <!-- Video Upload Drag & Drop Area -->
              <div>
                <label class="block text-sm font-semibold mb-2">
                  Upload Video Demo
                </label>

                <div
                  class="relative flex flex-col items-center justify-center w-full h-48 rounded-xl border-2 border-dashed transition-colors"
                  :class="fileName ? 'border-purple-500 bg-purple-500/5' : 'border-gray-600 bg-black/30 hover:border-purple-400 hover:bg-black/50'"
                >
                  <input
                    type="file"
                    accept="video/mp4,video/x-m4v,video/*"
                    class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    @change="handleFileUpload"
                  />

                  <div v-if="!fileName" class="text-center px-4">
                    <svg class="mx-auto h-10 w-10 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p class="text-sm text-gray-300 font-semibold">Click or drag a video here</p>
                    <p class="text-xs text-gray-500 mt-1">MP4, WebM (Max 50MB)</p>
                  </div>

                  <div v-else class="text-center px-4 z-20 pointer-events-none">
                    <svg class="mx-auto h-10 w-10 text-purple-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <p class="text-sm font-bold text-purple-300 truncate max-w-[200px] md:max-w-xs">{{ fileName }}</p>
                    <p class="text-xs text-gray-400 mt-1">Click to change file</p>
                  </div>
                </div>

                <p v-if="fileError" class="mt-2 text-xs text-red-400">
                  ⚠ {{ fileError }}
                </p>
              </div>

              <!-- Submit Error from Store -->
              <div v-if="videoStore.error" class="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                <p class="text-xs text-red-200 leading-relaxed">
                  {{ videoStore.error }}
                </p>
              </div>

              <!-- Submit Button -->
              <button
                type="submit"
                :disabled="videoStore.isSubmitting || !form.videoFile"
                class="w-full py-3 px-5 rounded-xl bg-purple-500 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed font-bold transition mt-4"
              >
                {{ videoStore.isSubmitting ? 'Uploading…' : 'Submit Video' }}
              </button>
            </form>
          </template>
        </template>
      </div>
    </section>
  </main>
</template>
