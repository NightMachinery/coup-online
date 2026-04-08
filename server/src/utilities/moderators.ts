import { GameState } from '../../../shared/types/game'
import { getConnectedViewerIdsForRoom, getRoomPresence } from './roomPresence'

export const getModeratorViewerIds = (gameState: Pick<GameState, 'moderatorViewerIds'>) =>
  new Set(gameState.moderatorViewerIds)

export const getConnectedModeratorViewerIds = ({
  gameState,
}: {
  gameState: Pick<GameState, 'roomId' | 'moderatorViewerIds'>
}) => {
  const connectedViewerIds = getConnectedViewerIdsForRoom(gameState.roomId)
  return new Set(
    gameState.moderatorViewerIds.filter((viewerId) => connectedViewerIds.has(viewerId))
  )
}

export const viewerIsConnectedLobbyAuthority = ({
  gameState,
  playerId,
}: {
  gameState: Pick<GameState, 'creatorPlayerId' | 'moderatorViewerIds' | 'roomId'>
  playerId: string
}) => {
  const creatorIsConnected = gameState.creatorPlayerId
    && !!getRoomPresence({ roomId: gameState.roomId, playerId: gameState.creatorPlayerId })

  return (
    (creatorIsConnected && playerId === gameState.creatorPlayerId)
    || getConnectedModeratorViewerIds({ gameState }).has(playerId)
  )
}

export const hasConnectedLobbyAuthority = ({
  gameState,
}: {
  gameState: Pick<GameState, 'creatorPlayerId' | 'moderatorViewerIds' | 'roomId'>
}) => {
  const creatorIsConnected = gameState.creatorPlayerId
    && !!getRoomPresence({ roomId: gameState.roomId, playerId: gameState.creatorPlayerId })

  return !!creatorIsConnected || getConnectedModeratorViewerIds({ gameState }).size > 0
}

export const reconcileModerators = (state: GameState) => {
  const connectedViewerIds = getConnectedViewerIdsForRoom(state.roomId)
  const currentPlayerIds = new Set(state.players.map(({ id }) => id))
  const currentModeratorViewerIds = [...new Set(state.moderatorViewerIds)].filter((viewerId) =>
    currentPlayerIds.has(viewerId) || connectedViewerIds.has(viewerId)
  )

  const eligiblePlayers = state.players.filter(({ id, ai, influences }) =>
    !ai
    && connectedViewerIds.has(id)
    && (!state.isStarted || influences.length > 0)
  )
  const connectedSeatedModeratorExists = eligiblePlayers.some(({ id }) =>
    currentModeratorViewerIds.includes(id)
  )

  const nextModeratorViewerIds = [...currentModeratorViewerIds]

  if (!connectedSeatedModeratorExists && eligiblePlayers.length > 0) {
    const nonCreatorEligiblePlayers = eligiblePlayers.filter(({ id }) => id !== state.creatorPlayerId)
    const promotionPool = nonCreatorEligiblePlayers.length ? nonCreatorEligiblePlayers : eligiblePlayers
    const promotedPlayer = promotionPool[Math.floor(Math.random() * promotionPool.length)]
    if (!nextModeratorViewerIds.includes(promotedPlayer.id)) {
      nextModeratorViewerIds.push(promotedPlayer.id)
    }
  }

  state.moderatorViewerIds = nextModeratorViewerIds
}
