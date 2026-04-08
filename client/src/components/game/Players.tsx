import { Badge, Box, Button, Chip, Grid, MenuItem, Paper, TextField, Tooltip, Typography, useTheme } from "@mui/material"
import { colord } from 'colord'
import { useGameStateContext } from "../../contexts/GameStateContext"
import { Close, MonetizationOn } from "@mui/icons-material"
import OverflowTooltip from "../utilities/OverflowTooltip"
import InfluenceIcon from "../icons/InfluenceIcon"
import { LIGHT_COLOR_MODE } from "../../contexts/MaterialThemeContext"
import { getPlayerId, getWaitingOnPlayers } from "../../helpers/players"
import { PlayerActions, PlayerControllers } from "@shared"
import useGameMutation from "../../hooks/useGameMutation"
import Bot from "../icons/Bot"
import { useTranslationContext } from "../../contexts/TranslationsContext"
import { useState } from "react"

function Players({ inWaitingRoom = false }: Readonly<{ inWaitingRoom?: boolean }>) {
  const { gameState } = useGameStateContext()
  const { t } = useTranslationContext()
  const theme = useTheme()
  const [selectedSpectatorIds, setSelectedSpectatorIds] = useState<Record<string, string>>({})

  const { trigger, isMutating } = useGameMutation<{
    roomId: string, playerId: string, playerName: string
  }>({ action: PlayerActions.removeFromGame })
  const controllerMutation = useGameMutation<{
    roomId: string
    playerId: string
    targetPlayerName: string
    targetController: PlayerControllers
    spectatorId?: string
  }>({ action: PlayerActions.setPlayerController })
  const moderatorMutation = useGameMutation<{
    roomId: string
    playerId: string
    isModerator: boolean
    targetPlayerName?: string
    targetSpectatorId?: string
  }>({ action: PlayerActions.setModerator })

  if (!gameState) {
    return null
  }

  const colorModeFactor = theme.palette.mode === LIGHT_COLOR_MODE ? -1 : 1
  const waitingOnPlayers = getWaitingOnPlayers(gameState)
  const creatorCanManageSeats = gameState.isStarted && gameState.selfIsCreator && !inWaitingRoom
  const availableSpectators = gameState.spectators ?? []
  const gameIsOver = gameState.players.filter(({ influenceCount }) => influenceCount).length === 1
  const selfIsPrivileged = gameState.selfIsCreator || gameState.selfIsModerator
  const canManageModerators = inWaitingRoom && selfIsPrivileged
  const currentPlayerName = gameState.selfPlayer?.name

  return (
    <Grid container justifyContent="center" spacing={3}>
      {gameState.players
        .map(({ name, color, coins, influenceCount, deadInfluences, influences: liveInfluences, ai, personality, allegiance, isModerator }, index) => {
          const playerColor = gameState.isStarted && !influenceCount ? '#777777' : color
          const cardTextColor = theme.palette.mode === LIGHT_COLOR_MODE ? 'white' : 'black'
          const isWaitingOnPlayer = waitingOnPlayers.some(({ name: waitingOnName }) => waitingOnName === name)
          const canRemovePlayer = inWaitingRoom
            && gameState.players.length > 1
            && (selfIsPrivileged || currentPlayerName === name)
          const canPromoteToModerator = canManageModerators && !ai && !isModerator
          const canDemoteModerator = canManageModerators && !ai && isModerator && gameState.selfIsCreator

          const influences = gameState.isStarted ? [
            ...deadInfluences,
            ...(gameIsOver
              ? (liveInfluences ?? Array.from({ length: influenceCount }, () => undefined))
              : Array.from({ length: influenceCount }, () => undefined))
          ] : Array.from({ length: 2 }, () => undefined)
          const selectedSpectatorId = availableSpectators.some(({ id }) => id === selectedSpectatorIds[name])
            ? selectedSpectatorIds[name]
            : ''

          return (
            <Badge
              key={index}
              invisible={!canRemovePlayer}
              badgeContent={
                <Button
                  sx={{
                    p: 0,
                    height: '28px',
                    width: '28px',
                    minWidth: 'unset',
                    borderRadius: '28px',
                    background: color
                  }}
                  disabled={isMutating}
                  variant="contained"
                  onClick={() => {
                    trigger({
                      roomId: gameState.roomId,
                      playerId: getPlayerId(),
                      playerName: name
                    })
                  }}
                >
                  <Close />
                </Button>
              }
            >
              <Paper
                elevation={isWaitingOnPlayer ? 5 : 1}
                sx={{
                  color: 'white',
                  alignContent: 'center',
                  background: playerColor,
                  borderRadius: 3,
                  p: 1,
                  width: theme.isLargeScreen ? '7rem' : '6rem',
                  transition: theme.transitions.create(['transform', 'box-shadow']),
                  animation: isWaitingOnPlayer ? 'pulsePlayer 1.5s infinite' : undefined,
                  "@keyframes pulsePlayer": {
                    "0%": { transform: 'scale(1)' },
                    "50%": { transform: 'scale(1.06)' },
                    "100%": { transform: 'scale(1)' }
                  },
                }}>
                <Typography variant="h6" sx={{
                  fontWeight: 'bold',
                  color: cardTextColor
                }}
                >
                  <OverflowTooltip>{name}</OverflowTooltip>
                </Typography>
                {isModerator && (
                  <Chip
                    size="small"
                    label={t('moderator')}
                    sx={{ mt: 0.5, mb: 0.5, fontWeight: 'bold' }}
                  />
                )}
                {gameState.settings.enableReformation && allegiance && (
                  <Typography variant="caption" sx={{ color: cardTextColor, display: 'block' }}>
                    {t(allegiance as never)}
                  </Typography>
                )}
                <Typography variant="h6" sx={{ color: cardTextColor }}>
                  {ai && (
                    <Tooltip title={
                      personality ? (
                        <>
                          <Typography>
                            {t('vengefulness')}
                            {`: ${personality?.vengefulness}`}%
                          </Typography>
                          <Typography>
                            {t('honesty')}
                            {`: ${personality?.honesty}`}%
                          </Typography>
                          <Typography>
                            {t('skepticism')}
                            {`: ${personality?.skepticism}`}%
                          </Typography>
                        </>
                      ) : (
                        <Typography>
                          {t('personalityIsHidden')}
                        </Typography>
                      )
                    }>
                      <Bot sx={{ verticalAlign: 'text-bottom' }} />
                    </Tooltip>
                  )}
                  <MonetizationOn sx={{ verticalAlign: 'text-bottom' }} />{` ${coins}`}
                </Typography>
                <Grid
                  container mt={0.5}
                  spacing={1}
                  justifyContent='center'
                  flexWrap="nowrap"
                >
                  {influences.map((influence, index) => {
                    return (
                      <Grid
                        key={index}
                        sx={{
                          justifyContent: 'center',
                          alignContent: 'center',
                          height: '44px',
                          width: '44px',
                          background: colord(playerColor).darken(colorModeFactor * 0.25).toHex(),
                          padding: 0.5,
                          borderRadius: 2
                        }}>
                        <Tooltip
                          title={
                            influence && (
                              <Typography variant="h6">
                                {t(influence)}
                              </Typography>
                            )
                          }
                        >
                          <span>
                            <InfluenceIcon sx={{ fontSize: '32px', color: colord(playerColor).lighten(colorModeFactor * 0.2).toHex() }} influence={influence} />
                          </span>
                        </Tooltip>
                      </Grid>
                    )
                  })}
                </Grid>
                {inWaitingRoom && (canPromoteToModerator || canDemoteModerator) && (
                  <Box mt={1} display="grid" gap={1}>
                    {canPromoteToModerator && (
                      <Button
                        size="small"
                        variant="contained"
                        disabled={moderatorMutation.isMutating}
                        onClick={() => {
                          moderatorMutation.trigger({
                            roomId: gameState.roomId,
                            playerId: getPlayerId(),
                            isModerator: true,
                            targetPlayerName: name,
                          })
                        }}
                      >
                        {t('promoteToMod')}
                      </Button>
                    )}
                    {canDemoteModerator && (
                      <Button
                        size="small"
                        variant="contained"
                        disabled={moderatorMutation.isMutating}
                        onClick={() => {
                          moderatorMutation.trigger({
                            roomId: gameState.roomId,
                            playerId: getPlayerId(),
                            isModerator: false,
                            targetPlayerName: name,
                          })
                        }}
                      >
                        {t('demoteMod')}
                      </Button>
                    )}
                  </Box>
                )}
                {creatorCanManageSeats && influenceCount > 0 && (
                  <Box mt={1} display="grid" gap={1}>
                    {!ai && (
                      <Button
                        size="small"
                        variant="contained"
                        disabled={controllerMutation.isMutating}
                        onClick={() => {
                          controllerMutation.trigger({
                            roomId: gameState.roomId,
                            playerId: getPlayerId(),
                            targetPlayerName: name,
                            targetController: PlayerControllers.Bot
                          })
                        }}
                      >
                        {t('switchToBot')}
                      </Button>
                    )}
                    {ai && (
                      <>
                        <TextField
                          select
                          size="small"
                          label={t('assignToSpectator')}
                          disabled={!availableSpectators.length || controllerMutation.isMutating}
                          value={selectedSpectatorId}
                          onChange={(event) => {
                            setSelectedSpectatorIds((current) => ({
                              ...current,
                              [name]: event.target.value
                            }))
                          }}
                        >
                          {availableSpectators.map((spectator) => (
                            <MenuItem key={spectator.id} value={spectator.id}>
                              {spectator.name}
                            </MenuItem>
                          ))}
                        </TextField>
                        <Button
                          size="small"
                          variant="contained"
                          disabled={controllerMutation.isMutating || !selectedSpectatorId}
                          onClick={() => {
                            controllerMutation.trigger({
                              roomId: gameState.roomId,
                              playerId: getPlayerId(),
                              targetPlayerName: name,
                              targetController: PlayerControllers.Human,
                              spectatorId: selectedSpectatorId
                            })
                          }}
                        >
                          {t('assignToSpectator')}
                        </Button>
                      </>
                    )}
                  </Box>
                )}
              </Paper>
            </Badge>
          )
        })}
    </Grid>
  )
}

export default Players
