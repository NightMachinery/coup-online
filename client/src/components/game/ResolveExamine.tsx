import { Grid } from "@mui/material"
import { ExamineResponses, Influences, PlayerActions } from "@shared"
import { useState } from "react"
import { getPlayerId } from "../../helpers/players"
import { useGameStateContext } from "../../contexts/GameStateContext"
import PlayerActionConfirmation from "./PlayerActionConfirmation"
import { useTranslationContext } from "../../contexts/TranslationsContext"
import GrowingButton from "../utilities/GrowingButton"
import CoupTypography from "../utilities/CoupTypography"
import InfluenceCard from "./InfluenceCard"

function ExaminedInfluenceCard({ influence }: {
  influence: Influences
}) {
  return (
    <Grid container justifyContent="center" sx={{ my: 2 }}>
      <Grid sx={{ width: '100%', maxWidth: '18rem' }}>
        <InfluenceCard influence={influence} />
      </Grid>
    </Grid>
  )
}

function ResolveExamine() {
  const [selectedResponse, setSelectedResponse] = useState<ExamineResponses>()
  const { gameState } = useGameStateContext()
  const { t } = useTranslationContext()

  if (!gameState?.pendingExamine?.chosenInfluence) {
    return null
  }

  const chosenInfluence = gameState.pendingExamine.chosenInfluence

  if (selectedResponse) {
    return (
      <>
        <ExaminedInfluenceCard influence={chosenInfluence} />
        <PlayerActionConfirmation
          message={t(selectedResponse as never)}
          action={PlayerActions.resolveExamine}
          variables={{
            roomId: gameState.roomId,
            playerId: getPlayerId(),
            response: selectedResponse,
          }}
          onCancel={() => {
            setSelectedResponse(undefined)
          }}
        />
      </>
    )
  }

  return (
    <>
      <CoupTypography variant="h6" sx={{ fontWeight: 'bold', my: 1 }} addTextShadow>
        {t('chooseExamineResponse')}
      </CoupTypography>
      <ExaminedInfluenceCard influence={chosenInfluence} />
      <Grid container spacing={2} justifyContent="center">
        {Object.values(ExamineResponses).map((response) => (
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

export default ResolveExamine
