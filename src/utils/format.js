export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

export function urlHost(url, fallback = '') {
  if (!url) return fallback
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
