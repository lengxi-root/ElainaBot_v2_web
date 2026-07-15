export function responsePayload(response) {
  const body = response?.data ?? response ?? {}
  if (!body || typeof body !== 'object') return body
  return Object.prototype.hasOwnProperty.call(body, 'data') ? body.data : body
}

export function responseOk(response) {
  const body = response?.data ?? response ?? {}
  return body?.success !== false
}

export function responseMessage(response, fallback = '') {
  const body = response?.data ?? response ?? {}
  return body?.message || fallback
}
