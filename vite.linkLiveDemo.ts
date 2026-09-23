/**
 * Live Link Merchant BFF for local SPA preview (demo checkoutToken).
 * Handles pre-initialize, initiate, and confirm without platform-api / Postgres.
 * Uses the same Authenticate + companies + accounts + OTP calls as Postman / LinkCheckoutService.
 */
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Connect, Plugin } from 'vite'

const UA = 'AysaliLinkPay/1.0 (compatible; PostmanRuntime/7.43.0)'

const DEMO_TOKENS = new Set([
  'demo',
  '11111111-1111-4111-8111-111111111111',
])

const LINKPAY_PATHS = [
  '/api/public/linkpay/pre-initialize',
  '/api/public/linkpay/initiate',
  '/api/public/linkpay/confirm',
] as const

type LinkPayPath = (typeof LINKPAY_PATHS)[number]

type DemoSession = {
  requestId: string
  referenceNumber: string
  authorizationId: string
  organizationCode: string
  amountYer: number
  walletId: string
  expiresAt: string | null
}

/** In-memory OTP session between demo initiate → confirm (dev server process only). */
const demoSessions = new Map<string, DemoSession>()

function readEnvFiles(cwd: string): Record<string, string> {
  const out: Record<string, string> = {}
  const candidates = [
    path.join(cwd, '.env'),
    path.join(cwd, '..', 'Aysali.Solutions', 'apps', 'platform-api', '.env'),
  ]
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('#') || !t.includes('=')) continue
      const i = t.indexOf('=')
      const k = t.slice(0, i).trim()
      let v = t.slice(i + 1).trim()
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1)
      }
      if (!(k in out)) out[k] = v
    }
  }
  return out
}

function isDemoToken(token: string): boolean {
  return DEMO_TOKENS.has(token.trim().toLowerCase())
}

function matchLinkPayPath(url: string | undefined): LinkPayPath | null {
  if (!url) return null
  const pathOnly = url.split('?')[0] ?? url
  for (const p of LINKPAY_PATHS) {
    if (pathOnly === p || pathOnly.startsWith(`${p}?`)) return p
  }
  // startsWith for query-less exact paths already covered; allow prefix without query
  for (const p of LINKPAY_PATHS) {
    if (pathOnly.startsWith(p)) return p
  }
  return null
}

async function readJsonBody(req: Connect.IncomingMessage): Promise<{
  raw: Buffer
  body: Record<string, unknown>
}> {
  const chunks: Buffer[] = []
  for await (const c of req) {
    chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
  }
  const raw = Buffer.concat(chunks)
  let body: Record<string, unknown> = {}
  try {
    body = JSON.parse(raw.toString('utf8') || '{}') as Record<string, unknown>
  } catch {
    body = {}
  }
  return { raw, body }
}

function jsonResponse(
  res: Connect.ServerResponse,
  status: number,
  payload: unknown,
): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function isTransientFetchError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  const msg = e.message.toLowerCase()
  if (msg.includes('fetch failed') || msg.includes('other side closed')) return true
  const cause = e.cause as { code?: string } | undefined
  return cause?.code === 'UND_ERR_SOCKET' || cause?.code === 'ECONNRESET'
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

async function linkFetch(
  base: string,
  token: string | null,
  method: string,
  urlPath: string,
  headers: Record<string, string> = {},
  body?: unknown,
  retries = 3,
) {
  let lastError: unknown
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${base}${urlPath}`, {
        method,
        headers: {
          Accept: 'application/json',
          'User-Agent': UA,
          Connection: 'close',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body != null ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body != null ? JSON.stringify(body) : undefined,
      })
      const text = await res.text()
      let json: Record<string, unknown>
      try {
        json = JSON.parse(text) as Record<string, unknown>
      } catch {
        json = { raw: text.slice(0, 400) }
      }
      return { ok: res.ok, status: res.status, json, text }
    } catch (e) {
      lastError = e
      if (!isTransientFetchError(e) || attempt === retries) throw e
      await sleep(400 * attempt)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function unwrapList(envelope: Record<string, unknown> | undefined): unknown[] {
  if (Array.isArray(envelope?.entities)) return envelope.entities as unknown[]
  if (Array.isArray(envelope?.entity)) return envelope.entity as unknown[]
  if (envelope?.entity && typeof envelope.entity === 'object') {
    return [envelope.entity]
  }
  return []
}

function metaMap(meta: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!Array.isArray(meta)) return out
  for (const row of meta) {
    if (!row || typeof row !== 'object') continue
    const key = String((row as { key?: unknown }).key ?? '').trim()
    const value = String((row as { value?: unknown }).value ?? '').trim()
    if (key) out[key] = value
  }
  return out
}

function isLinkSuccess(code: unknown, success: unknown): boolean {
  if (success === true) return true
  if (success === false) return false
  return code === '2000' || code === '200'
}

function transactionStatusIsSuccess(status: unknown): boolean {
  if (status === 1 || status === '1') return true
  const s = String(status ?? '').toLowerCase()
  return s === 'success' || s === 'completed' || s === '1'
}

function transactionStatusIsFailed(status: unknown): boolean {
  if (status === 2 || status === '2') return true
  const s = String(status ?? '').toLowerCase()
  return s === 'failed' || s === 'rejected' || s === 'cancelled' || s === 'canceled'
}

function generateReferenceNumber(): string {
  const n = Date.now().toString().slice(-8)
  const r = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0')
  return `${n}${r}`.slice(0, 11)
}

async function authenticateLink(cwd: string): Promise<{
  env: Record<string, string>
  base: string
  token: string
}> {
  const env = readEnvFiles(cwd)
  const base = (env.LINK_API_BASE_URL || 'https://api-test.tharwatt.com:5223').replace(
    /\/$/,
    '',
  )
  const clientId = env.LINK_CLIENT_ID || 'open-app'
  const clientSecret = env.LINK_CLIENT_SECRET || '123456'

  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  })

  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const authRes = await fetch(`${base}/accounts/v1/authenticate/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': UA,
          Connection: 'close',
        },
        body: form.toString(),
      })
      const authJson = (await authRes.json()) as {
        entity?: { access_token?: string }
        access_token?: string
        message?: string
      }
      const token =
        authJson?.entity?.access_token || authJson?.access_token || null
      if (!token) {
        throw new Error(`Link auth failed: ${authJson?.message || authRes.status}`)
      }
      return { env, base, token }
    } catch (e) {
      lastError = e
      if (!isTransientFetchError(e) || attempt === 3) {
        if (e instanceof Error && !isTransientFetchError(e)) throw e
        if (attempt === 3) throw e
      }
      await sleep(400 * attempt)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function previewAmountYer(env: Record<string, string>): number {
  const previewAmount = Number(env.LINK_PREVIEW_AMOUNT_YER || '5400')
  return Number.isFinite(previewAmount) && previewAmount >= 1
    ? Math.round(previewAmount)
    : 5400
}

export async function buildLiveDemoCatalog(cwd: string, language = 'ar') {
  const { env, base, token } = await authenticateLink(cwd)
  const merchantOrg = (env.LINK_MERCHANT_ORG_CODE || 'Easy').trim()
  const merchantAccount = (env.LINK_MERCHANT_ACCOUNT_ID || '').trim()
  const amountYer = previewAmountYer(env)

  const companiesRes = await linkFetch(base, token, 'GET', '/v1/data', {
    'X-API-Domain': 'payment',
    'X-API-SubDomain': 'companies',
    'X-API-ServiceName': 'get',
  })
  const accountsRes = await linkFetch(base, token, 'GET', '/v1/data', {
    'X-API-Domain': 'merchant',
    'X-API-SubDomain': 'accounts',
    'X-API-ServiceName': 'get',
  })

  const companies: Array<{
    code: string
    name: string
    nameAr?: string
    nameEn?: string
    imageUrl?: string
  }> = []
  for (const row of unwrapList(companiesRes.json)) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const code = String(r.code ?? '').trim()
    if (!code || r.isActive === false) continue
    const sector = r.sectorType
    const isWallet =
      sector === 0 || sector === '0' || String(sector).toLowerCase() === 'wallets'
    if (!isWallet) continue
    const nameAr = typeof r.name === 'string' ? r.name.trim() : undefined
    const nameEn = typeof r.nameEn === 'string' ? r.nameEn.trim() : undefined
    companies.push({
      code,
      name: nameEn || nameAr || code,
      nameAr,
      nameEn,
      imageUrl: typeof r.imageUrl === 'string' ? r.imageUrl.trim() : undefined,
    })
  }

  let accountNumber =
    merchantAccount && merchantAccount !== 'CHANGE_ME' ? merchantAccount : null
  let companyCode = merchantOrg
  for (const row of unwrapList(accountsRes.json)) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    if (r.isActive === false) continue
    const meta = metaMap(r.metaData)
    const cc = (meta.companyCode || '').trim()
    const an = (meta.accountNumber || '').trim()
    if (!accountNumber && an) {
      accountNumber = an
      companyCode = cc || companyCode
    }
    if (cc.toLowerCase() === merchantOrg.toLowerCase() && an) {
      accountNumber =
        merchantAccount && merchantAccount !== 'CHANGE_ME' ? merchantAccount : an
      companyCode = cc
    }
  }

  const byCode = new Map(companies.map((c) => [c.code.toLowerCase(), c]))
  const merchantCo = byCode.get(String(companyCode).toLowerCase())
  const merchantLabel =
    (language === 'ar'
      ? merchantCo?.nameAr || merchantCo?.name
      : merchantCo?.nameEn || merchantCo?.name) ||
    merchantCo?.name ||
    merchantOrg
  // Do not append merchant account id to the display name — users confuse it with the payer wallet.
  const merchantName = merchantLabel

  let wallets = companies.map((c) => ({
    code: c.code,
    name:
      (language === 'ar' ? c.nameAr || c.nameEn || c.name : c.nameEn || c.nameAr || c.name) ||
      c.code,
    nameAr: c.nameAr,
    imageUrl: c.imageUrl,
  }))

  const allowRaw = (env.LINK_WALLET_ORG_CODES || '*').trim()
  if (allowRaw && allowRaw !== '*') {
    const allow = new Set(
      allowRaw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    )
    const filtered = wallets.filter((w) => allow.has(w.code.toLowerCase()))
    if (filtered.length) wallets = filtered
  }

  return {
    success: true,
    data: {
      trxStatus: 'pending',
      checkoutToken: 'demo',
      amount: { value: amountYer, currency: 'YER' },
      merchantName,
      availableWallets: wallets,
      redirectUrl: null,
      cancelUrl: null,
      orderId: 'demo',
      referenceNumber: null,
      merchantAccountNumber: accountNumber,
    },
  }
}

async function demoInitiate(
  cwd: string,
  body: Record<string, unknown>,
): Promise<{ success: true; data: { otpRequired: true; expiresAt?: string } }> {
  const organizationCode = String(body.organizationCode ?? '').trim()
  const walletId = String(body.walletId ?? '').trim()
  const fullName =
    (typeof body.fullName === 'string' && body.fullName.trim()) || 'Customer'
  if (!organizationCode || !walletId) {
    throw new Error('organizationCode and walletId are required')
  }

  const { env, base, token } = await authenticateLink(cwd)
  const amountYer = previewAmountYer(env)
  const merchantOrg = (env.LINK_MERCHANT_ORG_CODE || 'Easy').trim()
  const merchantAccountId = (env.LINK_MERCHANT_ACCOUNT_ID || '').trim()
  if (!merchantAccountId || merchantAccountId === 'CHANGE_ME') {
    throw new Error('LINK_MERCHANT_ACCOUNT_ID is not configured')
  }
  const beneficiaryAccountType =
    (env.LINK_BENEFICIARY_ACCOUNT_TYPE || 'WalletId').trim() || 'WalletId'
  const tokenNumber = (env.LINK_TOKEN_NUMBER || '').trim() || null

  const requestId = randomUUID()
  const referenceNumber = generateReferenceNumber()
  const walletDigits = walletId.replace(/\D/g, '')
  const mobile = walletDigits

  const nameParts = fullName.trim().split(/\s+/).filter(Boolean)
  const firstName = nameParts[0] ?? 'Customer'
  const secondName = nameParts[1] ?? firstName
  const thirdName = nameParts[2] ?? secondName
  const familyName =
    nameParts[3] ?? nameParts[nameParts.length - 1] ?? firstName

  const initiateBody: Record<string, unknown> = {
    requestId,
    referenceNumber,
    currencyCode: 'YER',
    amount: amountYer,
    amountType: 2,
    captureMode: 'MANUAL',
    isBeneficiaryInitiated: true,
    source: {
      organizationCode,
      accountType: 'WalletId',
      accountId: walletDigits,
      subAccountId: walletDigits,
    },
    beneficiary: {
      organizationCode: merchantOrg,
      accountType: beneficiaryAccountType,
      accountId: merchantAccountId,
      subAccountId: merchantAccountId,
    },
    senderKYC: {
      firstName,
      secondName,
      thirdName,
      familyName,
      mobileNumber: mobile,
      IdNumber: '',
      IdType: '1',
      gendar: 'male',
    },
    notes: 'Aysali demo payment',
    expireDate: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  }
  if (tokenNumber) initiateBody.tokenNumber = tokenNumber

  const initRes = await linkFetch(
    base,
    token,
    'POST',
    '/v1/transactionrequests',
    {
      'X-API-Domain': 'payment',
      'X-API-SubDomain': 'pos.wallets.payments',
      'X-API-ServiceName': 'initiate',
    },
    initiateBody,
  )

  if (!initRes.status || initRes.status >= 400 || !isLinkSuccess(initRes.json.responseCode, initRes.json.success)) {
    const msg =
      (typeof initRes.json.message === 'string' && initRes.json.message) ||
      `Link initiate HTTP ${initRes.status}`
    const err = new Error(msg) as Error & { statusCode?: number }
    // Business declines from Link (e.g. unknown wallet) — not an upstream gateway outage.
    err.statusCode = 400
    throw err
  }

  const entity =
    initRes.json.entity && typeof initRes.json.entity === 'object'
      ? (initRes.json.entity as Record<string, unknown>)
      : {}
  const authorizationId =
    String(entity.reSourceToken ?? '').trim() ||
    String(entity.unifiedToken ?? '').trim()
  if (!authorizationId) {
    throw new Error('Link initiate did not return an authorization token')
  }

  const resolvedRequestId = String(entity.requestId ?? requestId)
  const resolvedReference = String(entity.referenceNumber ?? referenceNumber)
  const expiresAt =
    typeof entity.expiryDate === 'string' ? entity.expiryDate : null

  const checkoutKey = String(body.checkoutToken ?? 'demo').trim().toLowerCase()
  demoSessions.set(checkoutKey, {
    requestId: resolvedRequestId,
    referenceNumber: resolvedReference,
    authorizationId,
    organizationCode,
    amountYer,
    walletId: walletDigits,
    expiresAt,
  })

  return {
    success: true,
    data: {
      otpRequired: true,
      ...(expiresAt ? { expiresAt } : {}),
    },
  }
}

async function demoConfirm(
  cwd: string,
  body: Record<string, unknown>,
): Promise<{
  success: true
  data: {
    trxStatus: string
    transactionId?: string
    redirectUrl: null
  }
}> {
  const checkoutKey = String(body.checkoutToken ?? 'demo').trim().toLowerCase()
  const oneTimeCode = String(body.oneTimeCode ?? '').trim()
  if (!oneTimeCode) {
    throw new Error('oneTimeCode is required')
  }

  const session = demoSessions.get(checkoutKey)
  if (!session) {
    throw new Error('Link payment was not initiated')
  }

  const { base, token } = await authenticateLink(cwd)
  const confirmBody = {
    requestId: session.requestId,
    referenceNumber: session.referenceNumber,
    currencyCode: 'YER',
    amount: session.amountYer,
    organizationCode: session.organizationCode,
    autherizationType: 'Token',
    autherizationId: session.authorizationId,
    oneTimeCode,
  }

  const confirmRes = await linkFetch(
    base,
    token,
    'POST',
    '/v1/transactions',
    {
      'X-API-Domain': 'payment',
      'X-API-SubDomain': 'pos.wallets.payments',
      'X-API-ServiceName': 'confirm',
    },
    confirmBody,
  )

  if (!confirmRes.status || confirmRes.status >= 400) {
    const msg =
      (typeof confirmRes.json.message === 'string' && confirmRes.json.message) ||
      `Link confirm HTTP ${confirmRes.status}`
    throw new Error(msg)
  }
  if (!isLinkSuccess(confirmRes.json.responseCode, confirmRes.json.success)) {
    const msg =
      (typeof confirmRes.json.message === 'string' && confirmRes.json.message) ||
      'Payment confirmation failed'
    throw new Error(msg)
  }

  const entity =
    confirmRes.json.entity && typeof confirmRes.json.entity === 'object'
      ? (confirmRes.json.entity as Record<string, unknown>)
      : {}
  const status = entity.transactionStatus
  const success = transactionStatusIsSuccess(status)
  const failed = transactionStatusIsFailed(status)
  const transactionId =
    typeof entity.transactionId === 'string'
      ? entity.transactionId.trim()
      : undefined

  if (failed) {
    demoSessions.delete(checkoutKey)
    return {
      success: true,
      data: { trxStatus: 'failed', redirectUrl: null },
    }
  }
  if (!success) {
    throw new Error('Payment confirmation is still pending. Please try again.')
  }

  demoSessions.delete(checkoutKey)
  return {
    success: true,
    data: {
      trxStatus: 'completed',
      ...(transactionId ? { transactionId } : {}),
      redirectUrl: null,
    },
  }
}

/** Forward buffered body to platform-api when checkoutToken is not demo. */
async function forwardToPlatformApi(
  cwd: string,
  req: Connect.IncomingMessage,
  res: Connect.ServerResponse,
  raw: Buffer,
): Promise<void> {
  const env = readEnvFiles(cwd)
  const target = (env.VITE_PROXY_API_TARGET || 'http://localhost:3000').replace(
    /\/$/,
    '',
  )
  const urlPath = req.url || '/'
  try {
    const upstream = await fetch(`${target}${urlPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: raw.length ? raw : undefined,
    })
    const text = await upstream.text()
    res.statusCode = upstream.status
    const ct = upstream.headers.get('content-type')
    if (ct) res.setHeader('Content-Type', ct)
    else res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(text)
  } catch (e) {
    jsonResponse(res, 502, {
      success: false,
      messages: [
        e instanceof Error
          ? e.message
          : 'platform-api unreachable (is it running on the proxy target?)',
      ],
    })
  }
}

/** Vite plugin: demo Link BFF without platform-api. */
export function linkLiveDemoPlugin(cwd = process.cwd()): Plugin {
  return {
    name: 'link-live-demo-bff',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'POST') {
          next()
          return
        }
        const linkPath = matchLinkPayPath(req.url)
        if (!linkPath) {
          next()
          return
        }

        let raw: Buffer
        let body: Record<string, unknown>
        try {
          ;({ raw, body } = await readJsonBody(req))
        } catch (e) {
          jsonResponse(res, 400, {
            success: false,
            messages: [e instanceof Error ? e.message : 'Invalid body'],
          })
          return
        }

        const checkoutToken = String(body.checkoutToken ?? '').trim()
        if (!isDemoToken(checkoutToken)) {
          await forwardToPlatformApi(cwd, req, res, raw)
          return
        }

        try {
          if (linkPath === '/api/public/linkpay/pre-initialize') {
            const lang = body.language === 'en' ? 'en' : 'ar'
            const payload = await buildLiveDemoCatalog(cwd, lang)
            jsonResponse(res, 200, payload)
            return
          }
          if (linkPath === '/api/public/linkpay/initiate') {
            const payload = await demoInitiate(cwd, body)
            jsonResponse(res, 200, payload)
            return
          }
          if (linkPath === '/api/public/linkpay/confirm') {
            const payload = await demoConfirm(cwd, body)
            jsonResponse(res, 200, payload)
            return
          }
          next()
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          const cause =
            e instanceof Error && e.cause instanceof Error
              ? e.cause.message
              : e instanceof Error && e.cause != null
                ? String(e.cause)
                : null
          const statusCode =
            e instanceof Error &&
            typeof (e as Error & { statusCode?: number }).statusCode === 'number'
              ? (e as Error & { statusCode: number }).statusCode
              : 502
          jsonResponse(res, statusCode, {
            success: false,
            messages: [cause ? `${msg}: ${cause}` : msg],
          })
        }
      })
    },
  }
}
