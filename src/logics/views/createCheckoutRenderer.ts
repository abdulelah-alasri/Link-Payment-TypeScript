import type { Translator } from '../../i18n'
import type { UrlParams } from '../../urlParams'
import { renderCheckout } from '../../ui/render'
import type { AppModel } from '../appModel'

/** Props needed to mount checkout and wire UI handlers. */
export interface CreateCheckoutRendererDeps {
  root: HTMLElement
  model: AppModel
  url: UrlParams
  translator: Translator
  otpCountdown: { start: () => void; reset: () => void }
  onSendCode: () => void
  onConfirmPayment: () => void
}

/**
 * Returns a function that re-renders checkout when `phase === 'checkout'`, wiring all step handlers.
 */
export function createCheckoutRenderer(
  deps: CreateCheckoutRendererDeps,
): () => void {
  const {
    root,
    model,
    url,
    translator,
    otpCountdown,
    onSendCode: runSendCode,
    onConfirmPayment: runConfirmPayment,
  } = deps

  function renderCheckoutView(): void {
    if (!model.data || model.phase !== 'checkout') return
    const methods = model.data.availablePaymentMethods.filter(
      (m) => m.isEnabled !== false,
    )
    if (
      model.selectedMethodId === null &&
      methods.length > 0
    ) {
      model.selectedMethodId = methods[0]!.id
    }

    renderCheckout(root, {
      data: model.data,
      step: model.checkoutStep,
      selectedMethodId: model.selectedMethodId ?? methods[0]!.id,
      requireOtp: model.requireOtp,
      mobile: model.mobile,
      extraFieldValues: model.extraFieldValues,
      checkoutStepError: model.checkoutStepError,
      initiateInProgress: model.initiateInProgress,
      confirmInProgress: model.confirmInProgress,
      showInitiateAccountCard: model.showInitiateAccountCard,
      initiateAccountDisplay: model.initiateAccountDisplay,
      urlFullName: url.fullName.trim(),
      urlAppName: url.appName,
      otpCountdownRemaining: model.otpCountdownRemaining,
      translator,
      handlers: {
        onSelectMethod(id) {
          if (id !== model.selectedMethodId) {
            model.extraFieldValues = {}
          }
          model.selectedMethodId = id
          // Step 1: update radios in place so the wallet list scroll position stays put.
          if (model.checkoutStep === 1 && syncMethodSelectionInDom(root, id)) {
            return
          }
          renderCheckoutView()
        },
        onContinue() {
          model.checkoutStep = 2
          renderCheckoutView()
        },
        onChangeMethod() {
          otpCountdown.reset()
          model.checkoutStep = 1
          model.requireOtp = false
          model.extraFieldValues = {}
          model.checkoutStepError = undefined
          model.lastPgTransactionToken = undefined
          model.confirmInProgress = false
          model.showInitiateAccountCard = false
          model.initiateAccountDisplay = ''
          renderCheckoutView()
        },
        onMobileInput(value) {
          model.mobile = value
        },
        onSendCode() {
          runSendCode()
        },
        onExtraChange(key, value) {
          model.extraFieldValues[key] = value
        },
        onEditInitiateAccount() {
          otpCountdown.reset()
          model.showInitiateAccountCard = false
          model.requireOtp = false
          model.extraFieldValues = {}
          model.checkoutStepError = undefined
          model.lastPgTransactionToken = undefined
          model.confirmInProgress = false
          renderCheckoutView()
        },
        onConfirmPayment() {
          runConfirmPayment()
        },
      },
    })
  }

  return renderCheckoutView
}

/** Sync selected wallet radio without tearing down the scrollable list. */
function syncMethodSelectionInDom(root: HTMLElement, id: number): boolean {
  const list = root.querySelector('.method-list')
  if (!list) return false
  let found = false
  for (const el of list.querySelectorAll('input[name="paymentMethod"]')) {
    const input = el as HTMLInputElement
    const checked = input.value === String(id)
    input.checked = checked
    if (checked) found = true
  }
  return found
}
