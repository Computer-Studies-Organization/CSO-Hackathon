<script setup>
import { computed, ref } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import {
  LayoutDashboard,
  Star,
  FileText,
  Video,
  ListChecks,
  ExternalLink,
  LogOut,
  ChevronRight,
  Menu,
  ShieldCheck,
  X,
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

const mobileOpen = ref(false)
const closeMobile = () => {
  mobileOpen.value = false
}

// Judges-only panel.
const navItems = [
  {
    to: '/judges',
    label: 'Dashboard',
    icon: LayoutDashboard,
    exact: true,
  },
  {
    to: '/judges/scoring',
    label: 'Scoring',
    icon: Star,
    exact: false,
  },
  {
    to: '/judges/repository',
    label: 'Repository',
    icon: FileText,
    exact: false,
  },
  {
    to: '/judges/videos',
    label: 'Video',
    icon: Video,
    exact: false,
  },
  {
    to: '/judges/criteria',
    label: 'Criteria',
    icon: ListChecks,
    exact: false,
  },
]

const roleLabel = computed(() =>
  authStore.role === 'superadmin'
    ? 'Superadmin'
    : authStore.role === 'admin'
      ? 'Administrator'
      : 'Judge',
)

const isActive = (item) => (item.exact ? route.path === item.to : route.path.startsWith(item.to))

const handleLogout = async () => {
  await authStore.logout()
  router.push('/judges/login')
}
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white overflow-x-clip">
    <div class="flex min-h-screen w-full max-w-[1600px] mx-auto">
      <!-- SIDEBAR -->
      <aside class="hidden lg:flex w-72 shrink-0 flex-col bg-gray-900 border-r border-white/10">
        <!-- Brand -->
        <div class="h-20 px-6 flex items-center border-b border-white/10">
          <div class="flex items-center gap-3">
            <img
              src="/assets/Untitled3_20250620213045.webp"
              alt="ACLC Logo Committee"
              class="h-10 w-auto"
            />

            <div class="min-w-0">
              <p class="text-sm font-bold text-white">Judges Panel</p>

              <p class="text-[11px] text-gray-500 uppercase tracking-wider">ACLC CODEFEST 2026</p>
            </div>
          </div>
        </div>

        <!-- Navigation -->
        <div class="flex-1 px-4 py-6">
          <p class="px-3 mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Judging
          </p>

          <nav class="space-y-1">
            <RouterLink
              v-for="item in navItems"
              :key="item.to"
              :to="item.to"
              class="group flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition"
              :class="
                isActive(item)
                  ? 'bg-purple-500/10 text-purple-400'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              "
            >
              <component :is="item.icon" :size="19" :stroke-width="isActive(item) ? 2.2 : 1.8" />

              <span class="flex-1">
                {{ item.label }}
              </span>

              <ChevronRight v-if="isActive(item)" :size="15" class="text-purple-400" />
            </RouterLink>
          </nav>

          <!-- System -->
          <p
            class="px-3 mt-8 mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500"
          >
            System
          </p>

          <RouterLink
            to="/"
            class="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-gray-400 hover:bg-white/5 hover:text-white transition"
          >
            <ExternalLink :size="19" stroke-width="1.8" />

            <span> Back to Website </span>
          </RouterLink>
        </div>

        <!-- User section -->
        <div class="p-4 border-t border-white/10">
          <div
            v-if="authStore.isAuthenticated"
            class="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5"
          >
            <!-- Avatar -->
            <div class="shrink-0">
              <img
                v-if="authStore.user?.photoURL"
                :src="authStore.user.photoURL"
                :alt="authStore.user.displayName || 'Judge'"
                class="w-10 h-10 rounded-full border border-white/10 object-cover"
              />

              <div
                v-else
                class="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold"
              >
                J
              </div>
            </div>

            <!-- User info -->
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-white truncate">
                {{ authStore.user?.displayName || authStore.user?.email || 'Judge' }}
              </p>

              <p class="text-xs text-gray-500">
                {{ roleLabel }}
              </p>
            </div>

            <!-- Logout -->
            <button
              @click="handleLogout"
              title="Sign out"
              class="p-2 rounded-lg text-gray-500 hover:bg-red-500/10 hover:text-red-400 transition"
            >
              <LogOut :size="17" />
            </button>
          </div>
        </div>
      </aside>

      <!-- MAIN -->
      <main class="flex-1 min-w-0 bg-gray-950">
        <!-- Top bar -->
        <header
          class="border-b border-white/10 flex flex-col justify-center gap-3 px-6 lg:px-10 py-4"
        >
          <!-- Menu icon (mobile) + Breadcrumb -->
          <div class="flex items-center gap-3 min-w-0">
            <button
              type="button"
              class="lg:hidden shrink-0 p-2 -ml-1 rounded-lg text-gray-300 hover:bg-white/10 hover:text-white transition border border-white/10"
              aria-label="Open menu"
              aria-haspopup="dialog"
              :aria-expanded="mobileOpen"
              @click="mobileOpen = true"
            >
              <Menu :size="20" />
            </button>

            <nav aria-label="Breadcrumb" class="flex items-center gap-1.5 text-sm min-w-0 flex-1">
              <ShieldCheck :size="16" class="hidden sm:block shrink-0 text-purple-400" />
              <span class="shrink-0 text-gray-500">Judges</span>
              <ChevronRight :size="14" class="shrink-0 text-gray-600" />
              <span class="truncate text-white font-semibold">
                {{ route.meta?.title || 'Judges Panel' }}
              </span>
            </nav>
          </div>
        </header>

        <!-- Page -->
        <div class="p-6 lg:p-10">
          <RouterView />
        </div>
      </main>
    </div>

    <!-- MOBILE MENU (hamburger) -->
    <Teleport to="body">
      <div
        v-if="mobileOpen"
        class="fixed inset-0 z-[90] lg:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        @click.self="closeMobile"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

        <!-- Drawer -->
        <aside
          class="absolute inset-y-0 left-0 w-72 max-w-[85vw] flex flex-col bg-gray-900 border-r border-white/10 shadow-2xl"
        >
          <!-- Brand -->
          <div class="h-20 px-6 flex items-center justify-between border-b border-white/10">
            <div class="flex items-center gap-3 min-w-0">
              <img
                src="/assets/Untitled3_20250620213045.webp"
                alt="ACLC Logo Committee"
                class="h-10 w-auto shrink-0"
              />

              <div class="min-w-0">
                <p class="text-sm font-bold text-white">Judges Panel</p>
                <p class="text-[11px] text-gray-500 uppercase tracking-wider">ACLC CODEFEST 2026</p>
              </div>
            </div>

            <button
              type="button"
              class="shrink-0 p-2 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white transition"
              aria-label="Close menu"
              @click="closeMobile"
            >
              <X :size="20" />
            </button>
          </div>

          <!-- Navigation -->
          <div class="flex-1 overflow-y-auto px-4 py-6">
            <p class="px-3 mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Judging
            </p>

            <nav class="space-y-1">
              <RouterLink
                v-for="item in navItems"
                :key="item.to"
                :to="item.to"
                class="group flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition"
                :class="
                  isActive(item)
                    ? 'bg-purple-500/10 text-purple-400'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                "
                @click="closeMobile"
              >
                <component :is="item.icon" :size="19" :stroke-width="isActive(item) ? 2.2 : 1.8" />

                <span class="flex-1">{{ item.label }}</span>

                <ChevronRight v-if="isActive(item)" :size="15" class="text-purple-400" />
              </RouterLink>
            </nav>

            <!-- System -->
            <p
              class="px-3 mt-8 mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500"
            >
              System
            </p>

            <RouterLink
              to="/"
              class="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-gray-400 hover:bg-white/5 hover:text-white transition"
              @click="closeMobile"
            >
              <ExternalLink :size="19" stroke-width="1.8" />
              <span> Back to Website </span>
            </RouterLink>
          </div>

          <!-- User section -->
          <div v-if="authStore.isAuthenticated" class="p-4 border-t border-white/10">
            <div
              class="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5"
            >
              <div class="shrink-0">
                <img
                  v-if="authStore.user?.photoURL"
                  :src="authStore.user.photoURL"
                  :alt="authStore.user.displayName || 'Judge'"
                  class="w-10 h-10 rounded-full border border-white/10 object-cover"
                />

                <div
                  v-else
                  class="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold"
                >
                  J
                </div>
              </div>

              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-white truncate">
                  {{ authStore.user?.displayName || authStore.user?.email || 'Judge' }}
                </p>

                <p class="text-xs text-gray-500">{{ roleLabel }}</p>
              </div>

              <button
                @click="handleLogout"
                title="Sign out"
                class="p-2 rounded-lg text-gray-500 hover:bg-red-500/10 hover:text-red-400 transition"
              >
                <LogOut :size="17" />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </Teleport>
  </div>
</template>
