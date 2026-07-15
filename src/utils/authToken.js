const TOKEN_KEY = 'elaina_token'
const INVALID_TOKEN_VALUES = new Set(['undefined', 'null'])

export function normalizeAuthToken(value) {
  if (typeof value !== 'string') return ''
  const token = value.trim()
  return token && !INVALID_TOKEN_VALUES.has(token.toLowerCase()) ? token : ''
}

export function getAuthToken() {
  const stored = localStorage.getItem(TOKEN_KEY)
  const token = normalizeAuthToken(stored)
  if (!token && stored !== null) localStorage.removeItem(TOKEN_KEY)
  return token
}

export function setAuthToken(value) {
  const token = normalizeAuthToken(value)
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
  return token
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY)
}
