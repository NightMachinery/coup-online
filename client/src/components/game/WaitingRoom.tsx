import { useEffect, useState } from "react"
import { Box, Button, Collapse, Grid, useTheme } from "@mui/material"
import Players from "../game/Players"
import { QRCodeSVG } from 'qrcode.react'
import { ContentCopy, ExpandLess, ExpandMore, GroupAdd, PlayArrow, Settings } from "@mui/icons-material"
import { getPlayerId } from "../../helpers/players"
import { useGameStateContext } from "../../contexts/GameStateContext"
import { LIGHT_COLOR_MODE } from "../../contexts/MaterialThemeContext"
import { GameSettings, MAX_PLAYER_COUNT, PlayerActions } from "@shared"
import useGameMutation from "../../hooks/useGameMutation"
import Bot from "../icons/Bot"
import AddAiPlayer from "./AddAiPlayer"
import { useTranslationContext } from "../../contexts/TranslationsContext"
import { useNavigate } from "react-router"
import { useNotificationsContext } from "../../contexts/NotificationsContext"
import CoupTypography from '../utilities/CoupTypography'
import { copyTextToClipboard } from '../../helpers/clipboard'
import InfluenceDeckSummary from "./InfluenceDeckSummary"
import { usePersistedState } from "../../hooks/usePersistedState"
import {
  allowContessaBlockExamineStorageKey,
  allowReviveStorageKey,
  enableInquisitorStorageKey,
  enableReformationStorageKey,
  eventLogRetentionTurnsStorageKey,
  speedRoundEnabledStorageKey,
  speedRoundSecondsStorageKey,
} from "../../helpers/localStorageKeys"
import { EditableGameSettings, getEditableGameSettings, normalizeEditableGameSettings } from "../../helpers/gameSettings"
import GameSettingsFields from "./GameSettingsFields"

function WaitingRoom() {
  const [addAiPlayerDialogOpen, setAddAiPlayerDialogOpen] = useState(false)
  const [settingsExpanded, setSettingsExpanded] = useState(false)
  const { gameState } = useGameStateContext()
  const { t } = useTranslationContext()
  const theme = useTheme()
  const navigate = useNavigate()
  const { showNotification } = useNotificationsContext()
  const [eventLogRetentionTurns, setEventLogRetentionTurns] = usePersistedState<number>(eventLogRetentionTurnsStorageKey, 3)
  const [allowRevive, setAllowRevive] = usePersistedState<boolean>(allowReviveStorageKey, false)
  const [speedRoundEnabled, setSpeedRoundEnabled] = usePersistedState<boolean>(speedRoundEnabledStorageKey, false)
  const [speedRoundSeconds, setSpeedRoundSeconds] = usePersistedState<number>(speedRoundSecondsStorageKey, 10)
  const [enableReformation, setEnableReformation] = usePersistedState<boolean>(enableReformationStorageKey, false)
  const [enableInquisitor, setEnableInquisitor] = usePersistedState<boolean>(enableInquisitorStorageKey, false)
  const [allowContessaBlockExamine, setAllowContessaBlockExamine] = usePersistedState<boolean>(allowContessaBlockExamineStorageKey, false)

  const { trigger, isMutating } = useGameMutation<{
    roomId: string, playerId: string
  }>({ action: PlayerActions.startGame })
  const setGameSettings = useGameMutation<{
    roomId: string
    playerId: string
    settings: GameSettings
  }>({ action: PlayerActions.setGameSettings })
  const setModeratorMutation = useGameMutation<{
    roomId: string
    playerId: string
    isModerator: boolean
    targetPlayerName?: string
    targetSpectatorId?: string
  }>({ action: PlayerActions.setModerator })

  const setEditableSettingsState = (settings: EditableGameSettings) => {
    setEventLogRetentionTurns(settings.eventLogRetentionTurns)
    setAllowRevive(settings.allowRevive)
    setSpeedRoundEnabled(settings.speedRoundEnabled)
    setSpeedRoundSeconds(settings.speedRoundSeconds)
    setEnableReformation(settings.enableReformation)
    setEnableInquisitor(settings.enableInquisitor)
    setAllowContessaBlockExamine(settings.allowContessaBlockExamine)
  }

  useEffect(() => {
    if (!gameState) {
      return
    }
    setEditableSettingsState(getEditableGameSettings(gameState.settings))
  }, [
    gameState?.settings.eventLogRetentionTurns,
    gameState?.settings.allowRevive,
    gameState?.settings.speedRoundSeconds,
    gameState?.settings.enableReformation,
    gameState?.settings.enableInquisitor,
    gameState?.settings.allowContessaBlockExamine,
  ])

  if (!gameState) {
    return null
  }

  const editableSettings: EditableGameSettings = {
    eventLogRetentionTurns,
    allowRevive,
    speedRoundEnabled,
    speedRoundSeconds,
    enableReformation,
    enableInquisitor,
    allowContessaBlockExamine,
  }

  const inviteLink = `${window.location.origin}/join-game?roomId=${gameState.roomId}`
  const selfIsPrivileged = gameState.selfIsCreator || gameState.selfIsModerator
  const canManageLobby = selfIsPrivileged || (!gameState.connectedLobbyAuthorityPresent && !!gameState.selfPlayer)
  const startDisabled = gameState.players.length < 2 || !canManageLobby
  const canEditSettings = canManageLobby

  const updateSettings = (settings: EditableGameSettings, autoSave?: boolean) => {
    setEditableSettingsState(settings)
    if (!autoSave) {
      return
    }

    setGameSettings.trigger({
      roomId: gameState.roomId,
      playerId: getPlayerId(),
      settings: normalizeEditableGameSettings(settings),
    })
  }

  return (
    <>
      <Grid container direction='column' justifyContent="center">
        <Grid sx={{ p: 2, mt: 4 }}>
          <Players inWaitingRoom />
        </Grid>
      </Grid>
      <CoupTypography variant="h5" m={3} addTextShadow>
        {t('room')}
        : <strong>{gameState.roomId}</strong>
      </CoupTypography>
      <Box mb={3}>
        <InfluenceDeckSummary />
      </Box>
      <Grid container direction='column' spacing={2}>
        {canEditSettings && (
          <Grid>
            <Button
              variant="contained"
              startIcon={<Settings />}
              endIcon={settingsExpanded ? <ExpandLess /> : <ExpandMore />}
              onClick={() => {
                setSettingsExpanded((expanded) => !expanded)
              }}
            >
              {t('settings')}
            </Button>
            <Collapse in={settingsExpanded}>
              <Grid container direction="column" alignItems="center" mt={2}>
                <GameSettingsFields
                  settings={editableSettings}
                  disabled={setGameSettings.isMutating}
                  onChange={(settings, options) => {
                    updateSettings(settings, options?.autoSave)
                  }}
                />
              </Grid>
            </Collapse>
          </Grid>
        )}
        <Grid>
          <QRCodeSVG
            bgColor="transparent"
            fgColor={theme.palette.primary[theme.palette.mode === LIGHT_COLOR_MODE ? 'dark' : 'light']}
            value={inviteLink}
          />
        </Grid>
        <Grid>
          <Button
            variant="contained"
            startIcon={<ContentCopy />}
            onClick={async () => {
              const copied = await copyTextToClipboard(inviteLink)
              if (copied) {
                showNotification({
                  id: 'inviteLinkCopied',
                  message: t('inviteLinkCopied'),
                  severity: 'success'
                })
              } else {
                showNotification({
                  id: 'inviteLinkCopyFailed',
                  message: 'Unable to copy automatically. Copy the URL from the address bar instead.',
                  severity: 'warning'
                })
              }
            }}
          >
            {(t('copyInviteLink'))}
          </Button>
        </Grid>
        {(!!gameState.selfPlayer || gameState.selfIsCreator) && (
          <Grid>
            <Button
              variant="contained"
              startIcon={<Bot />}
              onClick={() => {
                setAddAiPlayerDialogOpen(true)
              }}
              disabled={gameState.players.length === MAX_PLAYER_COUNT}
            >
              {(t('addAiPlayer'))}
            </Button>
          </Grid>
        )}
        {(!!gameState.selfPlayer || selfIsPrivileged) && (
          <Grid>
            <Button
              variant='contained'
              onClick={() => {
                trigger({
                  roomId: gameState.roomId,
                  playerId: getPlayerId()
                })
              }}
              disabled={startDisabled}
              loading={isMutating}
              startIcon={<PlayArrow />}
            >
              {(t('startGame'))}
            </Button>
            <Box sx={{ fontStyle: 'italic' }}>
              {gameState.players.length < 2 && (
                <CoupTypography mt={2} addTextShadow>
                  {t('addPlayersToStartGame')}
                </CoupTypography>
              )}
              {gameState.players.length >= 2 && gameState.connectedLobbyAuthorityPresent && !selfIsPrivileged && (
                <CoupTypography mt={2} addTextShadow>
                  {t('onlyLobbyCreatorOrModeratorCanStartGame')}
                </CoupTypography>
              )}
              {gameState.players.length === 2 && (
                <CoupTypography mt={2} addTextShadow>
                  {t('startingPlayerBeginsWith1Coin')}
                </CoupTypography>
              )}
              {gameState.settings.allowRevive && (
                <CoupTypography mt={2} addTextShadow>
                  {t('reviveSummary')}
                </CoupTypography>
              )}
              {gameState.settings.enableReformation && (
                <CoupTypography mt={2} addTextShadow>
                  {t('reformationSummary')}
                </CoupTypography>
              )}
              {gameState.settings.enableInquisitor && (
                <CoupTypography mt={2} addTextShadow>
                  {t('inquisitorSummary')}
                </CoupTypography>
              )}
              {gameState.settings.allowContessaBlockExamine && (
                <CoupTypography mt={2} addTextShadow>
                  {t('contessaBlockExamineSummary')}
                </CoupTypography>
              )}
              {gameState.settings.speedRoundSeconds && (
                <CoupTypography mt={2} addTextShadow>
                  {t('speedRoundSeconds')}: {gameState.settings.speedRoundSeconds}
                </CoupTypography>
              )}
            </Box>
          </Grid>
        )}
        {gameState.selfIsCreator && !!gameState.spectators?.length && (
          <Grid>
            <CoupTypography variant="h6" addTextShadow mb={1}>
              {t('connectedSpectators')}
            </CoupTypography>
            <Box display="grid" gap={1}>
              {gameState.spectators.map((spectator) => (
                <Box
                  key={spectator.id}
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                  gap={1}
                >
                  <CoupTypography addTextShadow>
                    {spectator.name}
                    {spectator.isModerator ? ` (${t('moderator')})` : ''}
                  </CoupTypography>
                  {spectator.isModerator && (
                    <Button
                      size="small"
                      variant="contained"
                      disabled={setModeratorMutation.isMutating}
                      onClick={() => {
                        setModeratorMutation.trigger({
                          roomId: gameState.roomId,
                          playerId: getPlayerId(),
                          isModerator: false,
                          targetSpectatorId: spectator.id,
                        })
                      }}
                    >
                      {t('demoteMod')}
                    </Button>
                  )}
                </Box>
              ))}
            </Box>
          </Grid>
        )}
        {!gameState.selfPlayer && (
          <Grid>
            <Button
              variant='contained'
              onClick={() => {
                navigate(`/join-game?roomId=${gameState.roomId}`)
              }}
              startIcon={<GroupAdd />}
            >
              {(t('joinGame'))}
            </Button>
          </Grid>
        )}
      </Grid>
      <AddAiPlayer
        addAiPlayerDialogOpen={addAiPlayerDialogOpen}
        setAddAiPlayerDialogOpen={setAddAiPlayerDialogOpen}
      />
    </>
  )
}

export default WaitingRoom
