import axios from 'axios'

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
    if (error.response?.status === 401) {
      localStorage.removeItem('elaina_token')
      window.location.href = '/web/login'
    }
    return Promise.reject(error)
  }
)

export default instance
