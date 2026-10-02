import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import { useAuthStore } from '@/stores/auth'

// Panel/auth views are lazy-loaded (one chunk each) so the initial load only
// carries the shell + landing page instead of the whole app.

// Private: /admin requires a signed-in admin or superadmin account.
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

// Private: /judges requires a signed-in judge account.
async function requireJudgeAccess(to) {
  const authStore = useAuthStore()

  if (!authStore.initialized) {
    await authStore.initializeAuth()
  }

  if (!authStore.canAccessJudges) {
    return { path: '/judges/login', query: { redirect: to.fullPath } }
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

// Already-authorized admins skip the admin login page. Judges who land
// here are bounced to their own panel instead.
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

  if (authStore.canAccessJudges) {
    return { path: '/judges' }
  }

  return true
}

// Already-authorized judges skip the judges login page. Admins who land
// here are bounced to their own panel instead.
async function redirectAuthedJudge(to) {
  const authStore = useAuthStore()

  if (!authStore.initialized) {
    await authStore.initializeAuth()
  }

  if (authStore.canAccessJudges) {
    const redirect =
      typeof to.query.redirect === 'string' && to.query.redirect.startsWith('/judges')
        ? to.query.redirect
        : '/judges'
    return { path: redirect }
  }

  if (authStore.canAccessPanel) {
    return { path: '/admin' }
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
      component: () => import('../views/SubmitVideoView.vue'),
      meta: { title: 'Video Submission' },
    },
    {
      path: '/submit',
      name: 'RepositorySubmission',
      component: () => import('../views/SubmitView.vue'),
      meta: { title: 'Repository Submission' },
    },
    {
      path: '/criteria',
      name: 'Criteria',
      component: () => import('../views/CriteriaView.vue'),
      meta: { title: 'Criteria' },
    },
    {
      path: '/login',
      name: 'Login',
      component: () => import('../views/Auth/Login.vue'),
      meta: { title: 'Sign In' },
    },
    {
      path: '/admin/login',
      name: 'AdminLogin',
      component: () => import('../views/Admin/Login.vue'),
      beforeEnter: redirectAuthedAdmin,
    },
    {
      path: '/judges/login',
      name: 'JudgesLogin',
      component: () => import('../views/Judges/Login.vue'),
      beforeEnter: redirectAuthedJudge,
      meta: { title: 'Judge Sign In' },
    },
    {
      path: '/judges',
      component: () => import('../views/Judges/layout.vue'),
      beforeEnter: requireJudgeAccess,
      children: [
        {
          path: '',
          name: 'JudgesDashboard',
          component: () => import('../views/Judges/Dashboard.vue'),
          meta: { title: 'Dashboard' },
        },
        {
          path: 'repository',
          name: 'JudgesRepository',
          component: () => import('../views/Judges/Repository.vue'),
          meta: { title: 'Repository Submissions' },
        },
        {
          path: 'videos',
          name: 'JudgesVideos',
          component: () => import('../views/Judges/Videos.vue'),
          meta: { title: 'Video Submissions' },
        },
        {
          path: 'criteria',
          name: 'JudgesCriteria',
          component: () => import('../views/Judges/Criteria.vue'),
          meta: { title: 'Judging Criteria' },
        },
        {
          path: 'scoring',
          name: 'JudgesScoring',
          component: () => import('../views/Judges/Scoring.vue'),
          meta: { title: 'Scoring' },
        },
      ],
    },
    {
      path: '/admin',
      component: () => import('../views/Admin/layout.vue'),
      beforeEnter: requirePanelAccess,
      children: [
        {
          path: '',
          name: 'AdminDashboard',
          component: () => import('../views/Admin/Dashboard.vue'),
          meta: { title: 'Dashboard' },
        },
        {
          path: 'submissions',
          name: 'AdminRepositorySubmissions',
          component: () => import('../views/Admin/Submissions.vue'),
          meta: { title: 'Repository Submissions' },
        },
        {
          path: 'videos',
          name: 'AdminVideoSubmissions',
          component: () => import('../views/Admin/Videos.vue'),
          meta: { title: 'Video Submissions' },
        },
        {
          path: 'scores',
          name: 'AdminScores',
          component: () => import('../views/Admin/Scores.vue'),
          meta: { title: 'Scores' },
        },
        {
          path: 'accounts',
          name: 'AdminAccounts',
          component: () => import('../views/Admin/Accounts.vue'),
          meta: { title: 'Accounts' },
          beforeEnter: requireAdmin,
        },
      ],
    },

  ],
})

export default router
