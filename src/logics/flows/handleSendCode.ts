import { initiatePayment } from '../../api/initiatePayment'
import type { Translator } from '../../i18n'
import type { UrlParams } from '../../urlParams'
import type { AppModel } from '../appModel'

export interface HandleSendCodeDeps {
  model: AppModel
  url: UrlParams
  translator: Translator
  renderCheckoutView: () => void
  otpCountdown: { start: () => void; reset: () => void }
}

export async function handleSendCode(deps: HandleSendCodeDeps): Promise<void> {
  const { model, url, translator, renderCheckoutView, otpCountdown } = deps
  if (!model.data || model.selectedMethodId === null) return
  const phone = model.mobile.trim()
  model.checkoutStepError = undefined
  if (!phone) {
    model.checkoutStepError = translator.t('mobileRequired')
    renderCheckoutView()
    return
  }

  const methods = model.data.availablePaymentMethods.filter((m) => m.isEnabled !== false)
  const method = methods.find((m) => m.id === model.selectedMethodId) ?? null
  const organizationCode = method?.organizationCode?.trim()
  if (!organizationCode) {
    model.checkoutStepError = translator.t('initiatePaymentFailed')
    renderCheckoutView()
    return
  }

  model.initiateInProgress = true
  renderCheckoutView()

  const result = await initiatePayment({
    checkoutToken: model.activeTrxToken,
    organizationCode,
    walletId: phone,
    fullName: url.fullName.trim() || undefined,
  })

  model.initiateInProgress = false

  if (!result.ok) {
    if (result.kind === 'network') {
      model.checkoutStepError = result.detail ?? translator.t('networkError')
    } else {
      model.checkoutStepError =
        result.messages?.join('\n') ?? translator.t('initiatePaymentFailed')
    }
    renderCheckoutView()
    return
  }

  model.requireOtp = result.data.otpRequired !== false
  model.showInitiateAccountCard = true
  model.initiateAccountDisplay = phone
  delete model.extraFieldValues.OTP
  if (model.requireOtp) {
    otpCountdown.start()
  } else {
    otpCountdown.reset()
  }
  renderCheckoutView()
}
