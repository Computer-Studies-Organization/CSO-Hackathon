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
import JudgesLayout from '../views/Judges/layout.vue'
import JudgesLogin from '../views/Judges/Login.vue'
import JudgesDashboard from '../views/Judges/Dashboard.vue'
import JudgesRepository from '../views/Judges/Repository.vue'
import JudgesVideos from '../views/Judges/Videos.vue'
import JudgesCriteria from '../views/Judges/Criteria.vue'
import JudgesScoring from '../views/Judges/Scoring.vue'
import AdminScores from '../views/Admin/Scores.vue'
import { useAuthStore } from '@/stores/auth'

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
      path: '/judges/login',
      name: 'JudgesLogin',
      component: JudgesLogin,
      beforeEnter: redirectAuthedJudge,
      meta: { title: 'Judge Sign In' },
    },
    {
      path: '/judges',
      component: JudgesLayout,
      beforeEnter: requireJudgeAccess,
      children: [
        {
          path: '',
          name: 'JudgesDashboard',
          component: JudgesDashboard,
          meta: { title: 'Dashboard' },
        },
        {
          path: 'repository',
          name: 'JudgesRepository',
          component: JudgesRepository,
          meta: { title: 'Repository Submissions' },
        },
        {
          path: 'videos',
          name: 'JudgesVideos',
          component: JudgesVideos,
          meta: { title: 'Video Submissions' },
        },
        {
          path: 'criteria',
          name: 'JudgesCriteria',
          component: JudgesCriteria,
          meta: { title: 'Judging Criteria' },
        },
        {
          path: 'scoring',
          name: 'JudgesScoring',
          component: JudgesScoring,
          meta: { title: 'Scoring' },
        },
      ],
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
          path: 'scores',
          name: 'AdminScores',
          component: AdminScores,
          meta: { title: 'Scores' },
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
