import { GameSettings } from '@shared'

export type EditableGameSettings = {
  eventLogRetentionTurns: number
  allowRevive: boolean
  speedRoundEnabled: boolean
  speedRoundSeconds: number
  enableReformation: boolean
  enableInquisitor: boolean
  allowContessaBlockExamine: boolean
}

export const defaultEditableGameSettings: EditableGameSettings = {
  eventLogRetentionTurns: 3,
  allowRevive: false,
  speedRoundEnabled: false,
  speedRoundSeconds: 10,
  enableReformation: false,
  enableInquisitor: false,
  allowContessaBlockExamine: false,
}

export const getEditableGameSettings = (settings?: GameSettings): EditableGameSettings => ({
  eventLogRetentionTurns: settings?.eventLogRetentionTurns ?? defaultEditableGameSettings.eventLogRetentionTurns,
  allowRevive: settings?.allowRevive ?? defaultEditableGameSettings.allowRevive,
  speedRoundEnabled: !!settings?.speedRoundSeconds,
  speedRoundSeconds: settings?.speedRoundSeconds ?? defaultEditableGameSettings.speedRoundSeconds,
  enableReformation: settings?.enableReformation ?? defaultEditableGameSettings.enableReformation,
  enableInquisitor: settings?.enableInquisitor ?? defaultEditableGameSettings.enableInquisitor,
  allowContessaBlockExamine: !!settings?.enableInquisitor && !!settings?.allowContessaBlockExamine,
})

export const normalizeEditableGameSettings = ({
  eventLogRetentionTurns,
  allowRevive,
  speedRoundEnabled,
  speedRoundSeconds,
  enableReformation,
  enableInquisitor,
  allowContessaBlockExamine,
}: EditableGameSettings): GameSettings => ({
  eventLogRetentionTurns,
  allowRevive,
  enableReformation,
  enableInquisitor,
  allowContessaBlockExamine: enableInquisitor && allowContessaBlockExamine,
  ...(speedRoundEnabled && { speedRoundSeconds }),
})
