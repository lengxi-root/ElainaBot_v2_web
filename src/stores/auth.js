import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from '../utils/axios'
import { responseMessage, responsePayload, responseOk } from '../utils/api'
import { clearAuthToken, getAuthToken, setAuthToken } from '../utils/authToken'

const WEAK_PASSWORDS = new Set(['admin', '123456', 'password', 'admin123', '12345678'])

export const useAuthStore = defineStore('auth', () => {
  const token = ref(getAuthToken())
  const isLoggedIn = computed(() => !!token.value)
  const isWeakPassword = ref(localStorage.getItem('elaina_weak_pwd') === '1')

  async function login(password) {
    try {
      const res = await axios.post('/api/auth/login', { password })
      const data = responsePayload(res)
      if (responseOk(res)) {
        token.value = setAuthToken(data?.token)
        if (!token.value) throw new Error('登录响应缺少有效令牌')
        setWeakPassword(WEAK_PASSWORDS.has(password))
        return true
      }
      throw new Error(responseMessage(res, '登录失败'))
    } catch (e) {
      const msg = e.normalizedMessage || responseMessage(e.response, e.message || '登录失败')
      throw new Error(msg)
    }
  }

  function setWeakPassword(weak) {
    isWeakPassword.value = weak
    if (weak) localStorage.setItem('elaina_weak_pwd', '1')
    else localStorage.removeItem('elaina_weak_pwd')
  }

  function logout() {
    token.value = ''
    clearAuthToken()
    localStorage.removeItem('elaina_weak_pwd')
    isWeakPassword.value = false
  }

  async function checkSession() {
    if (!token.value) return false
    try {
      return responseOk(await axios.get('/api/auth/check'))
    } catch {
      logout()
      return false
    }
  }

  return { token, isLoggedIn, isWeakPassword, setWeakPassword, login, logout, checkSession }
})
