import type { Translator } from '../i18n'
import { goBack } from '../logics/navigation/goBack'
import { isAllowedMerchantNavigationUrl } from '../util/navigationUrl'
import { publicAssetUrl } from '../util/publicAsset'

export type AppPhase =
  | 'loading'
  | 'error'
  | 'checkout'
  | 'completed'
  | 'paymentSuccess'

export interface SiteFooterOptions {
  translator: Translator
  phase: AppPhase
  merchantName?: string
  /**
   * Hosting app name from URL `appName`.
   * When set, cancel/return is shown above the footer links on payment phases.
   */
  appName?: string | null
  /**
   * Return/cancel URL from checkout session (platform BFF / merchant),
   * typically `cancelUrl` from pre-initialize.
   */
  cancelHref?: string | null
  /** When set, adds `app-layout--{modifier}` (e.g. fixed header/footer checkout). */
  layoutModifier?: string
}

const LANG_OPTIONS: { code: 'en' | 'ar'; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
]

function linkpayUrls(): {
  home: string
  privacy: string
  terms: string
  contact: string
} {
  const home =
    import.meta.env.VITE_LINKPAY_HOME?.trim() || 'https://www.tharwatt.com/'
  const privacy =
    import.meta.env.VITE_LINKPAY_PRIVACY_URL?.trim() ||
    'https://www.tharwatt.com/%d8%b3%d9%8a%d8%a7%d8%b3%d8%a9-%d8%a7%d9%84%d8%ae%d8%b5%d9%88%d8%b5%d9%8a%d8%a9'
  const terms =
    import.meta.env.VITE_LINKPAY_TERMS_URL?.trim() || privacy
  const contact =
    import.meta.env.VITE_LINKPAY_CONTACT_URL?.trim() ||
    'https://www.tharwatt.com/#contact-us'
  return { home, privacy, terms, contact }
}

function applyLanguageParam(code: string): void {
  const q = new URLSearchParams(window.location.search)
  q.set('language', code)
  const next = `${window.location.pathname}?${q.toString()}${window.location.hash}`
  window.location.assign(next)
}

type CancelRowModel =
  | { mode: 'hidden' }
  | { mode: 'link'; href: string; text: string }
  | { mode: 'button'; text: string }

function isPaymentPhase(phase: AppPhase): boolean {
  return (
    phase === 'checkout' ||
    phase === 'completed' ||
    phase === 'paymentSuccess'
  )
}

/**
 * Prefer URL `appName` for cancel label on all payment steps.
 * Falls back to session `cancelUrl` + merchant name when appName is absent.
 */
function cancelRowModel(opts: SiteFooterOptions): CancelRowModel {
  if (!isPaymentPhase(opts.phase)) {
    return { mode: 'hidden' }
  }

  const appName = opts.appName?.trim()
  const cancelHref = opts.cancelHref?.trim()
  const hrefOk = isAllowedMerchantNavigationUrl(cancelHref)

  if (appName) {
    const text = opts.translator.t('cancelReturnTo', { merchant: appName })
    if (hrefOk) return { mode: 'link', href: cancelHref!, text }
    return { mode: 'button', text }
  }

  if (!hrefOk) {
    return { mode: 'hidden' }
  }
  const merchant = opts.merchantName?.trim()
  const text = merchant
    ? opts.translator.t('cancelReturnTo', { merchant })
    : opts.translator.t('cancelReturnPlatform')
  return { mode: 'link', href: cancelHref!, text }
}

const yemenFlagSvg = `<svg class="footer-flag" width="26" height="17" viewBox="0 0 26 17" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <rect width="26" height="5.67" fill="#CE1126"/>
  <rect y="5.67" width="26" height="5.66" fill="#fff"/>
  <rect y="11.33" width="26" height="5.67" fill="#000"/>
</svg>`

const chevronSvg = `<svg class="footer-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`

export function renderSiteFooter(
  footer: HTMLElement,
  opts: SiteFooterOptions,
): void {
  footer.replaceChildren()
  const { translator: tr } = opts
  const urls = linkpayUrls()

  const cancelRow = document.createElement('div')
  cancelRow.className = 'footer-row footer-row--cancel'
  const cancelCfg = cancelRowModel(opts)

  if (cancelCfg.mode === 'link') {
    const cancel = document.createElement('a')
    cancel.className = 'footer-cancel-link'
    cancel.href = cancelCfg.href
    cancel.rel = 'noopener noreferrer'
    cancel.textContent = cancelCfg.text
    cancelRow.appendChild(cancel)
    footer.appendChild(cancelRow)
  } else if (cancelCfg.mode === 'button') {
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'footer-cancel-link'
    cancel.textContent = cancelCfg.text
    cancel.addEventListener('click', () => {
      goBack()
    })
    cancelRow.appendChild(cancel)
    footer.appendChild(cancelRow)
  }

  const linksRow = document.createElement('div')
  linksRow.className = 'footer-row footer-row--links'

  const brandLink = document.createElement('a')
  brandLink.className = 'footer-bas-link'
  brandLink.href = urls.home
  brandLink.rel = 'noopener noreferrer'
  brandLink.target = '_blank'
  brandLink.setAttribute('aria-label', tr.t('linkPlatformLink'))
  const brandImg = document.createElement('img')
  brandImg.src = publicAssetUrl('logo.svg')
  brandImg.alt = ''
  brandImg.decoding = 'async'
  brandLink.appendChild(brandImg)
  linksRow.appendChild(brandLink)

  linksRow.appendChild(textSep())

  linksRow.appendChild(
    inlineLink(urls.privacy, tr.t('privacyPolicy'), false),
  )
  linksRow.appendChild(textSep())
  linksRow.appendChild(inlineLink(urls.terms, tr.t('termsAndConditions'), false))
  linksRow.appendChild(textSep())
  linksRow.appendChild(
    inlineLink(urls.contact, tr.t('contactUs'), true),
  )

  linksRow.appendChild(textSep())

  const langWrap = document.createElement('div')
  langWrap.className = 'footer-lang'

  const triggerRow = document.createElement('div')
  triggerRow.className = 'footer-lang-trigger-row'

  LANG_OPTIONS.forEach((opt, i) => {
    if (i > 0) triggerRow.appendChild(textSep())
    const lab = document.createElement('button')
    lab.type = 'button'
    lab.className = 'footer-lang-label'
    if (opt.code === tr.lang) lab.classList.add('is-active')
    lab.textContent = opt.label
    lab.addEventListener('click', () => {
      if (opt.code !== tr.lang) applyLanguageParam(opt.code)
    })
    triggerRow.appendChild(lab)
  })

  triggerRow.appendChild(textSep())

  const panel = document.createElement('div')
  panel.className = 'footer-lang-panel footer-lang-panel--popup'
  panel.hidden = true
  panel.setAttribute('role', 'menu')

  LANG_OPTIONS.forEach((opt) => {
    const optBtn = document.createElement('button')
    optBtn.type = 'button'
    optBtn.className = 'footer-lang-option'
    optBtn.setAttribute('role', 'menuitem')
    if (opt.code === tr.lang) optBtn.classList.add('is-active')
    optBtn.textContent = opt.label
    optBtn.addEventListener('click', () => {
      if (opt.code !== tr.lang) applyLanguageParam(opt.code)
      closeLangPanel()
    })
    panel.appendChild(optBtn)
  })

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'footer-lang-toggle'
  toggle.setAttribute('aria-expanded', 'false')
  toggle.setAttribute('aria-haspopup', 'true')
  toggle.setAttribute('aria-label', 'Language')
  const tail = document.createElement('span')
  tail.className = 'footer-lang-tail'
  tail.innerHTML = `${yemenFlagSvg}${chevronSvg}`
  toggle.appendChild(tail)

  function closeLangPanel(): void {
    panel.hidden = true
    toggle.classList.remove('is-open')
    toggle.setAttribute('aria-expanded', 'false')
    document.removeEventListener('mousedown', onDocDown)
  }

  function openLangPanel(): void {
    document.removeEventListener('mousedown', onDocDown)
    panel.hidden = false
    toggle.classList.add('is-open')
    toggle.setAttribute('aria-expanded', 'true')
    queueMicrotask(() => {
      document.addEventListener('mousedown', onDocDown)
    })
  }

  function onDocDown(ev: MouseEvent): void {
    if (!langWrap.contains(ev.target as Node)) {
      closeLangPanel()
    }
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation()
    if (panel.hidden) openLangPanel()
    else closeLangPanel()
  })

  triggerRow.appendChild(toggle)
  langWrap.appendChild(triggerRow)
  langWrap.appendChild(panel)

  linksRow.appendChild(langWrap)
  footer.appendChild(linksRow)
}

function textSep(): HTMLSpanElement {
  const s = document.createElement('span')
  s.className = 'footer-sep'
  s.textContent = '|'
  return s
}

function inlineLink(
  href: string,
  text: string,
  accent: boolean,
): HTMLAnchorElement {
  const a = document.createElement('a')
  a.className = accent
    ? 'footer-inline-link footer-inline-link--accent'
    : 'footer-inline-link'
  a.href = href
  a.rel = 'noopener noreferrer'
  a.target = '_blank'
  a.textContent = text
  return a
}
