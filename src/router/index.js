import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { guest: true },
  },
  {
    path: '/',
    component: () => import('../views/Layout.vue'),
    meta: { auth: true },
    children: [
      { path: '', name: 'Dashboard', component: () => import('../views/Dashboard.vue') },
      { path: 'logs', name: 'Logs', component: () => import('../views/Logs.vue') },
      { path: 'plugins', name: 'Plugins', component: () => import('../views/Plugins.vue') },
      { path: 'messages', name: 'Messages', component: () => import('../views/Messages.vue') },
      { path: 'statistics', name: 'Statistics', component: () => import('../views/Statistics.vue') },
      { path: 'market', name: 'Market', component: () => import('../views/Market.vue') },
      { path: 'update', name: 'Update', component: () => import('../views/Update.vue') },
      { path: 'database', name: 'Database', component: () => import('../views/Database.vue') },
      { path: 'config', name: 'Config', component: () => import('../views/Config.vue') },
      { path: 'openapi', name: 'OpenAPI', component: () => import('../views/OpenAPI.vue') },
      { path: 'custom/:key', name: 'CustomPage', component: () => import('../views/CustomPage.vue') },
    ],
  },
]

const router = createRouter({
  history: createWebHistory('/web/'),
  routes,
})

const CHUNK_RELOAD_KEY = 'elaina_chunk_reload'
const CHUNK_LOAD_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|Expected a JavaScript-or-Wasm module script|does not provide an export named/i

router.onError((error, to) => {
  if (!CHUNK_LOAD_ERROR.test(String(error?.message || error))) return
  const target = to?.fullPath || router.currentRoute.value.fullPath || '/'
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === target) return
  sessionStorage.setItem(CHUNK_RELOAD_KEY, target)
  window.location.assign(router.resolve(target).href)
})

router.afterEach(to => {
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === to.fullPath) {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY)
  }
})

router.beforeEach((to, from, next) => {
  const auth = useAuthStore()
  if (to.meta.auth && !auth.isLoggedIn) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
  } else if (to.meta.guest && auth.isLoggedIn) {
    next({ name: 'Dashboard' })
  } else {
    next()
  }
})

export default router
