import { confirmPayment } from '../../api/confirmPayment'
import type { Translator } from '../../i18n'
import { isAllowedMerchantNavigationUrl } from '../../util/navigationUrl'
import type { AppModel } from '../appModel'
import { formatLocaleDateTime } from '../display/formatLocaleDateTime'

export interface HandleConfirmPaymentDeps {
  model: AppModel
  translator: Translator
  syncUi: () => void
  renderCheckoutView: () => void
  otpCountdown: { reset: () => void }
}

function isSuccessfulConfirmTrxStatus(status: string | undefined): boolean {
  const s = (status ?? '').toLowerCase()
  return s === 'completed' || s === 'success' || s === '1'
}

export async function handleConfirmPayment(
  deps: HandleConfirmPaymentDeps,
): Promise<void> {
  const { model, translator, syncUi, renderCheckoutView, otpCountdown } = deps
  if (!model.data || model.selectedMethodId === null) return
  if (!model.showInitiateAccountCard) return

  const account = model.initiateAccountDisplay.trim()
  model.checkoutStepError = undefined

  if (model.requireOtp) {
    const otp = (model.extraFieldValues.OTP ?? '').trim()
    if (!otp) {
      model.checkoutStepError = translator.t('otpRequiredForConfirm')
      renderCheckoutView()
      return
    }
  }

  model.confirmInProgress = true
  renderCheckoutView()

  const result = await confirmPayment({
    checkoutToken: model.activeTrxToken,
    oneTimeCode: (model.extraFieldValues.OTP ?? '').trim() || '0000',
  })

  model.confirmInProgress = false

  if (!result.ok) {
    if (result.kind === 'network') {
      model.checkoutStepError = result.detail ?? translator.t('networkError')
    } else {
      model.checkoutStepError =
        result.messages?.join('\n') ?? translator.t('confirmPaymentFailed')
    }
    renderCheckoutView()
    return
  }

  if (isSuccessfulConfirmTrxStatus(result.data.trxStatus)) {
    const methods = model.data.availablePaymentMethods.filter((m) => m.isEnabled !== false)
    const method = methods.find((m) => m.id === model.selectedMethodId)
    model.paymentSuccessSnapshot = {
      pgTransactionId:
        (result.data.trxId ?? '').trim() ||
        String(
          (result.data.gatewayInfo as { pgTransactionId?: string } | undefined)
            ?.pgTransactionId ?? '',
        ).trim() ||
        model.activeTrxToken,
      transactionDateTime: formatLocaleDateTime(translator.lang, new Date()),
      paymentMethodName: method?.name ?? 'Wallet',
      paymentMethodImage: method?.image,
      accountPhone: account,
    }
    model.phase = 'paymentSuccess'
    otpCountdown.reset()
    syncUi()

    const redirect = result.data.redirectUrl?.trim() || model.data.redirectUrl?.trim()
    if (redirect && isAllowedMerchantNavigationUrl(redirect)) {
      window.setTimeout(() => {
        window.location.assign(redirect)
      }, 1800)
    }
    return
  }

  if ((result.data.trxStatus ?? '').toLowerCase() === 'failed') {
    model.checkoutStepError = translator.t('confirmPaymentFailed')
    renderCheckoutView()
    return
  }

  model.checkoutStepError = translator.t('confirmPaymentFailed')
  renderCheckoutView()
}
