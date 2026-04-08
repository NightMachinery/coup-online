import { Box } from "@mui/material"
import { getWaitingOnPlayers } from "../../helpers/players"
import { useGameStateContext } from "../../contexts/GameStateContext"
import { useTranslationContext } from "../../contexts/TranslationsContext"
import { Circle } from "@mui/icons-material"
import CoupTypography from '../utilities/CoupTypography'

function WaitingOnOtherPlayers() {
  const { gameState } = useGameStateContext()
  const { t } = useTranslationContext()

  if (!gameState) {
    return null
  }

  const waitingOnPlayers = getWaitingOnPlayers(gameState)

  if (!waitingOnPlayers.length) {
    return null
  }

  return (
    <>
      <CoupTypography variant="h6" my={1} fontWeight="bold" addTextShadow>
        {t('waitingOnOtherPlayers')}
      </CoupTypography>
      <CoupTypography addTextShadow>
        {t('waitingOnPlayersNamed', {
          players: waitingOnPlayers.map(({ name }) => name).join(', '),
          gameState,
        })}
      </CoupTypography>
      <Box>
        {waitingOnPlayers.map(({ color }) =>
          <Circle key={color} sx={{ color }} />
        )}
      </Box>
    </>
  )
}

export default WaitingOnOtherPlayers
