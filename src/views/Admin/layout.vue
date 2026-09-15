<script setup>
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import {
  LayoutDashboard,
  FileText,
  Users,
  ExternalLink,
  LogOut,
  ChevronRight,
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

const navItems = [
  {
    to: '/admin',
    label: 'Dashboard',
    icon: LayoutDashboard,
    exact: true,
    roles: ['superadmin', 'admin', 'staff'],
  },
  {
    to: '/admin/submissions',
    label: 'Submissions',
    icon: FileText,
    exact: false,
    roles: ['superadmin', 'admin', 'staff'],
  },
  {
    to: '/admin/accounts',
    label: 'Accounts',
    icon: Users,
    exact: false,
    roles: ['superadmin', 'admin'],
  },
]

const visibleNavItems = computed(() => {
  return navItems.filter((item) => item.roles.includes(authStore.role))
})

const roleLabel = computed(() =>
  authStore.role === 'superadmin'
    ? 'Superadmin'
    : authStore.role === 'admin'
      ? 'Administrator'
      : 'Staff'
)

const isActive = (item) =>
  item.exact
    ? route.path === item.to
    : route.path.startsWith(item.to)

const handleLogout = async () => {
  await authStore.logout()
  router.push('/admin/login')
}
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white">

    <div class="flex min-h-screen">

      <!-- SIDEBAR -->
      <aside
        class="hidden lg:flex w-72 shrink-0 flex-col
               bg-gray-900 border-r border-white/10"
      >

        <!-- Brand -->
        <div class="h-20 px-6 flex items-center border-b border-white/10">
          <div class="flex items-center gap-3">
            <img
              src="/assets/Untitled3_20250620213045.png"
              alt="ACLC Logo Committee"
              class="h-10 w-auto"
            />

            <div class="min-w-0">
              <p class="text-sm font-bold text-white">
                Admin Panel
              </p>

              <p class="text-[11px] text-gray-500 uppercase tracking-wider">
                ACLC CODEFEST 2026
              </p>
            </div>
          </div>
        </div>


        <!-- Navigation -->
        <div class="flex-1 px-4 py-6">

          <p
            class="px-3 mb-3 text-[11px] font-semibold
                   uppercase tracking-wider text-gray-500"
          >
            Management
          </p>

          <nav class="space-y-1">

            <RouterLink
              v-for="item in visibleNavItems"
              :key="item.to"
              :to="item.to"
              class="group flex items-center gap-3 px-3 py-3
                     rounded-lg text-sm font-medium transition"
              :class="
                isActive(item)
                  ? 'bg-purple-500/10 text-purple-400'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              "
            >

              <!-- Active indicator -->
              <span
                class="absolute"
              ></span>

              <component
                :is="item.icon"
                :size="19"
                :stroke-width="isActive(item) ? 2.2 : 1.8"
              />

              <span class="flex-1">
                {{ item.label }}
              </span>

              <ChevronRight
                v-if="isActive(item)"
                :size="15"
                class="text-purple-400"
              />

            </RouterLink>

          </nav>


          <!-- System -->
          <p
            class="px-3 mt-8 mb-3 text-[11px] font-semibold
                   uppercase tracking-wider text-gray-500"
          >
            System
          </p>

          <RouterLink
            to="/"
            class="flex items-center gap-3 px-3 py-3
                   rounded-lg text-sm font-medium
                   text-gray-400 hover:bg-white/5
                   hover:text-white transition"
          >
            <ExternalLink :size="19" stroke-width="1.8" />

            <span>
              Back to Website
            </span>
          </RouterLink>

        </div>


        <!-- User section -->
        <div class="p-4 border-t border-white/10">

          <div
            v-if="authStore.isAuthenticated"
            class="flex items-center gap-3 p-3 rounded-xl
                   bg-white/[0.03] border border-white/5"
          >

            <!-- Avatar -->
            <div class="shrink-0">

              <img
                v-if="authStore.user?.photoURL"
                :src="authStore.user.photoURL"
                :alt="authStore.user.displayName || 'Admin'"
                class="w-10 h-10 rounded-full
                       border border-white/10 object-cover"
              />

              <div
                v-else
                class="w-10 h-10 rounded-full
                       bg-purple-500/20
                       flex items-center justify-center
                       text-purple-400 font-bold"
              >
                A
              </div>

            </div>


            <!-- User info -->
            <div class="min-w-0 flex-1">

              <p
                class="text-sm font-semibold text-white truncate"
              >
                {{
                  authStore.githubUsername ||
                  authStore.user?.displayName ||
                  'Admin'
                }}
              </p>

              <p class="text-xs text-gray-500">
                {{ roleLabel }}
              </p>

            </div>


            <!-- Logout -->
            <button
              @click="handleLogout"
              title="Sign out"
              class="p-2 rounded-lg text-gray-500
                     hover:bg-red-500/10
                     hover:text-red-400 transition"
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
          class="h-20 border-b border-white/10
                 flex items-center justify-between
                 px-6 lg:px-10"
        >

          <div>
            <p class="text-xs text-gray-500 uppercase tracking-wider">
              Administration
            </p>

            <h1 class="text-lg font-semibold text-white">
              {{ route.meta?.title || 'Admin Panel' }}
            </h1>
          </div>

        </header>


        <!-- Page -->
        <div class="p-6 lg:p-10">
          <RouterView />
        </div>

      </main>

    </div>

  </div>
</template>