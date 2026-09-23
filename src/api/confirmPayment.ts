import type {
  ConfirmPaymentData,
  ConfirmPaymentFailureBody,
  ConfirmPaymentResponseBody,
} from '../types/payment'

const CONFIRM_PATH = '/api/public/linkpay/confirm'

export type ConfirmPaymentResult =
  | { ok: true; data: ConfirmPaymentData }
  | { ok: false; kind: 'network'; detail?: string }
  | { ok: false; kind: 'api'; messages: string[]; code?: string }

function getBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '')
}

export async function confirmPayment(body: {
  checkoutToken: string
  oneTimeCode: string
}): Promise<ConfirmPaymentResult> {
  const baseUrl = getBaseUrl()
  const url = baseUrl === '' ? CONFIRM_PATH : `${baseUrl}${CONFIRM_PATH}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })

    let parsed: {
      success?: boolean
      data?: { trxStatus?: string; transactionId?: string; redirectUrl?: string | null }
      messages?: string[]
      code?: string
    }
    try {
      parsed = (await res.json()) as typeof parsed
    } catch {
      return { ok: false, kind: 'network', detail: 'Invalid JSON response' }
    }

    if (!res.ok || !parsed.success || !parsed.data) {
      const fail = parsed as ConfirmPaymentFailureBody
      return {
        ok: false,
        kind: 'api',
        messages: fail.messages?.length ? fail.messages : [`HTTP ${res.status}`],
        code: fail.code,
      }
    }

    const data: ConfirmPaymentData = {
      trxStatus: parsed.data.trxStatus ?? 'pending',
      trxId: parsed.data.transactionId,
      redirectUrl: parsed.data.redirectUrl ?? undefined,
      gatewayInfo: parsed.data.transactionId
        ? { pgTransactionId: parsed.data.transactionId }
        : undefined,
    }
    return { ok: true, data }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return { ok: false, kind: 'network', detail }
  }
}

void (0 as unknown as ConfirmPaymentResponseBody)
