<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const isLoading = computed(() => authStore.isLoading)
const errorMessage = computed(() => authStore.error)

const loginWithGithub = async () => {
  try {
    await authStore.loginWithGithub()

    // Login successful
    router.push('/submit')
  } catch (error) {
    console.error('Login failed:', error)
  }
}
</script>

<template>
  <main
    class="flex items-center justify-center
           px-6 py-12"
  >
    <div class="w-full max-w-md">

      <!-- Logo / Branding -->
      <div class="text-center mb-8">

        <img
          src="/assets/Untitled3_20250620213045.png"
          alt="ACLC Logo Committee"
          class="h-16 mx-auto mb-5"
        />

        <h1 class="text-3xl font-extrabold text-white">
          ACLC CODEFEST 2026
        </h1>

        <p class="text-gray-400 mt-2">
          Pre-Hacktoberfest Edition
        </p>

      </div>


      <!-- Login Card -->
      <div
        class="rounded-2xl
               bg-white/10
               backdrop-blur-2xl
               border border-white/10
               shadow-2xl shadow-black/30
               p-8 text-white"
      >

        <!-- Heading -->
        <div class="text-center mb-7">

          <h2 class="text-2xl font-bold">
            Sign in to continue
          </h2>

          <p class="text-sm text-gray-400 mt-2">
            Use your GitHub account to access
            project submission.
          </p>

        </div>


        <!-- Error Message -->
        <div
          v-if="errorMessage"
          class="mb-5 p-4 rounded-xl
                 bg-red-500/10
                 border border-red-500/20"
        >

          <div class="flex gap-3">

            <span class="text-red-400 text-lg">
              ⚠
            </span>

            <p class="text-xs text-red-200 leading-relaxed">
              {{ errorMessage }}
            </p>

          </div>

        </div>


        <!-- GitHub Login -->
        <button
          type="button"
          @click="loginWithGithub"
          :disabled="isLoading"
          class="w-full flex items-center justify-center gap-3
                 bg-white text-gray-900
                 hover:bg-gray-200
                 disabled:opacity-60
                 disabled:cursor-not-allowed
                 font-semibold
                 py-3 px-5
                 rounded-xl
                 transition duration-200
                 shadow-lg"
        >

          <!-- GitHub Icon -->
          <svg
            v-if="!isLoading"
            viewBox="0 0 24 24"
            class="w-6 h-6 fill-current"
            aria-hidden="true"
          >
            <path
              d="M12 .5C5.65.5.5 5.65.5 12c0 5.09
              3.29 9.41 7.86 10.94.58.11.79-.25.79-.56
              0-.27-.01-1.16-.01-2.11-3.2.69-3.88-1.36
              -3.88-1.36-.53-1.33-1.28-1.69-1.28-1.69
              -1.04-.71.08-.7.08-.7 1.15.08 1.75 1.18
              1.75 1.18 1.02 1.75 2.68 1.24 3.34.95
              .1-.74.4-1.24.73-1.52-2.55-.29-5.23-1.28
              -5.23-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29
              -.51-1.47.11-3.06 0 0 .96-.31 3.15 1.18
              .91-.25 1.88-.38 2.85-.38.97 0 1.94.13
              2.85.38 2.18-1.49 3.14-1.18 3.14-1.18
              .62 1.59.23 2.77.11 3.06.74.81 1.18 1.84
              1.18 3.1 0 4.43-2.69 5.41-5.25 5.69.41.35
              .78 1.04.78 2.1 0 1.52-.01 2.75-.01 3.12
              0 .3.21.67.8.56A11.51 11.51 0 0 0 23.5 12
              C23.5 5.65 18.35.5 12 .5Z"
            />
          </svg>


          <!-- Loading Spinner -->
          <span
            v-else
            class="w-5 h-5 border-2 border-gray-400
                   border-t-gray-900
                   rounded-full
                   animate-spin"
          ></span>


          <!-- Button Text -->
          <span>
            {{
              isLoading
                ? 'Connecting to GitHub...'
                : 'Continue with GitHub'
            }}
          </span>

        </button>


        <!-- Information -->
        <div
          class="mt-6 p-4 rounded-xl
                 bg-yellow-400/10
                 border border-yellow-400/20"
        >

          <div class="flex gap-3">

            <span class="text-yellow-400 text-lg">
              ⚠
            </span>

            <p class="text-xs text-gray-300 leading-relaxed">
              GitHub sign-in is required to verify
              project ownership before submitting
              an open-source project.
            </p>

          </div>

        </div>

      </div>


      <!-- Footer -->
      <p class="text-center text-xs text-gray-500 mt-6">
        ACLC College of Mandaue ·
        CSO Programming Committee
      </p>

    </div>
  </main>
</template>