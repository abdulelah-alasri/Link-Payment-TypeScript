/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MODE?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_PROXY_API_TARGET?: string
  readonly VITE_LINKPAY_HOME?: string
  readonly VITE_LINKPAY_PRIVACY_URL?: string
  readonly VITE_LINKPAY_TERMS_URL?: string
  readonly VITE_LINKPAY_CONTACT_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
