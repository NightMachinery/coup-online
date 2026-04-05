import { Grid } from "@mui/material"
import { EmbezzleChallengeResponses, PlayerActions } from "@shared"
import { useState } from "react"
import { getPlayerId } from "../../helpers/players"
import { useGameStateContext } from "../../contexts/GameStateContext"
import PlayerActionConfirmation from "./PlayerActionConfirmation"
import { useTranslationContext } from "../../contexts/TranslationsContext"
import GrowingButton from "../utilities/GrowingButton"
import CoupTypography from "../utilities/CoupTypography"

function ChooseEmbezzleChallengeDecision() {
  const [selectedResponse, setSelectedResponse] = useState<EmbezzleChallengeResponses>()
  const { gameState } = useGameStateContext()
  const { t } = useTranslationContext()

  if (!gameState?.pendingEmbezzleChallengeDecision) {
    return null
  }

  if (selectedResponse) {
    return (
      <PlayerActionConfirmation
        message={t(selectedResponse as never)}
        action={PlayerActions.embezzleChallengeDecision}
        variables={{
          roomId: gameState.roomId,
          playerId: getPlayerId(),
          response: selectedResponse,
        }}
        onCancel={() => {
          setSelectedResponse(undefined)
        }}
      />
    )
  }

  return (
    <>
      <CoupTypography variant="h6" sx={{ fontWeight: 'bold', my: 1 }} addTextShadow>
        {t('chooseEmbezzleChallengeDecision')}
      </CoupTypography>
      <Grid container spacing={2} justifyContent="center">
        {Object.values(EmbezzleChallengeResponses).map((response) => (
          <GrowingButton
            key={response}
            onClick={() => {
              setSelectedResponse(response)
            }}
            variant="contained"
          >
            {t(response as never)}
          </GrowingButton>
        ))}
      </Grid>
    </>
  )
}

export default ChooseEmbezzleChallengeDecision
