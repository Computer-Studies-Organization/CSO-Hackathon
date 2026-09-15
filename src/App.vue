<script setup>
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { computed, onMounted, ref, watch } from 'vue'
import { Menu, X } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const route = useRoute()

const isAdminRoute = computed(() => route.path.startsWith('/admin'))
const mobileOpen = ref(false)

watch(() => route.path, () => {
  mobileOpen.value = false
})

onMounted(() => {
  authStore.initializeAuth()
})

</script>

<template>
  <div class=" bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <header v-if="!isAdminRoute" class=" backdrop-blur-xl border border-white/10 shadow-lg shadow-black/10 text-white">
      <div class="container mx-auto py-4 px-6 flex justify-between items-center gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <img src="/assets/CSOLOGO-removebg-preview.png" alt="ACLC LOGO COMMITTEE" class="h-12 mx-auto bg-white rounded-full" />
          <h1 class="truncate text-sm sm:text-base font-bold">ACLC CODEFEST  PRE-HAKATHON 2026</h1>
      </div>
        <!-- Desktop nav -->
        <nav class="hidden md:flex items-center space-x-6 justify-center">
          <RouterLink to="/" active-class="underline font-bold">
            Home
          </RouterLink>

          <RouterLink to="/submit" active-class="underline font-bold">
            Submit
          </RouterLink>

          <RouterLink to="/criteria" active-class="underline font-bold">
            Criteria
          </RouterLink>

          <!-- Not signed in -->
          <RouterLink
            v-if="!authStore.isAuthenticated"
            to="/login"
            active-class="underline font-bold"
          >
            Sign In
          </RouterLink>

          <!-- Signed in -->
          <div
            v-else
            class="flex items-center gap-3"
          >
            <img
              v-if="authStore.user?.photoURL"
              :src="authStore.user.photoURL"
              :alt="authStore.user.displayName || 'GitHub User'"
              class="w-9 h-9 rounded-full border border-white/20"
            />

            <div class="hidden sm:block text-sm">
              <p class="font-semibold">
                {{ authStore.githubUsername || authStore.user?.displayName }}
              </p>

              <button
                @click="authStore.logout"
                class="text-xs text-gray-400 hover:text-white transition"
              >
                Sign out
              </button>
            </div>
          </div>
        </nav>

        <!-- Hamburger (mobile) -->
        <button
          class="md:hidden p-2 rounded-lg text-gray-300 hover:bg-white/10 hover:text-white transition"
          :aria-label="mobileOpen ? 'Close menu' : 'Open menu'"
          :aria-expanded="mobileOpen"
          @click="mobileOpen = !mobileOpen"
        >
          <Menu v-if="!mobileOpen" :size="22" />
          <X v-else :size="22" />
        </button>

        <!-- <rudePing/> -->
      </div>

      <!-- Mobile nav -->
      <nav
        v-if="mobileOpen"
        class="md:hidden border-t border-white/10 px-6 py-4 flex flex-col gap-1 text-sm"
      >
        <RouterLink to="/" active-class="font-bold text-white" class="px-3 py-2.5 rounded-lg text-gray-300 hover:bg-white/5">
          Home
        </RouterLink>
        <RouterLink to="/submit" active-class="font-bold text-white" class="px-3 py-2.5 rounded-lg text-gray-300 hover:bg-white/5">
          Submit
        </RouterLink>
        <RouterLink to="/criteria" active-class="font-bold text-white" class="px-3 py-2.5 rounded-lg text-gray-300 hover:bg-white/5">
          Criteria
        </RouterLink>
        <RouterLink
          v-if="!authStore.isAuthenticated"
          to="/login"
          active-class="font-bold text-white"
          class="px-3 py-2.5 rounded-lg text-gray-300 hover:bg-white/5"
        >
          Sign In
        </RouterLink>
        <div v-else class="flex items-center gap-3 px-3 py-2.5">
          <img
            v-if="authStore.user?.photoURL"
            :src="authStore.user.photoURL"
            :alt="authStore.user.displayName || 'GitHub User'"
            class="w-9 h-9 rounded-full border border-white/20"
          />
          <div class="flex-1 min-w-0 text-sm">
            <p class="font-semibold truncate">
              {{ authStore.githubUsername || authStore.user?.displayName }}
            </p>
            <button
              @click="authStore.logout"
              class="text-xs text-gray-400 hover:text-white transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

    </header>

    <div>
      <RouterView />
    </div>

     <footer
    v-if="!isAdminRoute"
    class="mt-16 border-t border-white/10
           bg-gray-950/70 backdrop-blur-xl
           text-white"
  >
    <div class="container mx-auto px-6 py-10">

      <div class="grid gap-8 md:grid-cols-3">

        <!-- Branding -->
        <div>
          <div class="flex items-center gap-3">
            <img
              src="/assets/CSOLOGO-removebg-preview.png"
              alt="ACLC Logo Committee"
              class="h-12 w-auto bg-white rounded-full"
            />

            <div>
              <h2 class="font-bold text-lg">
                CSO - Computer Studies Organization
              </h2>

              <p class="text-xs text-gray-400">
                ACLC CODEFEST 2026 Pre-Hacktoberfest Edition
              </p>
            </div>
          </div>

          <p class="mt-4 text-sm text-gray-400 leading-relaxed max-w-sm">
            Building the future through collaboration, open-source,
            and code. Learn, build, collaborate, and create meaningful
            solutions.
          </p>
        </div>

        <!-- Quick Links -->
        <div>
          <h3 class="font-semibold text-lg mb-4">
            Quick Links
          </h3>

          <nav class="flex flex-col gap-2 text-sm">
            <RouterLink
              to="/"
              class="text-gray-400 hover:text-white transition"
            >
              Home
            </RouterLink>

            <RouterLink
              to="/submit"
              class="text-gray-400 hover:text-white transition"
            >
              Submit Your Project
            </RouterLink>

            <RouterLink
              to="/criteria"
              class="text-gray-400 hover:text-white transition"
            >
              Criteria
            </RouterLink>
          </nav>
        </div>

        <!-- Event -->
        <div>
          <h3 class="font-semibold text-lg mb-4">
            About the Event
          </h3>

          <p class="text-sm text-gray-400 leading-relaxed">
            An ACLC College of Mandaue CSO Programming Committee
            initiative designed to encourage students to learn,
            collaborate, and build practical software solutions.
          </p>

          <div class="mt-4 text-sm text-gray-400">
            <p>📍 ACLC College of Mandaue</p>
            <p class="mt-1">💻 CSO Programming Committee</p>
          </div>
        </div>

      </div>

      <!-- Divider -->
      <div class="border-t border-white/10 mt-10 pt-6">

        <div
          class="flex flex-col md:flex-row
                 justify-between items-center gap-3"
        >

          <p class="text-xs text-gray-500 text-center md:text-left">
            © 2026 ACLC CODEFEST. All rights reserved.
          </p>

          <p class="text-xs text-gray-500">
            Built with ❤️ by the CSO Programming Committee
          </p>

        </div>

      </div>

    </div>
  </footer>
  </div>
</template>

