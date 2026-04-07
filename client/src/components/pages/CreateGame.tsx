import { type ReactNode, useCallback, useEffect, useState } from 'react'
import {
  Box,
  Button,
  Grid,
  TextField,
} from '@mui/material'
import { AddCircle, Person } from '@mui/icons-material'
import { useNavigate } from 'react-router'
import { getPlayerId } from '../../helpers/players'
import {
  GameSettings,
  PlayerActions,
  DehydratedPublicGameState,
} from '@shared'
import useGameMutation from '../../hooks/useGameMutation'
import { useTranslationContext } from '../../contexts/TranslationsContext'
import { useAuthContext } from '../../contexts/AuthContext'
import {
  allowReviveStorageKey,
  allowContessaBlockExamineStorageKey,
  enableInquisitorStorageKey,
  enableReformationStorageKey,
  eventLogRetentionTurnsStorageKey,
  speedRoundEnabledStorageKey,
  speedRoundSecondsStorageKey,
} from '../../helpers/localStorageKeys'
import CoupTypography from '../utilities/CoupTypography'
import { usePersistedState } from '../../hooks/usePersistedState'
import { useDisplayName } from '../../hooks/useDisplayName'
import GameSettingsFields from '../game/GameSettingsFields'
import { EditableGameSettings, normalizeEditableGameSettings } from '../../helpers/gameSettings'

function CreateGame() {
  const [playerName, setPlayerName] = useState('')
  const [nameSaveError, setNameSaveError] = useState<ReactNode>(null)
  const [nameSaving, setNameSaving] = useState(false)
  const { displayName: profileName, loading: profileNameLoading, saveDisplayName } = useDisplayName()
  const [eventLogRetentionTurns, setEventLogRetentionTurns] = usePersistedState<number>(eventLogRetentionTurnsStorageKey, 3)
  const [allowRevive, setAllowRevive] = usePersistedState<boolean>(allowReviveStorageKey, false)
  const [speedRoundEnabled, setSpeedRoundEnabled] = usePersistedState<boolean>(speedRoundEnabledStorageKey, false)
  const [speedRoundSeconds, setSpeedRoundSeconds] = usePersistedState<number>(speedRoundSecondsStorageKey, 10)
  const [enableReformation, setEnableReformation] = usePersistedState<boolean>(enableReformationStorageKey, false)
  const [enableInquisitor, setEnableInquisitor] = usePersistedState<boolean>(enableInquisitorStorageKey, false)
  const [allowContessaBlockExamine, setAllowContessaBlockExamine] = usePersistedState<boolean>(allowContessaBlockExamineStorageKey, false)
  const navigate = useNavigate()
  const { t } = useTranslationContext()
  const { user, isLocalAuth } = useAuthContext()

  const navigateToRoom = useCallback(
    (gameState: DehydratedPublicGameState) => {
      navigate(`/game?roomId=${gameState.roomId}`)
    },
    [navigate]
  )

  const { trigger, isMutating } = useGameMutation<{
    playerId: string
    playerName: string
    settings: GameSettings
    uid?: string
    photoURL?: string
  }>({ action: PlayerActions.createGame, callback: navigateToRoom })

  const visiblePlayerName = isLocalAuth
    ? playerName
    : (profileName ?? playerName)

  const getNameSaveErrorMessage = useCallback((error?: string) => {
    const knownErrors = ['inappropriateDisplayName', 'displayNameTaken'] as const
    return knownErrors.includes(error as typeof knownErrors[number])
      ? t(error as typeof knownErrors[number])
      : t('somethingWentWrong')
  }, [t])

  useEffect(() => {
    if (isLocalAuth && profileName && !playerName) {
      setPlayerName(profileName)
    }
  }, [isLocalAuth, playerName, profileName])

  const editableSettings: EditableGameSettings = {
    eventLogRetentionTurns,
    allowRevive,
    speedRoundEnabled,
    speedRoundSeconds,
    enableReformation,
    enableInquisitor,
    allowContessaBlockExamine,
  }

  const setEditableSettings = (settings: EditableGameSettings) => {
    setEventLogRetentionTurns(settings.eventLogRetentionTurns)
    setAllowRevive(settings.allowRevive)
    setSpeedRoundEnabled(settings.speedRoundEnabled)
    setSpeedRoundSeconds(settings.speedRoundSeconds)
    setEnableReformation(settings.enableReformation)
    setEnableInquisitor(settings.enableInquisitor)
    setAllowContessaBlockExamine(settings.allowContessaBlockExamine)
  }

  return (
    <>
      <CoupTypography variant="h5" sx={{ m: 5 }} addTextShadow>
        {t('createNewGame')}
      </CoupTypography>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          const submittedPlayerName = visiblePlayerName.trim()
          setNameSaveError(null)

          if (user && !isLocalAuth && !profileName) {
            setNameSaving(true)
            const result = await saveDisplayName(submittedPlayerName)
            setNameSaving(false)
            if (!result.success) {
              setNameSaveError(getNameSaveErrorMessage(result.error))
              return
            }
          } else if (isLocalAuth || !user) {
            await saveDisplayName(submittedPlayerName)
          }

          trigger({
            playerId: getPlayerId(),
            playerName: submittedPlayerName,
            settings: normalizeEditableGameSettings(editableSettings),
            ...(user && { uid: user.uid }),
            ...(user?.photoURL && { photoURL: user.photoURL }),
          })
        }}
      >
        <Grid container direction="column" alignItems="center">
          <Grid>
            <Box sx={{ display: 'flex', alignItems: 'flex-end', mt: 3 }}>
              <Person sx={{ color: 'action.active', mr: 1, my: 0.5 }} />
              <TextField
                name="coup-game-player-name"
                autoComplete="off"
                slotProps={{ htmlInput: { 'data-testid': 'playerNameInput' } }}
                value={visiblePlayerName}
                onChange={(event) => {
                  setNameSaveError(null)
                  if (isLocalAuth || !profileName) {
                    setPlayerName(event.target.value.slice(0, 10))
                  }
                }}
                label={(!profileName || isLocalAuth) && t('whatIsYourName')}
                variant="standard"
                required={!visiblePlayerName}
                disabled={profileNameLoading}
                error={!!nameSaveError}
                helperText={nameSaveError ?? (!isLocalAuth && profileName ? t('nameFromProfile') : undefined)}
              />
            </Box>
          </Grid>
          <GameSettingsFields
            settings={editableSettings}
            onChange={(settings) => {
              setEditableSettings(settings)
            }}
          />
        </Grid>
        <Grid>
          <Button
            type="submit"
            sx={{ mt: 5 }}
            variant="contained"
            loading={isMutating || nameSaving}
            startIcon={<AddCircle />}
          >
            {t('createGame')}
          </Button>
        </Grid>
      </form>
    </>
  )
}

export default CreateGame
