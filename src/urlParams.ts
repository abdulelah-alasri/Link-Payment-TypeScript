export interface UrlParams {
  language: string
  userIdentifier: string
  fullName: string
  checkoutToken: string
}

export function parseUrlParams(): UrlParams {
  const q = new URLSearchParams(window.location.search)
  return {
    language: q.get('language') ?? '',
    userIdentifier: q.get('userIdentifier') ?? '',
    fullName: q.get('fullName') ?? '',
    checkoutToken: q.get('checkoutToken') ?? '',
  }
}
