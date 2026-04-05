import { Box, Grid, Tooltip, Typography, useTheme } from "@mui/material"
import { ActionAttributes, Actions, EventMessages, PlayerActions, getLegalTargetPlayers } from '@shared'
import { useMemo, useState } from "react"
import { getPlayerId } from "../../helpers/players"
import { useGameStateContext } from "../../contexts/GameStateContext"
import PlayerActionConfirmation from "./PlayerActionConfirmation"
import CoupTypography from "../utilities/CoupTypography"
import { useTranslationContext } from "../../contexts/TranslationsContext"
import GrowingButton from "../utilities/GrowingButton"

const getCoinsRequiredForAction = ({
  action,
  playerName,
  targetPlayer,
}: {
  action: Actions
  playerName: string
  targetPlayer?: string
}) => {
  if (action === Actions.Convert) {
    return !targetPlayer || targetPlayer === playerName ? 1 : 2
  }

  return ActionAttributes[action].coinsRequired ?? 0
}

function ChooseAction() {
  const [selectedAction, setSelectedAction] = useState<Actions>()
  const [selectedTargetPlayer, setSelectedTargetPlayer] = useState<string>()
  const { gameState } = useGameStateContext()
  const { t } = useTranslationContext()
  const theme = useTheme()

  const legalTargetPlayers = useMemo(() => {
    if (!gameState?.selfPlayer || !selectedAction) {
      return []
    }

    return getLegalTargetPlayers({
      gameState,
      action: selectedAction,
      sourcePlayerName: gameState.selfPlayer.name,
    })
  }, [gameState, selectedAction])

  if (!gameState?.selfPlayer) {
    return null
  }

  const selectedActionAttributes = selectedAction ? ActionAttributes[selectedAction] : undefined
  const actionIsReadyToConfirm = !!selectedAction && (
    selectedActionAttributes?.targetMode === 'none'
    || ((selectedActionAttributes?.targetMode === 'required' || selectedActionAttributes?.targetMode === 'optional') && !!selectedTargetPlayer)
  )

  if (selectedAction && actionIsReadyToConfirm) {
    return (
      <PlayerActionConfirmation
        message={t(EventMessages.ActionConfirm, {
          action: selectedAction,
          gameState,
          secondaryPlayer: selectedTargetPlayer,
        })}
        action={PlayerActions.action}
        variables={{
          action: selectedAction,
          playerId: getPlayerId(),
          roomId: gameState.roomId,
          ...(selectedTargetPlayer && { targetPlayer: selectedTargetPlayer }),
        }}
        onCancel={() => {
          setSelectedAction(undefined)
          setSelectedTargetPlayer(undefined)
        }}
      />
    )
  }

  if (selectedAction && selectedActionAttributes?.targetMode !== 'none') {
    return (
      <>
        <CoupTypography
          my={1}
          variant="h6"
          fontWeight="bold"
          onBack={() => {
            setSelectedAction(undefined)
            setSelectedTargetPlayer(undefined)
          }}
          addTextShadow
        >
          {t('chooseATarget')}
        </CoupTypography>
        <Grid container spacing={2} justifyContent="center">
          {legalTargetPlayers
            .filter(({ name, influenceCount }) => name === gameState.selfPlayer?.name || influenceCount > 0)
            .map((player) => {
              const paletteColor = theme.palette.augmentColor({
                color: { main: player.color },
              })

              return (
                <GrowingButton
                  key={player.name}
                  onClick={() => {
                    setSelectedTargetPlayer(player.name)
                  }}
                  sx={{
                    '&:hover': {
                      background: paletteColor.dark,
                    },
                    background: paletteColor.main,
                    color: paletteColor.contrastText,
                  }}
                  variant="contained"
                >
                  {player.name}
                </GrowingButton>
              )
            })}
        </Grid>
      </>
    )
  }

  return (
    <>
      <CoupTypography variant="h6" sx={{ fontWeight: 'bold', my: 1 }} addTextShadow>
        {t('chooseAnAction')}
      </CoupTypography>
      <Grid container spacing={2} justifyContent="center">
        {Object.entries(ActionAttributes)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([action, actionAttributes], index) => {
            const typedAction = action as Actions

            if (gameState.selfPlayer!.coins >= 10 && ![Actions.Coup, Actions.Revive].includes(typedAction)) {
              return null
            }

            if (!gameState.settings.allowRevive && typedAction === Actions.Revive) {
              return null
            }
            if (!gameState.settings.enableReformation && [Actions.Convert, Actions.Embezzle].includes(typedAction)) {
              return null
            }
            if (!gameState.settings.enableInquisitor && typedAction === Actions.Examine) {
              return null
            }

            const minimumCoinsRequired = getCoinsRequiredForAction({
              action: typedAction,
              playerName: gameState.selfPlayer!.name,
            })
            const legalTargets = actionAttributes.targetMode === 'none'
              ? []
              : getLegalTargetPlayers({
                gameState,
                action: typedAction,
                sourcePlayerName: gameState.selfPlayer!.name,
              }).filter(({ name, influenceCount }) => name === gameState.selfPlayer?.name || influenceCount > 0)
            const lackingCoins = gameState.selfPlayer!.coins < minimumCoinsRequired
            const noDeadInfluencesForRevive = typedAction === Actions.Revive && !gameState.selfPlayer!.deadInfluences.length
            const noLegalTargets = actionAttributes.targetMode !== 'none' && !legalTargets.length
            const isActionDisabled = lackingCoins || noDeadInfluencesForRevive || noLegalTargets

            return (
              <Grid key={index}>
                <Tooltip
                  title={isActionDisabled && (
                    <Box sx={{ textAlign: 'center' }}>
                      {lackingCoins && <Typography>{t('notEnoughCoins', { count: minimumCoinsRequired })}</Typography>}
                      {noDeadInfluencesForRevive && <Typography>{t('noDeadInfluences')}</Typography>}
                    </Box>
                  )}
                  placement="top"
                >
                  <span>
                    <GrowingButton
                      onClick={() => {
                        setSelectedAction(typedAction)
                        setSelectedTargetPlayer(undefined)
                      }}
                      color={typedAction}
                      variant="contained"
                      disabled={isActionDisabled}
                    >
                      {t(typedAction)}
                    </GrowingButton>
                  </span>
                </Tooltip>
              </Grid>
            )
          })}
      </Grid>
    </>
  )
}

export default ChooseAction
