import { Grid } from "@mui/material"
import { ActionAttributes, EventMessages, Influences, PlayerActions, Responses, canPlayerBlockAction, getLegalBlockInfluences } from '@shared'
import { useMemo, useState } from "react"
import { getPlayerId } from "../../helpers/players"
import { useGameStateContext } from "../../contexts/GameStateContext"
import PlayerActionConfirmation from "./PlayerActionConfirmation"
import CoupTypography from "../utilities/CoupTypography"
import { useTranslationContext } from "../../contexts/TranslationsContext"
import GrowingButton from "../utilities/GrowingButton"
import getResponseIcon from "../../helpers/getResponseIcon"

function ChooseActionResponse() {
  const [selectedResponse, setSelectedResponse] = useState<Responses>()
  const [selectedInfluence, setSelectedInfluence] = useState<Influences>()
  const { gameState } = useGameStateContext()
  const { t } = useTranslationContext()

  const legalBlockInfluences = useMemo(() => (
    gameState?.pendingAction
      ? getLegalBlockInfluences(gameState.settings, gameState.pendingAction.action)
      : []
  ), [gameState])
  const canSelfLegallyBlockPendingAction = useMemo(() => (
    gameState?.selfPlayer && gameState?.pendingAction && gameState.turnPlayer
      ? canPlayerBlockAction({
        gameState,
        action: gameState.pendingAction.action,
        actionPlayerName: gameState.turnPlayer,
        blockPlayerName: gameState.selfPlayer.name,
      })
      : false
  ), [gameState])

  if (!gameState?.selfPlayer || !gameState?.pendingAction) {
    return null
  }

  const pendingAction = gameState.pendingAction

  if (selectedResponse && (selectedResponse !== Responses.Block || selectedInfluence)) {
    return (
      <PlayerActionConfirmation
        message={selectedInfluence
          ? t('blockAsInfluence', {
            gameState,
            primaryInfluence: selectedInfluence,
          })
          : t(selectedResponse)}
        action={PlayerActions.actionResponse}
        variables={{
          ...(selectedInfluence && { claimedInfluence: selectedInfluence }),
          playerId: getPlayerId(),
          response: selectedResponse,
          roomId: gameState.roomId,
        }}
        onCancel={() => {
          setSelectedResponse(undefined)
          setSelectedInfluence(undefined)
        }}
      />
    )
  }

  if (selectedResponse === Responses.Block) {
    return (
      <>
        <CoupTypography
          my={1}
          variant="h6"
          fontWeight="bold"
          onBack={() => {
            setSelectedResponse(undefined)
          }}
          addTextShadow
        >
          {t('claimAnInfluence')}
        </CoupTypography>
        <Grid container spacing={2} justifyContent="center">
          {legalBlockInfluences
            .sort((a, b) => a.localeCompare(b))
            .map((influence) => (
              <GrowingButton
                key={influence}
                onClick={() => {
                  setSelectedInfluence(influence)
                }}
                color={influence}
                variant="contained"
              >
                {t(influence as never)}
              </GrowingButton>
            ))}
        </Grid>
      </>
    )
  }

  return (
    <>
      <CoupTypography variant="h6" sx={{ fontWeight: 'bold', my: 1 }} addTextShadow>
        {t(EventMessages.ActionPending, {
          action: pendingAction.action,
          gameState,
          primaryPlayer: gameState.turnPlayer!,
          secondaryPlayer: pendingAction.targetPlayer,
        })}
      </CoupTypography>
      <Grid container spacing={2} justifyContent="center">
        {Object.values(Responses)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map((response, index) => {
            if (
              response === Responses.Challenge
              && (
                !ActionAttributes[pendingAction.action].challengeable
                || gameState.pendingActionChallenge
                || pendingAction.claimConfirmed
              )
            ) {
              return null
            }

            if (
              response === Responses.Block
              && (
                !ActionAttributes[pendingAction.action].blockable
                || !legalBlockInfluences.length
                || !canSelfLegallyBlockPendingAction
                || (
                  pendingAction.targetPlayer
                  && gameState.selfPlayer!.name !== pendingAction.targetPlayer
                )
              )
            ) {
              return null
            }

            const ResponseIcon = getResponseIcon(response)

            return (
              <GrowingButton
                key={index}
                onClick={() => {
                  setSelectedResponse(response)
                }}
                variant="contained"
                startIcon={<ResponseIcon />}
              >
                {t(response)}
              </GrowingButton>
            )
          })}
      </Grid>
    </>
  )
}

export default ChooseActionResponse
