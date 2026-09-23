import type {
  PreInitializeData,
  PreInitializeFailureBody,
  PreInitializeResponseBody,
  PaymentMethod,
  AvailableWallet,
} from '../types/payment'

const PRE_INIT_PATH = '/api/public/linkpay/pre-initialize'

export type PreInitializeResult =
  | { ok: true; data: PreInitializeData }
  | { ok: false; kind: 'network'; detail?: string }
  | { ok: false; kind: 'api'; messages: string[]; code?: string }

function getBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '')
}

function mapWalletsToMethods(wallets: AvailableWallet[]): PaymentMethod[] {
  return wallets.map((w, i) => ({
    id: i + 1,
    name: w.name,
    isEnabled: true,
    organizationCode: w.code,
    image: w.imageUrl,
    parametersNames: [],
  }))
}

export function isPreInitializeConfigValid(): boolean {
  return true
}

type LinkPreInitPayload = {
  trxStatus: string
  checkoutToken: string
  amount: { value: number; currency: string }
  merchantName: string
  availableWallets: AvailableWallet[]
  redirectUrl?: string | null
  cancelUrl?: string | null
  orderId?: string
  referenceNumber?: string | null
  merchantAccountNumber?: string | null
}

function activeLanguage(): 'ar' | 'en' {
  const q = new URLSearchParams(window.location.search).get('language')?.toLowerCase() ?? ''
  if (q.startsWith('en')) return 'en'
  if (q.startsWith('ar')) return 'ar'
  return navigator.language.toLowerCase().startsWith('ar') ? 'ar' : 'en'
}

export async function preInitializePayment(
  checkoutToken: string,
): Promise<PreInitializeResult> {
  const baseUrl = getBaseUrl()
  const url = baseUrl === '' ? PRE_INIT_PATH : `${baseUrl}${PRE_INIT_PATH}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        checkoutToken: checkoutToken.trim(),
        language: activeLanguage(),
      }),
    })

    let body: {
      success?: boolean
      data?: LinkPreInitPayload
      messages?: string[]
      code?: string
      message?: string
    }
    try {
      body = (await res.json()) as typeof body
    } catch {
      return { ok: false, kind: 'network', detail: 'Invalid JSON response' }
    }

    if (!res.ok || !body.success || !body.data) {
      const fail = body as PreInitializeFailureBody
      const messages =
        fail.messages?.length
          ? fail.messages
          : body.message
            ? [body.message]
            : [`HTTP ${res.status}`]
      return {
        ok: false,
        kind: 'api',
        messages,
        code: fail.code,
      }
    }

    const raw = body.data
    const availableWallets = raw.availableWallets ?? []
    const merchantName = (raw.merchantName || '').trim() || 'Link Merchant'
    const data: PreInitializeData = {
      trxStatus: raw.trxStatus,
      checkoutToken: raw.checkoutToken,
      trxToken: raw.checkoutToken,
      amount: raw.amount,
      merchantName,
      availableWallets,
      availablePaymentMethods: mapWalletsToMethods(availableWallets),
      miniAppInfo: {
        appId: 'link-pay',
        miniAppId: 0,
        name: merchantName,
        description: merchantName,
        providerName: merchantName,
      },
      appId: 'link-pay',
      orderId: raw.orderId,
      referenceNumber: raw.referenceNumber ?? null,
      redirectUrl: raw.redirectUrl ?? undefined,
      cancelUrl: raw.cancelUrl ?? undefined,
    }
    return { ok: true, data }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return { ok: false, kind: 'network', detail }
  }
}

// silence unused import if tree-shaken oddly
void (0 as unknown as PreInitializeResponseBody)
