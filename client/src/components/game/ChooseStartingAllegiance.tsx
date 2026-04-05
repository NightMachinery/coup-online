import { Grid } from "@mui/material"
import { Allegiances, PlayerActions } from "@shared"
import { getPlayerId } from "../../helpers/players"
import { useGameStateContext } from "../../contexts/GameStateContext"
import { useState } from "react"
import PlayerActionConfirmation from "./PlayerActionConfirmation"
import { useTranslationContext } from "../../contexts/TranslationsContext"
import GrowingButton from "../utilities/GrowingButton"
import CoupTypography from "../utilities/CoupTypography"

function ChooseStartingAllegiance() {
  const [selectedAllegiance, setSelectedAllegiance] = useState<Allegiances>()
  const { gameState } = useGameStateContext()
  const { t } = useTranslationContext()

  if (!gameState?.pendingStartingAllegiance) {
    return null
  }

  if (selectedAllegiance) {
    return (
      <PlayerActionConfirmation
        message={<>{t('chooseStartingAllegiance')}: {t(selectedAllegiance as never)}</>}
        action={PlayerActions.chooseStartingAllegiance}
        variables={{
          roomId: gameState.roomId,
          playerId: getPlayerId(),
          allegiance: selectedAllegiance,
        }}
        onCancel={() => {
          setSelectedAllegiance(undefined)
        }}
      />
    )
  }

  return (
    <>
      <CoupTypography variant="h6" sx={{ fontWeight: 'bold', my: 1 }} addTextShadow>
        {t('chooseStartingAllegiance')}
      </CoupTypography>
      <Grid container spacing={2} justifyContent="center">
        {Object.values(Allegiances).map((allegiance) => (
          <GrowingButton
            key={allegiance}
            onClick={() => {
              setSelectedAllegiance(allegiance)
            }}
            variant="contained"
          >
            {t(allegiance as never)}
          </GrowingButton>
        ))}
      </Grid>
    </>
  )
}

export default ChooseStartingAllegiance
