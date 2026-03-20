import { useState, createContext, useContext, ReactNode, useEffect, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { PlayerActions, PublicGameState, DehydratedPublicGameState, ServerEvents, isSameState, rehydratePublicGameState } from '@shared'
import { getPlayerId } from '../helpers/players'
import { useSearchParams } from 'react-router'
import { useWebSocketContext } from './WebSocketContext'
import { getGameActionUrl } from '../helpers/api'
import { useTranslationContext } from './TranslationsContext'
import { useDisplayName } from '../hooks/useDisplayName'
import { useAuthContext } from './AuthContext'

type GameStateContextType = {
  gameState?: PublicGameState | undefined,
  setDehydratedGameState: (newGameState: DehydratedPublicGameState) => void
  hasInitialStateLoaded: boolean
}

export const GameStateContext = createContext<GameStateContextType>({
  setDehydratedGameState: () => { },
  hasInitialStateLoaded: false
})

export function GameStateContextProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [hasInitialStateLoaded, setHasInitialStateLoaded] = useState(false)
  const [dehydratedGameState, setDehydratedGameState] = useState<DehydratedPublicGameState>()
  const [searchParams] = useSearchParams()
  const { socket, isConnected } = useWebSocketContext()
  const { language } = useTranslationContext()
  const { displayName } = useDisplayName()
  const { user } = useAuthContext()

  const roomId = searchParams.get('roomId')
  const gameStateRequestParams = useMemo(() => ({
    roomId: roomId ?? '',
    playerId: getPlayerId(),
    ...(displayName && { spectatorName: displayName }),
    ...(user?.uid && { uid: user.uid }),
    ...(user?.photoURL && { photoURL: user.photoURL }),
    language
  }), [displayName, language, roomId, user?.photoURL, user?.uid])

  const gameState = useMemo(() =>
    dehydratedGameState ? rehydratePublicGameState(dehydratedGameState) : undefined,
    [dehydratedGameState]
  )

  const setDehydratedGameStateIfChanged = useCallback((newState: DehydratedPublicGameState) => {
    setDehydratedGameState((prevState) => prevState && isSameState(prevState, newState) ? prevState : newState)
  }, [setDehydratedGameState])

  const handleGameStateResponse = useCallback(async (response: Response) => {
    if (response.ok) {
      const { gameState: newState } = await response.json()
      setDehydratedGameStateIfChanged(newState)
    }
    setHasInitialStateLoaded(true)
  }, [setDehydratedGameStateIfChanged, setHasInitialStateLoaded])

  useSWR<void, Error>(
    roomId
      ? `${getGameActionUrl(PlayerActions.gameState)}?${new URLSearchParams(
        Object.entries(gameStateRequestParams).reduce((queryParams, [key, value]) => {
          if (typeof value === 'string' && value.length) {
            queryParams[key] = value
          }
          return queryParams
        }, {} as Record<string, string>)
      ).toString()}`
      : null,
    async function (input: RequestInfo, init?: RequestInit) {
      try {
        const response = await fetch(input, init)
        handleGameStateResponse(response)
      } catch (error) {
        console.error(error)
      }
    },
    { refreshInterval: 2000, isPaused: () => !roomId || isConnected }
  )

  useEffect(() => {
    if (!roomId || !socket || !isConnected) {
      if (!roomId) setDehydratedGameState(undefined)
      return
    }

    socket.removeAllListeners(ServerEvents.gameStateChanged).on(ServerEvents.gameStateChanged, (dehydratedGameState) => {
      setDehydratedGameStateIfChanged(dehydratedGameState)
      setHasInitialStateLoaded(true)
    })
    socket.removeAllListeners(ServerEvents.error).on(ServerEvents.error, (error) => {
      console.error(error)
      setHasInitialStateLoaded(true)
    })
    socket.emit(PlayerActions.gameState, gameStateRequestParams)

    const intervalId = setInterval(() => {
      socket.emit(PlayerActions.gameState, gameStateRequestParams)
    }, 5000)

    return () => { clearInterval(intervalId) }
  }, [roomId, socket, isConnected, gameStateRequestParams, setDehydratedGameStateIfChanged])

  const playersLeft = gameState?.players.filter(({ influenceCount }) => influenceCount)
  const gameIsOver = playersLeft?.length === 1
  const speedRoundActive = gameState?.settings.speedRoundSeconds
  const autoMovePlayersActive = gameState?.isStarted && !gameIsOver && (speedRoundActive || gameState?.players.some(({ ai, influenceCount }) =>
    ai && influenceCount))

  useEffect(() => {
    if (!roomId || !autoMovePlayersActive) {
      return
    }

    const interval = setInterval(() => {
      if (socket && isConnected) {
        socket.emit(PlayerActions.checkAutoMove, { roomId, playerId: getPlayerId(), language }, ({ gameState: newGameState }: { gameState?: DehydratedPublicGameState }) => {
          if (newGameState) {
            setDehydratedGameStateIfChanged(newGameState)
          }
        })
      } else {
        fetch(`${getGameActionUrl(PlayerActions.checkAutoMove)}?roomId=${encodeURIComponent(roomId)}&playerId=${encodeURIComponent(getPlayerId())}`)
          .then(handleGameStateResponse)
          .catch((error) => {
            console.error(error)
          })
      }
    }, isConnected ? 500 : 1000)

    return () => {
      clearInterval(interval)
    }
  }, [roomId, socket, isConnected, language, autoMovePlayersActive, handleGameStateResponse, setDehydratedGameStateIfChanged])

  const contextValue = useMemo(() => ({
    gameState,
    setDehydratedGameState,
    hasInitialStateLoaded
  }), [gameState, setDehydratedGameState, hasInitialStateLoaded])

  return (
    <GameStateContext.Provider value={contextValue}>
      {children}
    </GameStateContext.Provider>
  )
}

export const useGameStateContext = () => useContext(GameStateContext)
