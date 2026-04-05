import { GameSettings } from "@shared"

export type RulesVariant = {
  mode: 'merged' | 'room'
  showAmbassador: boolean
  showContessaBlockExamine: boolean
  showInquisitor: boolean
  showReformation: boolean
  showRevive: boolean
}

export const getRulesVariant = (settings?: GameSettings): RulesVariant => {
  if (!settings) {
    return {
      mode: 'merged',
      showAmbassador: true,
      showContessaBlockExamine: true,
      showInquisitor: true,
      showReformation: true,
      showRevive: true,
    }
  }

  return {
    mode: 'room',
    showAmbassador: !settings.enableInquisitor,
    showContessaBlockExamine: !!settings.allowContessaBlockExamine,
    showInquisitor: !!settings.enableInquisitor,
    showReformation: !!settings.enableReformation,
    showRevive: settings.allowRevive,
  }
}
