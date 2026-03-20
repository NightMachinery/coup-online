import { Alert, Box, Button, CircularProgress, Grid, Link } from "@mui/material"
import GameBoard from "../game/GameBoard"
import WaitingRoom from "../game/WaitingRoom"
import { useGameStateContext } from "../../contexts/GameStateContext"
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router"
import { useTranslationContext } from "../../contexts/TranslationsContext"
import { Visibility } from "@mui/icons-material"
import CoupTypography from '../utilities/CoupTypography'
import { useDisplayName } from '../../hooks/useDisplayName'
import { useAuthContext } from '../../contexts/AuthContext'
import { useEffect } from 'react'

interface GameProps {
  leftDrawerOpen: boolean
  rightDrawerOpen: boolean
}

function Game({ leftDrawerOpen, rightDrawerOpen }: GameProps) {
  const { gameState, hasInitialStateLoaded } = useGameStateContext()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { t } = useTranslationContext()
  const { displayName, loading: displayNameLoading } = useDisplayName()
  const { loading: authLoading } = useAuthContext()
  const roomId = searchParams.get('roomId')

  useEffect(() => {
    if (!roomId || !gameState || !hasInitialStateLoaded || authLoading || displayNameLoading) {
      return
    }

    if (!gameState.selfPlayer && !displayName) {
      navigate(`/join-game?roomId=${roomId}`, { replace: true })
    }
  }, [authLoading, displayName, displayNameLoading, gameState, hasInitialStateLoaded, navigate, roomId])

  if (roomId && (authLoading || displayNameLoading || !hasInitialStateLoaded)) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'var(--app-content-height)' }}>
        <CircularProgress size={50} />
      </Box>
    )
  }

  if (!gameState) {
    return (
      <Grid mt={2} container spacing={2} direction="column">
        <Grid>
          <CoupTypography variant="h6" my={3} addTextShadow>
            {t('gameNotFound')}
          </CoupTypography>
        </Grid>
        <Grid>
          <Link component={RouterLink} to={`/`}>
            <Button variant="contained">
              {t('home')}
            </Button>
          </Link>
        </Grid>
      </Grid>
    )
  }

  const spectatingAlert = gameState && !gameState.selfPlayer && (
    <Alert
      icon={<Visibility fontSize="inherit" />}
      severity="info"
      sx={{
        fontSize: 'larger',
        p: 0,
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {t('youAreSpectating')}
    </Alert>
  )

  return gameState.isStarted ? (
    // Google Translate doesn't work well with some React components
    // https://github.com/facebook/react/issues/11538
    // https://issues.chromium.org/issues/41407169
    <div className="notranslate">
      {spectatingAlert}
      <GameBoard leftDrawerOpen={leftDrawerOpen} rightDrawerOpen={rightDrawerOpen} />
    </div>
  ) : (
    <>
      {spectatingAlert}
      <WaitingRoom />
    </>
  )
}

export default Game
