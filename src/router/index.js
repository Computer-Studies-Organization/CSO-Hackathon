import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import SubmitView from '../views/SubmitView.vue'
import CriteriaView from '../views/CriteriaView.vue'
import LoginView from '../views/Auth/Login.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'HomeView',
      component: HomeView,
    },
    {
      path: '/submit',
      name: 'SubmitView',
      component: SubmitView,
    },
    {
      path: '/criteria',
      name: 'CriteriaView',
      component: CriteriaView,
    },
    {
      path: '/login',
      name: 'LoginView',
      component: LoginView 
    },

  ],
})

export default router
