import { Grid, Paper, Typography } from "@mui/material"
import { colord } from "colord"
import { useGameStateContext } from "../../contexts/GameStateContext"
import InfluenceCard from "./InfluenceCard"

function EndGamePlayerCards() {
  const { gameState } = useGameStateContext()

  if (!gameState) {
    return null
  }

  const playersLeft = gameState.players.filter(({ influenceCount }) => influenceCount)
  if (playersLeft.length !== 1) {
    return null
  }

  const winner = playersLeft[0]
  const revealedInfluences = [...(winner.influences ?? [])]

  if (!revealedInfluences.length) {
    return null
  }

  return (
    <Grid container justifyContent="center">
      <Grid size={{ xs: 12, sm: 10, md: 8 }}>
        <Paper
          sx={{
            p: 2,
            borderRadius: 3,
            backgroundColor: colord(winner.color).alpha(0.18).toRgbString(),
            border: `1px solid ${colord(winner.color).alpha(0.55).toRgbString()}`
          }}
        >
          <Typography
            variant="h5"
            sx={{
              mb: 2,
              fontWeight: "bold",
              color: winner.color
            }}
          >
            {winner.name} 👑
          </Typography>
          <Grid container justifyContent="center" spacing={2}>
            {revealedInfluences
              .sort((a, b) => a.localeCompare(b))
              .map((influence, index) => (
                <Grid key={`${winner.name}-${influence}-${index}`} size={{ xs: 12, sm: 6 }}>
                  <InfluenceCard influence={influence} />
                </Grid>
              ))}
          </Grid>
        </Paper>
      </Grid>
    </Grid>
  )
}

export default EndGamePlayerCards
