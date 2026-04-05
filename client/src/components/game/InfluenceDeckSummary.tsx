import { Box, Typography, useTheme } from "@mui/material"
import { SxProps, Theme, alpha } from "@mui/material/styles"
import { getCountOfEachInfluence, getDeckInfluences } from "@shared"
import { useGameStateContext } from "../../contexts/GameStateContext"
import { useTranslationContext } from "../../contexts/TranslationsContext"
import InfluenceIcon from "../icons/InfluenceIcon"
import CoupTypography from "../utilities/CoupTypography"

function InfluenceDeckSummary({
  containerSx,
  listSx,
}: Readonly<{
  containerSx?: SxProps<Theme>
  listSx?: SxProps<Theme>
}>) {
  const { gameState } = useGameStateContext()
  const { t } = useTranslationContext()
  const theme = useTheme()

  if (!gameState) {
    return null
  }

  const countOfEachInfluence = getCountOfEachInfluence(gameState.players.length)
  const deckInfluences = getDeckInfluences(gameState.settings)

  return (
    <Box sx={containerSx ?? {}}>
      <CoupTypography variant="body1" addTextShadow>
        {t('countOfEachCardType', {
          count: countOfEachInfluence
        })}
      </CoupTypography>
      <Box
        display="flex"
        flexWrap="wrap"
        gap={1}
        justifyContent="center"
        mt={1}
        sx={listSx ?? {}}
      >
        {deckInfluences.map((influence) => (
          <Box
            key={influence}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1,
              py: 0.5,
              borderRadius: 999,
              backgroundColor: alpha(theme.influenceColors[influence], 0.2),
              border: `1px solid ${alpha(theme.influenceColors[influence], 0.5)}`
            }}
          >
            <InfluenceIcon
              influence={influence}
              sx={{
                fontSize: '1.1rem',
                color: theme.influenceColors[influence]
              }}
            />
            <Typography variant="body2">
              {t(influence)} ×{countOfEachInfluence}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export default InfluenceDeckSummary
