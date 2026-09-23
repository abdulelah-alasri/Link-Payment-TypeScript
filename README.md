# Link Pay (`link_payment`)

A **single-page checkout** for the Aysali **Link Pay** flow (Yemen e-wallets via Link Merchant API). It loads a payment session from the **platform-api BFF** using a `checkoutToken` from the URL, guides the customer through wallet selection, account / OTP steps, confirms payment, and shows success, completion, or error states—with **English / Arabic** UI, **RTL** support, **IBM Plex Sans Arabic**, and a **printable receipt**.

Unlike Bas Pay, this SPA **never** calls Link Merchant API directly and **does not** embed merchant secrets. All Link OAuth / initiate / confirm calls stay on the server.

---



## What it provides


| Area                | Behavior                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bootstrap**       | Calls **pre-initialize** with `checkoutToken` to load order amount, merchant name, wallets, and `cancelUrl` / `redirectUrl`.                        |
| **Checkout**        | Step 1: choose wallet (organization). Step 2: wallet / phone, send OTP (**initiate**), enter code, then **confirm payment**.                        |
| **Success**         | Shows transaction id (with copy), order reference, payer name, totals, method, account, **date & time**; optional **print** layout (invoice-style). |
| **Already paid**    | If the session is already completed, a dedicated screen with a **done** indicator and optional **continue** when `redirectUrl` is allowed.          |
| **Cancel / return** | Footer cancel link uses only a safe `cancelUrl` from the session (no invented `history.back()`).                                                    |
| **Errors**          | Network / API failures and missing token surface with clear messaging.                                                                              |
| **i18n**            | `language` query param (e.g. `ar`, `en`); document `dir` / `lang` follow the active locale.                                                         |


API surface used by the app (relative to the configured API base, or same-origin `/api` in dev) — **Aysali platform-api BFF**:

- `POST /api/public/linkpay/pre-initialize`
- `POST /api/public/linkpay/initiate`
- `POST /api/public/linkpay/confirm`

---



## Requirements

- **Node.js** 18+ (recommended LTS)
- **npm** (or compatible client) for installing dependencies and running scripts
- A **modern browser** (ES modules, `fetch`, CSS used by the UI)
- For a **real** checkout (not demo): running **platform-api** with Link env (`LINK_`*, `PAYMENT_LINK_VISIBLE`) and a valid payment session

---



## Configuration

1. Copy the example environment file:
  ```bash
   cp .env.example .env
  ```
2. Edit `.env`:

  | Variable                   | Purpose                                                                                                                                                                              |
  | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `VITE_MODE`                | When set to `test`, shows a fixed test-environment ribbon in the UI (build-time).                                                                                                    |
  | `VITE_API_BASE_URL`        | Full platform-api origin **without** trailing slash (e.g. `https://api.aysali.com`). **Leave empty in local dev** to call same-origin `/api/...` and use the Vite proxy (see below). |
  | `VITE_LINKPAY_HOME`        | Footer home link (default: Tharwatt).                                                                                                                                                |
  | `VITE_LINKPAY_PRIVACY_URL` | Footer privacy policy.                                                                                                                                                               |
  | `VITE_LINKPAY_TERMS_URL`   | Footer terms.                                                                                                                                                                        |
  | `VITE_LINKPAY_CONTACT_URL` | Footer contact.                                                                                                                                                                      |

3. **Local development proxy** (`vite.config.ts`): when `VITE_API_BASE_URL` is empty, requests go to `/api/...` and Vite proxies them to the target host. Override the target with:
  ```bash
   VITE_PROXY_API_TARGET=http://localhost:3000
  ```
   Default proxy target if unset: `http://localhost:3000`.

> **Security:** No Link `client_secret` or access tokens belong in this SPA or in `VITE_`* vars. Keep merchant credentials only in platform-api. Do not commit `.env`.

---



## URL parameters

The app reads **query string** parameters on load:


| Parameter        | Description                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkoutToken`  | **Required** for a valid session. UUID from platform-api when creating a Link order (`providerOrderId`). Use `demo` for local UI preview without the API. |
| `language`       | Optional. e.g. `ar`, `en` (also accepts `ar-*` / `en-*`). If omitted, the browser locale is used.                                                         |
| `userIdentifier` | Optional. Pre-filled wallet / phone identifier for step 2.                                                                                                |
| `fullName`       | Optional. Shown on receipt / success when provided.                                                                                                       |


Example (local UI demo):

```text
http://localhost:5174/?checkoutToken=demo&language=ar&userIdentifier=777000000&fullName=Customer%20Name
```

Example (real session from platform-api):

```text
http://localhost:5174/?checkoutToken=YOUR_SESSION_UUID&language=ar&userIdentifier=777000000&fullName=Customer%20Name
```

---



## Scripts

```bash
npm install          # install dependencies
npm run dev          # Vite dev server (HMR)
npm run build        # TypeScript check + production bundle to dist/
npm run preview      # Serve the production build locally
```

Deploy artifact for Aysali: copy `dist/` to `Aysali.Solutions/apps/linkpay/dist` (same pattern as `apps/basgate`).

---



## Project layout (high level)

```text
src/
  api/           # preInitialize, initiatePayment, confirmPayment (BFF client)
  locales/       # ar.json, en.json
  logics/        # bootstrap, OTP, flows, views, app model
  styles/        # app.css (Link brand + IBM Plex Sans Arabic)
  types/         # payment / API typings
  ui/            # screens, steps, layout, printable receipt, footer
  util/          # navigation URL safety, assets
  app.ts         # re-exports startApp
  main.ts        # entry
  urlParams.ts   # query parsing
  i18n.ts        # locale helper
```

Static assets used by the UI (e.g. platform logo) live under `public/` as referenced by the code.

---



## Tech stack

- **TypeScript**
- **Vite** 8
- **canvas-confetti** (success celebration)
- **lottie-web** (loading animation)
- **IBM Plex Sans Arabic** (Google Fonts)

---



## Architecture (SPA ↔ platform ↔ Link)

```text
[Merchant / Aysali web]
        │  create-order (link)
        ▼
[platform-api]  ──OAuth / initiate / confirm──►  [Link Merchant API]
        │  payUrl?checkoutToken=
        ▼
[Link Pay SPA]  ──BFF only──►  /api/public/linkpay/*
```

---



## License / product

Private package (`"private": true` in `package.json`). Use and distribution are governed by your Aysali / Link merchant agreements.

---



## Developer & technical support

**Abdulelah Alasri** — application developer and technical support.

- **Email:** [alasri.abdulelah@gmail.com](mailto:alasri.abdulelah@gmail.com)
- **Phone / WhatsApp:** [+967777706727](tel:+967777706727)

