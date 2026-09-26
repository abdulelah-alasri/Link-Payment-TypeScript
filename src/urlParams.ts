export interface UrlParams {
  language: string
  userIdentifier: string
  fullName: string
  checkoutToken: string
  /** Display name of the hosting app, from `?appName=`. */
  appName: string
}

const APP_NAME_MAX_LEN = 80

/** Trim, strip control chars, cap length. Empty when missing. */
export function sanitizeAppName(raw: string | null | undefined): string {
  const cleaned = (raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
  if (!cleaned) return ''
  return cleaned.length > APP_NAME_MAX_LEN
    ? cleaned.slice(0, APP_NAME_MAX_LEN)
    : cleaned
}

export function parseUrlParams(): UrlParams {
  const q = new URLSearchParams(window.location.search)
  return {
    language: q.get('language') ?? '',
    userIdentifier: q.get('userIdentifier') ?? '',
    fullName: q.get('fullName') ?? '',
    checkoutToken: q.get('checkoutToken') ?? '',
    appName: sanitizeAppName(q.get('appName')),
  }
}
