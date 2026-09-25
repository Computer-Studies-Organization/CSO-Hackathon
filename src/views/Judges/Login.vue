<script setup>
import { computed, ref } from 'vue'
import { useRouter, useRoute, RouterLink } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const isLoading = computed(() => authStore.isLoading)
const loginError = ref(null)

const email = ref('')
const password = ref('')

const submit = async () => {
  loginError.value = null

  if (!email.value.trim()) {
    loginError.value = 'Please enter your email address.'
    return
  }

  if (!password.value) {
    loginError.value = 'Please enter your password.'
    return
  }

  try {
    await authStore.loginJudge(email.value, password.value)

    if (!authStore.canAccessJudges) {
      await authStore.logout()
      loginError.value = 'This account is not authorized for judge access.'
      return
    }

    const redirect =
      typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/judges')
        ? route.query.redirect
        : '/judges'

    router.push(redirect)
  } catch (error) {
    console.error('Judge login failed:', error)
    loginError.value = authStore.error
  }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white">
    <main class="flex items-center justify-center px-6 py-12">
      <div class="w-full max-w-md">
        <!-- Logo / Branding -->
        <div class="text-center mb-8">
          <img
            src="/assets/Untitled3_20250620213045.png"
            alt="ACLC Logo Committee"
            class="h-16 mx-auto mb-5"
          />
          <p class="text-sm font-semibold uppercase tracking-wider text-yellow-400">
            Restricted Area
          </p>
          <h1 class="text-3xl font-extrabold mt-1">Judge Sign In</h1>
          <p class="text-gray-400 mt-2">ACLC CODEFEST 2026 · Judges Panel</p>
        </div>

        <!-- Login Card -->
        <div
          class="rounded-2xl bg-white/10 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/30 p-8 text-white"
        >
          <div class="text-center mb-7">
            <h2 class="text-2xl font-bold">Judge access</h2>
            <p class="text-sm text-gray-400 mt-2">
              Sign in with the email and password issued to you by the administrator.
            </p>
          </div>

          <!-- Error Message -->
          <div v-if="loginError" class="mb-5 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
            <div class="flex gap-3">
              <span class="text-red-400 text-lg">⚠</span>
              <p class="text-xs text-red-200 leading-relaxed">
                {{ loginError }}
              </p>
            </div>
          </div>

          <form @submit.prevent="submit" novalidate>
            <!-- Email -->
            <div class="mb-4">
              <label
                for="judge-email"
                class="block mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400"
              >
                Email
              </label>
              <input
                id="judge-email"
                v-model="email"
                type="email"
                autocomplete="email"
                required
                placeholder="judge@example.com"
                class="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white placeholder-gray-500 outline-none text-sm focus:border-purple-400 transition"
              />
            </div>

            <!-- Password -->
            <div class="mb-6">
              <label
                for="judge-password"
                class="block mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400"
              >
                Password
              </label>
              <input
                id="judge-password"
                v-model="password"
                type="password"
                autocomplete="current-password"
                required
                placeholder="••••••••"
                class="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white placeholder-gray-500 outline-none text-sm focus:border-purple-400 transition"
              />
            </div>

            <!-- Submit -->
            <button
              type="submit"
              :disabled="isLoading"
              class="w-full flex items-center justify-center gap-3 bg-purple-500 hover:bg-purple-600 disabled:opacity-60 disabled:cursor-not-allowed font-semibold py-3 px-5 rounded-xl transition duration-200 shadow-lg"
            >
              <span
                v-if="isLoading"
                class="w-5 h-5 border-2 border-purple-200 border-t-white rounded-full animate-spin"
              ></span>
              <span>
                {{ isLoading ? 'Signing in…' : 'Sign In' }}
              </span>
            </button>
          </form>

          <div class="mt-6 text-center">
            <RouterLink to="/" class="text-xs text-gray-400 hover:text-white transition">
              ← Back to site
            </RouterLink>
          </div>
        </div>

        <p class="text-center text-xs text-gray-500 mt-6">
          ACLC College of Mandaue · CSO Programming Committee
        </p>
      </div>
    </main>
  </div>
</template>
