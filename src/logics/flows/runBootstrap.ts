import {
  isPreInitializeConfigValid,
  preInitializePayment,
} from '../../api/preInitialize'
import type { Translator } from '../../i18n'
import type { UrlParams } from '../../urlParams'
import type { AppModel } from '../appModel'

export interface RunBootstrapDeps {
  model: AppModel
  url: UrlParams
  translator: Translator
  syncUi: () => void
  otpCountdown: { reset: () => void }
}

export async function runBootstrap(deps: RunBootstrapDeps): Promise<void> {
  const { model, url, translator, syncUi, otpCountdown } = deps

  model.phase = 'loading'
  syncUi()

  if (!url.checkoutToken.trim()) {
    model.phase = 'error'
    model.errorMessage = translator.t('missingCheckoutToken')
    syncUi()
    return
  }

  if (!isPreInitializeConfigValid()) {
    model.phase = 'error'
    model.errorMessage = translator.t('invoiceUnavailable')
    syncUi()
    return
  }

  const result = await preInitializePayment(url.checkoutToken.trim())
  if (!result.ok) {
    model.phase = 'error'
    if (result.kind === 'network') {
      model.errorMessage = translator.t('networkError')
    } else {
      model.errorMessage = translator.t('invoiceUnavailable')
    }
    syncUi()
    return
  }

  model.data = result.data
  model.activeTrxToken = (result.data.checkoutToken ?? result.data.trxToken ?? url.checkoutToken).trim()

  const status = result.data.trxStatus?.toLowerCase() ?? ''
  if (status === 'completed') {
    model.phase = 'completed'
    syncUi()
    return
  }

  model.phase = 'checkout'
  model.checkoutStep = 1
  model.requireOtp = false
  model.selectedMethodId = null
  model.extraFieldValues = {}
  model.checkoutStepError = undefined
  model.lastPgTransactionToken = undefined
  model.confirmInProgress = false
  model.showInitiateAccountCard = false
  model.initiateAccountDisplay = ''
  model.paymentSuccessSnapshot = undefined
  otpCountdown.reset()
  syncUi()
}
