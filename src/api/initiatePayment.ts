import type {
  InitiatePaymentData,
  InitiatePaymentFailureBody,
  InitiatePaymentResponseBody,
} from '../types/payment'

const INITIATE_PATH = '/api/public/linkpay/initiate'

export type InitiatePaymentResult =
  | { ok: true; data: InitiatePaymentData }
  | { ok: false; kind: 'network'; detail?: string }
  | { ok: false; kind: 'api'; messages: string[]; code?: string }

function getBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '')
}

export async function initiatePayment(body: {
  checkoutToken: string
  organizationCode: string
  walletId: string
  fullName?: string
}): Promise<InitiatePaymentResult> {
  const baseUrl = getBaseUrl()
  const url = baseUrl === '' ? INITIATE_PATH : `${baseUrl}${INITIATE_PATH}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })

    let parsed: { success?: boolean; data?: { otpRequired?: boolean; expiresAt?: string }; messages?: string[]; code?: string }
    try {
      parsed = (await res.json()) as typeof parsed
    } catch {
      return { ok: false, kind: 'network', detail: 'Invalid JSON response' }
    }

    if (!res.ok || !parsed.success || !parsed.data) {
      const fail = parsed as InitiatePaymentFailureBody
      return {
        ok: false,
        kind: 'api',
        messages: fail.messages?.length ? fail.messages : [`HTTP ${res.status}`],
        code: fail.code,
      }
    }

    const data: InitiatePaymentData = {
      otpRequired: parsed.data.otpRequired !== false,
      extraFields: parsed.data.expiresAt ? { expiresAt: parsed.data.expiresAt } : undefined,
      authenticated: false,
    }
    return { ok: true, data }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return { ok: false, kind: 'network', detail }
  }
}

void (0 as unknown as InitiatePaymentResponseBody)
