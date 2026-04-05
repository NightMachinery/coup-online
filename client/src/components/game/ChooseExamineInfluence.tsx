import { Grid } from "@mui/material"
import { Influences, PlayerActions } from "@shared"
import { useState } from "react"
import { getPlayerId } from "../../helpers/players"
import { useGameStateContext } from "../../contexts/GameStateContext"
import PlayerActionConfirmation from "./PlayerActionConfirmation"
import { useTranslationContext } from "../../contexts/TranslationsContext"
import GrowingButton from "../utilities/GrowingButton"
import CoupTypography from "../utilities/CoupTypography"

function ChooseExamineInfluence() {
  const [selectedInfluence, setSelectedInfluence] = useState<Influences>()
  const { gameState } = useGameStateContext()
  const { t } = useTranslationContext()

  if (!gameState?.selfPlayer || !gameState.pendingExamine) {
    return null
  }

  if (selectedInfluence) {
    return (
      <PlayerActionConfirmation
        message={t('chooseInfluenceToReveal', {
          primaryInfluence: selectedInfluence,
          gameState,
        })}
        action={PlayerActions.chooseExamineInfluence}
        variables={{
          roomId: gameState.roomId,
          playerId: getPlayerId(),
          influence: selectedInfluence,
        }}
        onCancel={() => {
          setSelectedInfluence(undefined)
        }}
      />
    )
  }

  return (
    <>
      <CoupTypography variant="h6" sx={{ fontWeight: 'bold', my: 1 }} addTextShadow>
        {t('chooseInfluenceToReveal')}
      </CoupTypography>
      <Grid container spacing={2} justifyContent="center">
        {gameState.selfPlayer.influences
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

export default ChooseExamineInfluence
