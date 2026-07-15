import axios from 'axios'
import { responseMessage } from './api'

const instance = axios.create({
  baseURL: '',
  timeout: 30000,
})

instance.interceptors.request.use(config => {
  const token = localStorage.getItem('elaina_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

instance.interceptors.response.use(
  res => res,
  error => {
    error.normalizedMessage = responseMessage(error.response, error.message || '请求失败')
    if (error.response?.status === 401 && error.config?.url !== '/api/auth/login') {
      localStorage.removeItem('elaina_token')
      window.location.href = '/web/login'
    }
    return Promise.reject(error)
  }
)

export default instance
