import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import SubmitView from '../views/SubmitView.vue'
import CriteriaView from '../views/CriteriaView.vue'
import SubmitVideoView from '../views/SubmitVideoView.vue'
import LoginView from '../views/Auth/Login.vue'
import AdminLayout from '../views/Admin/layout.vue'
import AdminLogin from '../views/Admin/Login.vue'
import AdminDashboard from '../views/Admin/Dashboard.vue'
import AdminSubmissions from '../views/Admin/Submissions.vue'
import AdminVideos from '../views/Admin/Videos.vue'
import AdminAccounts from '../views/Admin/Accounts.vue'
import { useAuthStore } from '@/stores/auth'

// Private: /admin requires a signed-in staff or admin account.
async function requirePanelAccess(to) {
  const authStore = useAuthStore()

  if (!authStore.initialized) {
    await authStore.initializeAuth()
  }

  if (!authStore.canAccessPanel) {
    return { path: '/admin/login', query: { redirect: to.fullPath } }
  }

  return true
}

// Stricter: account management is admin-only.
async function requireAdmin(to) {
  const accessible = await requirePanelAccess(to)
  if (accessible !== true) return accessible

  const authStore = useAuthStore()
  if (!authStore.isAdmin) {
    return { path: '/admin' }
  }

  return true
}

// Already-authorized staff/admins skip the admin login page.
async function redirectAuthedAdmin(to) {
  const authStore = useAuthStore()

  if (!authStore.initialized) {
    await authStore.initializeAuth()
  }

  if (authStore.canAccessPanel) {
    const redirect =
      typeof to.query.redirect === 'string' && to.query.redirect.startsWith('/admin')
        ? to.query.redirect
        : '/admin'
    return { path: redirect }
  }

  return true
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: HomeView,
      meta: { title: 'Home' },
    },
    {
      path: '/videosubmission',
      name: 'VideoSubmission',
      component: SubmitVideoView,
      meta: { title: 'Video Submission' },
    },
    {
      path: '/submit',
      name: 'RepositorySubmission',
      component: SubmitView,
      meta: { title: 'Repository Submission' },
    },
    {
      path: '/criteria',
      name: 'Criteria',
      component: CriteriaView,
      meta: { title: 'Criteria' },
    },
    {
      path: '/login',
      name: 'Login',
      component: LoginView,
      meta: { title: 'Sign In' },
    },
    {
      path: '/admin/login',
      name: 'AdminLogin',
      component: AdminLogin,
      beforeEnter: redirectAuthedAdmin,
    },
    {
      path: '/admin',
      component: AdminLayout,
      beforeEnter: requirePanelAccess,
      children: [
        {
          path: '',
          name: 'AdminDashboard',
          component: AdminDashboard,
          meta: { title: 'Dashboard' },
        },
        {
          path: 'submissions',
          name: 'AdminRepositorySubmissions',
          component: AdminSubmissions,
          meta: { title: 'Repository Submissions' },
        },
        {
          path: 'videos',
          name: 'AdminVideoSubmissions',
          component: AdminVideos,
          meta: { title: 'Video Submissions' },
        },
        {
          path: 'accounts',
          name: 'AdminAccounts',
          component: AdminAccounts,
          meta: { title: 'Accounts' },
          beforeEnter: requireAdmin,
        },
      ],
    },

  ],
})

export default router
