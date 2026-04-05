import { type ReactNode, useCallback, useEffect, useState } from 'react'
import {
  Box,
  Button,
  Grid,
  Slider,
  Switch,
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
            settings: {
              eventLogRetentionTurns,
              allowRevive,
              enableReformation,
              enableInquisitor,
              allowContessaBlockExamine: enableInquisitor && allowContessaBlockExamine,
              ...(speedRoundEnabled && { speedRoundSeconds }),
            },
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
          <Grid sx={{ maxWidth: '300px', width: '90%' }}>
            <Box mt={6}>
              <CoupTypography mt={2} addTextShadow>
                {t('eventLogRetentionTurns')}
                {`: ${eventLogRetentionTurns}`}
              </CoupTypography>
              <Slider
                data-testid="eventLogRetentionTurnsInput"
                step={1}
                value={eventLogRetentionTurns}
                valueLabelDisplay="auto"
                min={1}
                max={100}
                onChange={(_: Event, value: number) => {
                  setEventLogRetentionTurns(value)
                }}
              />
            </Box>
          </Grid>
          <Grid sx={{ maxWidth: '300px', width: '90%' }}>
            <Box mt={2}>
              <CoupTypography component="span" mt={2} addTextShadow>
                {t('allowRevive')}:
              </CoupTypography>
              <Switch
                checked={allowRevive}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  setAllowRevive(event.target.checked)
                }}
                slotProps={{ input: { 'aria-label': 'controlled' } }}
              />
            </Box>
          </Grid>
          <Grid sx={{ maxWidth: '300px', width: '90%' }}>
            <Box mt={2}>
              <CoupTypography component="span" mt={2} addTextShadow>
                {t('speedRound')}:
              </CoupTypography>
              <Switch
                checked={speedRoundEnabled}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  setSpeedRoundEnabled(event.target.checked)
                }}
                slotProps={{ input: { 'aria-label': 'controlled' } }}
              />
            </Box>
          </Grid>
          {speedRoundEnabled && (
            <Grid sx={{ maxWidth: '300px', width: '90%' }}>
              <Box mt={2}>
                <CoupTypography mt={2} addTextShadow>
                  {t('speedRoundSeconds')}
                  {`: ${speedRoundSeconds}`}
                </CoupTypography>
                <Slider
                  data-testid="speedRoundSecondsInput"
                  step={1}
                  value={speedRoundSeconds}
                  valueLabelDisplay="auto"
                  min={5}
                  max={60}
                  onChange={(_: Event, value: number) => {
                    setSpeedRoundSeconds(value)
                  }}
                />
              </Box>
            </Grid>
          )}
          <Grid sx={{ maxWidth: '300px', width: '90%' }}>
            <Box mt={2}>
              <CoupTypography component="span" mt={2} addTextShadow>
                {t('enableReformation')}:
              </CoupTypography>
              <Switch
                checked={enableReformation}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  setEnableReformation(event.target.checked)
                }}
                slotProps={{ input: { 'aria-label': 'controlled' } }}
              />
            </Box>
          </Grid>
          <Grid sx={{ maxWidth: '300px', width: '90%' }}>
            <Box mt={2}>
              <CoupTypography component="span" mt={2} addTextShadow>
                {t('enableInquisitor')}:
              </CoupTypography>
              <Switch
                checked={enableInquisitor}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  const enabled = event.target.checked
                  setEnableInquisitor(enabled)
                  if (!enabled) {
                    setAllowContessaBlockExamine(false)
                  }
                }}
                slotProps={{ input: { 'aria-label': 'controlled' } }}
              />
            </Box>
          </Grid>
          {enableInquisitor && (
            <Grid sx={{ maxWidth: '300px', width: '90%' }}>
              <Box mt={2}>
                <CoupTypography component="span" mt={2} addTextShadow>
                  {t('allowContessaBlockExamine')}:
                </CoupTypography>
                <Switch
                  checked={allowContessaBlockExamine}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    setAllowContessaBlockExamine(event.target.checked)
                  }}
                  slotProps={{ input: { 'aria-label': 'controlled' } }}
                />
              </Box>
            </Grid>
          )}
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
