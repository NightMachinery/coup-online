import crypto from 'node:crypto'
import { ActionNotChallengeableError, ActionNotCurrentlyAllowedError, BlockMayNotBeBlockedError, ClaimedInfluenceAlreadyConfirmedError, ClaimedInfluenceInvalidError, ClaimedInfluenceRequiredError, ConnectedSpectatorRequiredError, DifferentPlayerNameError, GameInProgressError, GameNeedsAtLeast2PlayersToStartError, GameNotInProgressError, GameOverError, InsufficientCoinsError, InvalidActionAt10CoinsError, MessageDoesNotExistError, MessageIsNotYoursError, MissingInfluenceError, NoDeadInfluencesError, OnlyLobbyCreatorCanSetGameSettingsError, OnlyLobbyCreatorCanSetPlayerControllerError, OnlyLobbyCreatorCanStartGameError, PlayerAlreadyBotControlledError, PlayerAlreadyHumanControlledError, PlayerNotInGameError, ReviveNotAllowedInGameError, RoomAlreadyHasPlayerError, RoomIdAlreadyExistsError, RoomIsFullError, SpeedRoundTimerExpiredError, StateChangedSinceValidationError, TargetPlayerIsSelfError, TargetPlayerNotAllowedForActionError, TargetPlayerRequiredForActionError, UnableToFindPlayerError, UnableToForfeitError, YouAreDeadError } from "../utilities/errors"
import { ActionAttributes, Actions, AiPersonality, Allegiances, EmbezzleChallengeResponses, EventMessages, ExamineResponses, GameSettings, GameState, Influences, PlayerActions, PlayerControllers, Responses } from "../../../shared/types/game"
import { getConnectedLobbyCreatorPresence, getGameState, getPublicGameState, logEvent, logForcedMove, mutateGameState } from "../utilities/gameState"
import { generateRoomId } from "../utilities/identifiers"
import { getValue } from '../utilities/storage'
import { shuffle } from '../utilities/array'
import { addClaimedInfluence, addPlayerToGame, addUnclaimedInfluence, assignAllegiances, createNewGame, getLivingPlayers, grudgeSizes, holdGrudge, humanOpponentsRemain, isSpeedRoundTimerExpired, killPlayerInfluence, moveTurnToNextPlayer, processPendingAction, promptPlayerToLoseInfluence, removeClaimedInfluence, removePlayerFromGame, resetGame, revealAndReplaceInfluence, startGame } from "./logic"
import { canPlayerBlockAction, canPlayerChooseAction, canPlayerChooseActionChallengeResponse, canPlayerChooseActionResponse, canPlayerChooseBlockChallengeResponse, canPlayerChooseBlockResponse, canPlayerChooseEmbezzleChallengeDecision, canPlayerChooseExamineInfluence, canPlayerResolveExamine as canPlayerResolveExamine, canPlayerChooseStartingAllegiance, canTargetPlayerForAction, getLegalBlockInfluences, getRequiredInfluenceForAction } from '../../../shared/game/logic'
import { getPlayerSuggestedMove } from './ai'
import { MAX_PLAYER_COUNT } from '../../../shared/helpers/playerCount'
import { AvailableLanguageCode } from '../../../shared/i18n/availableLanguages'
import { recordBluff, recordChallengeMade, recordCoup, recordInfluenceKill, recordInfluenceClaim, recordSuccessfulBluff, recordSuccessfulChallenge } from './statsAccumulator'
import { getViewerIdForSpectator, removeRoomPresence, upsertRoomPresence } from '../utilities/roomPresence'
import { createDeckForPlayerCount } from '../utilities/deck'


const getNormalizedSettings = (settings: GameSettings): GameSettings => ({
  ...settings,
  enableReformation: settings.enableReformation ?? false,
  enableInquisitor: settings.enableInquisitor ?? false,
  allowContessaBlockExamine: settings.allowContessaBlockExamine ?? false,
})

const getCoinsRequiredForAction = ({
  action,
  playerName,
  targetPlayer,
}: {
  action: Actions
  playerName: string
  targetPlayer: string | undefined
}) => {
  if (action === Actions.Convert) {
    return !targetPlayer || targetPlayer === playerName ? 1 : 2
  }

  return ActionAttributes[action].coinsRequired ?? 0
}

const replaceAllLiveInfluences = (state: GameState, playerName: string) => {
  const player = state.players.find(({ name }) => name === playerName)
  if (!player) {
    throw new UnableToFindPlayerError()
  }

  const liveInfluences = [...player.influences]
  removeClaimedInfluence(player)
  liveInfluences.forEach((influence, index) => {
    player.influences[index] = drawReplacementInfluenceBeforeReturning(state, influence)
  })
}

const drawReplacementInfluenceBeforeReturning = (state: GameState, returnedInfluence: Influences) => {
  const replacement = state.deck.pop()
  if (!replacement) {
    throw new UnableToFindPlayerError()
  }
  state.deck.push(returnedInfluence)
  state.deck = shuffle(state.deck)
  return replacement
}

const forceExchangeExaminedInfluence = (state: GameState, playerName: string, influence: Influences) => {
  const player = state.players.find(({ name }) => name === playerName)
  if (!player) {
    throw new UnableToFindPlayerError()
  }

  const influenceIndex = player.influences.indexOf(influence)
  if (influenceIndex < 0) {
    throw new MissingInfluenceError()
  }

  player.influences.splice(influenceIndex, 1)
  player.influences.push(drawReplacementInfluenceBeforeReturning(state, influence))
}

const getPlayerInRoom = ({ gameState, playerId }: {
  gameState: GameState
  playerId: string
}) => {
  const player = gameState.players.find(({ id }) => id === playerId)

  if (!player) throw new PlayerNotInGameError()

  return player
}

const createRandomAiPersonality = (): AiPersonality => ({
  honesty: Math.floor(Math.random() * 101),
  skepticism: Math.floor(Math.random() * 101),
  vengefulness: Math.floor(Math.random() * 101),
})

const setPlayerToBotControl = ({ gameState, playerName }: {
  gameState: GameState
  playerName: string
}) => {
  const player = gameState.players.find(({ name }) => name === playerName)

  if (!player) {
    throw new UnableToFindPlayerError()
  }

  player.id = crypto.randomUUID()
  player.ai = true
  delete player.uid
  delete player.photoURL
  player.personality = player.personality ?? createRandomAiPersonality()
  player.personalityHidden = true
}

const setPlayerToHumanControl = ({
  gameState,
  playerName,
  spectatorId
}: {
  gameState: GameState
  playerName: string
  spectatorId: string
}) => {
  const player = gameState.players.find(({ name }) => name === playerName)

  if (!player) {
    throw new UnableToFindPlayerError()
  }

  const spectator = getViewerIdForSpectator({
    roomId: gameState.roomId,
    spectatorId,
    currentPlayerIds: new Set(gameState.players.map(({ id }) => id))
  })

  if (!spectator) {
    throw new ConnectedSpectatorRequiredError()
  }

  player.id = spectator.viewerId
  player.ai = false
  delete player.personality
  delete player.personalityHidden
  if (spectator.uid) {
    player.uid = spectator.uid
  } else {
    delete player.uid
  }
  if (spectator.photoURL) {
    player.photoURL = spectator.photoURL
  } else {
    delete player.photoURL
  }

  return spectator
}

export const getGameStateHandler = async ({ roomId, playerId, spectatorName, uid, photoURL }: {
  roomId: string
  playerId: string
  spectatorName?: string
  uid?: string
  photoURL?: string
}) => {
  const gameState = await getGameState(roomId)
  const player = gameState.players.find(({ id }) => id === playerId)

  upsertRoomPresence({
    roomId: gameState.roomId,
    playerId,
    ...((player?.name ?? spectatorName) && { name: player?.name ?? spectatorName }),
    ...((player?.uid ?? uid) && { uid: player?.uid ?? uid }),
    ...((player?.photoURL ?? photoURL) && { photoURL: player?.photoURL ?? photoURL }),
  })

  return { roomId, playerId }
}

export const createGameHandler = async ({ playerId, playerName, settings, uid, photoURL }: {
  playerId: string
  playerName: string
  settings: GameSettings
  uid?: string
  photoURL?: string
}) => {
  const roomId = generateRoomId()

  if (await getValue(roomId.toUpperCase())) {
    throw new RoomIdAlreadyExistsError(roomId)
  }

  await createNewGame(roomId, playerId, playerName, getNormalizedSettings(settings), uid, photoURL)
  upsertRoomPresence({
    roomId,
    playerId,
    name: playerName,
    ...(uid && { uid }),
    ...(photoURL && { photoURL }),
  })

  return { roomId, playerId }
}

export const joinGameHandler = async ({ roomId, playerId, playerName, uid, photoURL }: {
  roomId: string
  playerId: string
  playerName: string
  uid?: string
  photoURL?: string
}) => {
  const gameState = await getGameState(roomId)

  const player = gameState.players.find((player) => player.id === playerId)

  if (player) {
    if (player.name.toUpperCase() !== playerName.toUpperCase()) {
      await mutateGameState(gameState, (state) => {
        if (state.isStarted) {
          throw new DifferentPlayerNameError(player.name)
        }

        const oldPlayer = state.players.find((player) => player.id === playerId)
        if (!oldPlayer) {
          throw new UnableToFindPlayerError()
        }
        state.players = [
          ...state.players.filter(({ id }) => id !== playerId),
          { ...oldPlayer, name: playerName }
        ]
      })
    }
    // Update uid/photoURL if the player logs in after joining
    if (uid && !player.uid) {
      await mutateGameState(gameState, (state) => {
        const existingPlayer = state.players.find((p) => p.id === playerId)
        if (existingPlayer) {
          existingPlayer.uid = uid
          if (photoURL) existingPlayer.photoURL = photoURL
        }
      })
    }
  } else {
    await mutateGameState(gameState, (state) => {
      if (state.players.length >= MAX_PLAYER_COUNT) {
        throw new RoomIsFullError(roomId)
      }

      if (state.isStarted) {
        throw new GameInProgressError()
      }

      if (state.players.some((existingPlayer) =>
        existingPlayer.name.toUpperCase() === playerName.toUpperCase()
      )) {
        throw new RoomAlreadyHasPlayerError(playerName)
      }

      addPlayerToGame({ state, playerId, playerName, ...(uid ? { uid } : {}), ...(photoURL ? { photoURL } : {}) })
    })
  }

  upsertRoomPresence({
    roomId: gameState.roomId,
    playerId,
    name: playerName,
    ...((player?.uid ?? uid) && { uid: player?.uid ?? uid }),
    ...((player?.photoURL ?? photoURL) && { photoURL: player?.photoURL ?? photoURL }),
  })

  return { roomId, playerId }
}

export const addAiPlayerHandler = async ({ roomId, playerId, playerName, personality }: {
  roomId: string
  playerId: string
  playerName: string
  personality?: AiPersonality
}) => {
  const gameState = await getGameState(roomId)

  getPlayerInRoom({ gameState, playerId })

  await mutateGameState(gameState, (state) => {
    if (state.players.length >= MAX_PLAYER_COUNT) {
      throw new RoomIsFullError(roomId)
    }

    if (state.isStarted) {
      throw new GameInProgressError()
    }

    if (state.players.some((existingPlayer) =>
      existingPlayer.name.toUpperCase() === playerName.toUpperCase()
    )) {
      throw new RoomAlreadyHasPlayerError(playerName)
    }

    addPlayerToGame({
      state,
      playerId: crypto.randomUUID(),
      playerName,
      ai: true,
      ...(personality && { personality })
    })
  })

  return { roomId, playerId }
}

export const removeFromGameHandler = async ({ roomId, playerId, playerName }: {
  roomId: string
  playerId: string
  playerName: string
}) => {
  const gameState = await getGameState(roomId)

  getPlayerInRoom({ gameState, playerId })

  if (gameState.isStarted) {
    throw new GameInProgressError()
  }

  const playerToRemove = gameState.players.find((player) => player.name === playerName)

  if (!playerToRemove) {
    throw new PlayerNotInGameError()
  }

  await mutateGameState(gameState, (state) => {
    removePlayerFromGame(state, playerName)
  })

  if (playerToRemove.id === gameState.creatorPlayerId) {
    removeRoomPresence({
      roomId: gameState.roomId,
      playerId: playerToRemove.id
    })
  }

  return { roomId, playerId }
}

export const resetGameRequestHandler = async ({ roomId, playerId }: {
  roomId: string
  playerId: string
}) => {
  const gameState = await getGameState(roomId)

  const player = getPlayerInRoom({ gameState, playerId })

  const gameIsOver = gameState.players.filter(({ influences }) => influences.length).length === 1

  if (gameIsOver || !humanOpponentsRemain(gameState, player)) {
    await resetGame(roomId)
  } else {
    await mutateGameState(gameState, (state) => {
      if (state.isStarted && !state.resetGameRequest) {
        state.resetGameRequest = { player: player.name }
      }
    })
  }

  return { roomId, playerId }
}

export const resetGameRequestCancelHandler = async ({ roomId, playerId }: {
  roomId: string
  playerId: string
}) => {
  const gameState = await getGameState(roomId)

  getPlayerInRoom({ gameState, playerId })

  await mutateGameState(gameState, (state) => {
    delete state.resetGameRequest
  })

  return { roomId, playerId }
}

export const resetGameHandler = async ({ roomId, playerId }: {
  roomId: string
  playerId: string
}) => {
  const gameState = await getGameState(roomId)

  const player = getPlayerInRoom({ gameState, playerId })

  if (!gameState.isStarted) {
    throw new GameNotInProgressError()
  }

  const gameIsOver = gameState.players.filter(({ influences }) => influences.length).length === 1
  if (!gameIsOver) {
    const pendingResetFromOtherPlayer = player.influences.length
      && gameState.resetGameRequest
      && gameState.resetGameRequest?.player !== player.name
    if (humanOpponentsRemain(gameState, player) && !pendingResetFromOtherPlayer) {
      throw new GameInProgressError()
    }
  }

  await resetGame(roomId)

  return { roomId, playerId }
}

export const forfeitGameHandler = async ({ roomId, playerId, replaceWithAi }: {
  roomId: string
  playerId: string
  replaceWithAi: boolean
}) => {
  const gameState = await getGameState(roomId)

  const player = getPlayerInRoom({ gameState, playerId })

  if (!gameState.isStarted) {
    throw new GameNotInProgressError()
  }

  if (gameState.players.filter(({ influences }) => influences.length).length === 1) {
    throw new GameOverError()
  }

  if (!player.influences.length) {
    throw new YouAreDeadError()
  }

  await mutateGameState(gameState, (state) => {
    const playerToForfeit = state.players.find(({ id }) => id === playerId)
    if (!playerToForfeit) {
      throw new UnableToFindPlayerError()
    }

    if (gameState.pendingInfluenceLoss[playerToForfeit.name]?.length
      || state.turnPlayer === playerToForfeit.name && state.pendingAction
      || state.pendingAction?.targetPlayer === playerToForfeit.name
      || state.pendingActionChallenge?.sourcePlayer === playerToForfeit.name
      || state.pendingBlock?.sourcePlayer === playerToForfeit.name
      || state.pendingBlockChallenge?.sourcePlayer === playerToForfeit.name) {
      throw new UnableToForfeitError()
    }

    if (replaceWithAi) {
      playerToForfeit.id = crypto.randomUUID()
      playerToForfeit.ai = true
      playerToForfeit.personalityHidden = true
      logEvent(state, {
        event: EventMessages.PlayerReplacedWithAi,
        primaryPlayer: player.name
      })
    } else {
      playerToForfeit.deadInfluences.push(...playerToForfeit.influences)
      playerToForfeit.influences = []
      if (state.pendingAction?.pendingPlayers.has(playerToForfeit.name)) {
        processPassActionResponse(state, playerToForfeit.name)
      }
      if (state.pendingBlock?.pendingPlayers.has(playerToForfeit.name)) {
        processPassBlockResponse(state, playerToForfeit.name)
      }
      if (state.turnPlayer === playerToForfeit.name) {
        moveTurnToNextPlayer(state)
      }
      logEvent(state, {
        event: EventMessages.PlayerForfeited,
        primaryPlayer: player.name
      })
    }
  })

  return { roomId, playerId }
}

export const startGameHandler = async ({ roomId, playerId }: {
  roomId: string
  playerId: string
}) => {
  const gameState = await getGameState(roomId)
  const player = gameState.players.find(({ id }) => id === playerId)

  if (gameState.isStarted) {
    throw new GameInProgressError()
  }

  if (gameState.players.length < 2 && gameState.creatorPlayerId !== playerId) {
    throw new PlayerNotInGameError()
  }

  if (!player) {
    throw new PlayerNotInGameError()
  }

  const lobbyCreatorPresence = getConnectedLobbyCreatorPresence({ gameState })
  if (lobbyCreatorPresence && gameState.creatorPlayerId !== playerId) {
    throw new OnlyLobbyCreatorCanStartGameError()
  }

  if (gameState.players.length < 2) {
    throw new GameNeedsAtLeast2PlayersToStartError()
  }

  await mutateGameState(gameState, startGame)

  return { roomId, playerId }
}

export const setGameSettingsHandler = async ({ roomId, playerId, settings }: {
  roomId: string
  playerId: string
  settings: GameSettings
}) => {
  const gameState = await getGameState(roomId)
  const player = gameState.players.find(({ id }) => id === playerId)
  const lobbyCreatorPresence = getConnectedLobbyCreatorPresence({ gameState })

  if (gameState.isStarted) {
    throw new GameInProgressError()
  }

  if (lobbyCreatorPresence && gameState.creatorPlayerId !== playerId) {
    throw new OnlyLobbyCreatorCanSetGameSettingsError()
  }

  if (!lobbyCreatorPresence && !player) {
    throw new PlayerNotInGameError()
  }

  await mutateGameState(gameState, (state) => {
    const currentLobbyCreatorPresence = getConnectedLobbyCreatorPresence({ gameState: state })

    if (state.isStarted) {
      throw new GameInProgressError()
    }

    if (currentLobbyCreatorPresence && state.creatorPlayerId !== playerId) {
      throw new OnlyLobbyCreatorCanSetGameSettingsError()
    }

    if (!currentLobbyCreatorPresence && !state.players.find(({ id }) => id === playerId)) {
      throw new PlayerNotInGameError()
    }

    state.settings = getNormalizedSettings({
      ...state.settings,
      ...settings,
    })
    state.deck = createDeckForPlayerCount(state.players.length, state.settings)
  })

  return { roomId, playerId }
}

export const setPlayerControllerHandler = async ({
  roomId,
  playerId,
  targetPlayerName,
  targetController,
  spectatorId
}: {
  roomId: string
  playerId: string
  targetPlayerName: string
  targetController: PlayerControllers
  spectatorId?: string
}) => {
  const gameState = await getGameState(roomId)

  if (!gameState.isStarted) {
    throw new GameNotInProgressError()
  }

  if (gameState.creatorPlayerId !== playerId) {
    throw new OnlyLobbyCreatorCanSetPlayerControllerError()
  }

  const targetPlayer = gameState.players.find(({ name }) => name === targetPlayerName)

  if (!targetPlayer) {
    throw new UnableToFindPlayerError()
  }

  if (!targetPlayer.influences.length) {
    throw new ActionNotCurrentlyAllowedError()
  }

  if (targetController === PlayerControllers.Bot) {
    if (targetPlayer.ai) {
      throw new PlayerAlreadyBotControlledError()
    }

    await mutateGameState(gameState, (state) => {
      const stateTargetPlayer = state.players.find(({ name }) => name === targetPlayerName)

      if (!stateTargetPlayer) {
        throw new UnableToFindPlayerError()
      }

      if (!stateTargetPlayer.influences.length) {
        throw new ActionNotCurrentlyAllowedError()
      }

      if (stateTargetPlayer.ai) {
        throw new PlayerAlreadyBotControlledError()
      }

      setPlayerToBotControl({
        gameState: state,
        playerName: targetPlayerName
      })
      logEvent(state, {
        event: EventMessages.PlayerControllerSetToBot,
        primaryPlayer: targetPlayerName
      })
    })
  } else {
    if (!targetPlayer.ai) {
      throw new PlayerAlreadyHumanControlledError()
    }

    if (!spectatorId) {
      throw new ConnectedSpectatorRequiredError()
    }

    await mutateGameState(gameState, (state) => {
      const stateTargetPlayer = state.players.find(({ name }) => name === targetPlayerName)

      if (!stateTargetPlayer) {
        throw new UnableToFindPlayerError()
      }

      if (!stateTargetPlayer.influences.length) {
        throw new ActionNotCurrentlyAllowedError()
      }

      if (!stateTargetPlayer.ai) {
        throw new PlayerAlreadyHumanControlledError()
      }

      const spectator = setPlayerToHumanControl({
        gameState: state,
        playerName: targetPlayerName,
        spectatorId
      })
      logEvent(state, {
        event: EventMessages.PlayerControllerAssignedToHuman,
        primaryPlayer: targetPlayerName,
        ...(spectator.name && { secondaryPlayer: spectator.name })
      })
    })
  }

  return { roomId, playerId }
}

export const checkAutoMoveHandler = async ({ roomId, playerId }: {
  roomId: string
  playerId: string
}) => {
  const gameState = await getGameState(roomId)

  const unchangedResponse = { roomId, playerId, stateUnchanged: true }
  const changedResponse = { roomId, playerId }

  const remainingPlayers = gameState.players.filter(({ influences }) => influences.length)
  const playersForAutoMove = []
  let isForcedMove = false
  if (isSpeedRoundTimerExpired(gameState)) {
    playersForAutoMove.push(...shuffle(remainingPlayers))
    isForcedMove = true
  } else {
    // AI players move after a short pause
    const timeForMachinesToPonderLifeChoices = gameState.settings.aiMoveDelayMs ?? 500
    if (timeForMachinesToPonderLifeChoices && Date.now() < gameState.lastEventTimestamp.getTime() + timeForMachinesToPonderLifeChoices) {
      return unchangedResponse
    }
    playersForAutoMove.push(...remainingPlayers.filter(({ ai }) => ai))
  }

  for (const playerForAutoMove of playersForAutoMove) {
    const suggestedMove = await getPlayerSuggestedMove({ roomId, playerId: playerForAutoMove.id })
    if (!suggestedMove) continue
    const [move, params] = suggestedMove

    if (move === PlayerActions.loseInfluences) {
      await loseInfluencesHandler({ ...(params as Parameters<typeof loseInfluencesHandler>[0]), isForcedMove })
    } else if (move === PlayerActions.chooseStartingAllegiance) {
      await chooseStartingAllegianceHandler(params as Parameters<typeof chooseStartingAllegianceHandler>[0])
    } else if (move === PlayerActions.chooseExamineInfluence) {
      await chooseExamineInfluenceHandler({ ...(params as Parameters<typeof chooseExamineInfluenceHandler>[0]), isForcedMove })
    } else if (move === PlayerActions.resolveExamine) {
      await resolveExamineHandler({ ...(params as Parameters<typeof resolveExamineHandler>[0]), isForcedMove })
    } else if (move === PlayerActions.embezzleChallengeDecision) {
      await embezzleChallengeDecisionHandler({ ...(params as Parameters<typeof embezzleChallengeDecisionHandler>[0]), isForcedMove })
    } else if (move === PlayerActions.action) {
      await actionHandler({ ...(params as Parameters<typeof actionHandler>[0]), isForcedMove })
    } else if (move === PlayerActions.actionResponse) {
      await actionResponseHandler({ ...(params as Parameters<typeof actionResponseHandler>[0]), isForcedMove })
    } else if (move === PlayerActions.actionChallengeResponse) {
      await actionChallengeResponseHandler({ ...(params as Parameters<typeof actionChallengeResponseHandler>[0]), isForcedMove })
    } else if (move === PlayerActions.blockResponse) {
      await blockResponseHandler({ ...(params as Parameters<typeof blockResponseHandler>[0]), isForcedMove })
    } else if (move === PlayerActions.blockChallengeResponse) {
      await blockChallengeResponseHandler({ ...(params as Parameters<typeof blockChallengeResponseHandler>[0]), isForcedMove })
    } else {
      throw new ActionNotCurrentlyAllowedError()
    }

    return changedResponse
  }

  return unchangedResponse
}

const enforceSpeedRoundTimer = (gameState: GameState, isForcedMove?: boolean) => {
  if (!isForcedMove && isSpeedRoundTimerExpired(gameState)) {
    throw new SpeedRoundTimerExpiredError()
  }
}

export const actionHandler = async ({ roomId, playerId, action, targetPlayer, isForcedMove }: {
  roomId: string
  playerId: string
  action: Actions
  targetPlayer?: string
  isForcedMove?: boolean
}) => {
  const gameState = await getGameState(roomId)

  enforceSpeedRoundTimer(gameState, isForcedMove)

  const player = getPlayerInRoom({ gameState, playerId })
  const normalizedSettings = getNormalizedSettings(gameState.settings)
  const coinsRequired = getCoinsRequiredForAction({
    action,
    playerName: player.name,
    targetPlayer,
  })

  if (!player.influences.length) {
    throw new YouAreDeadError()
  }

  if (coinsRequired > player.coins) {
    throw new InsufficientCoinsError()
  }

  if (player.coins >= 10 && ![Actions.Coup, Actions.Revive].includes(action)) {
    throw new InvalidActionAt10CoinsError()
  }

  if (action === Actions.Revive) {
    if (!normalizedSettings.allowRevive) {
      throw new ReviveNotAllowedInGameError()
    }
    if (!player.deadInfluences.length) {
      throw new NoDeadInfluencesError()
    }
  }

  if (![Actions.Convert].includes(action) && targetPlayer && !gameState.players.some((player) => player.name === targetPlayer)) {
    throw new UnableToFindPlayerError()
  }

  if (ActionAttributes[action].targetMode === 'required' && !targetPlayer) {
    throw new TargetPlayerRequiredForActionError()
  }

  if (ActionAttributes[action].targetMode === 'none' && targetPlayer) {
    throw new TargetPlayerNotAllowedForActionError()
  }

  if (targetPlayer === player.name && action !== Actions.Convert) {
    throw new TargetPlayerIsSelfError()
  }

  if (targetPlayer && action !== Actions.Convert && !canTargetPlayerForAction({
    gameState: getPublicGameState({ gameState, playerId }),
    action,
    sourcePlayerName: player.name,
    targetPlayerName: targetPlayer,
  })) {
    throw new TargetPlayerNotAllowedForActionError()
  }

  if (!ActionAttributes[action].blockable && !ActionAttributes[action].challengeable) {
    if (action === Actions.Coup) {
      await mutateGameState(gameState, (state) => {
        if (isForcedMove) logForcedMove(state, player)

        if (!targetPlayer) {
          throw new TargetPlayerRequiredForActionError()
        }

        const coupingPlayer = state.players.find(({ id }) => id === playerId)

        if (!coupingPlayer) {
          throw new UnableToFindPlayerError()
        }

        if (coupingPlayer.coins !== player.coins) {
          throw new StateChangedSinceValidationError()
        }

        if (!canPlayerChooseAction(getPublicGameState({ gameState: state, playerId: coupingPlayer.id }))) {
          throw new ActionNotCurrentlyAllowedError()
        }

        if (!canTargetPlayerForAction({
          gameState: getPublicGameState({ gameState: state, playerId: coupingPlayer.id }),
          action,
          sourcePlayerName: coupingPlayer.name,
          targetPlayerName: targetPlayer,
        })) {
          throw new TargetPlayerNotAllowedForActionError()
        }

        coupingPlayer.coins -= ActionAttributes.Coup.coinsRequired!
        logEvent(state, {
          event: EventMessages.ActionProcessed,
          action,
          primaryPlayer: player.name,
          secondaryPlayer: targetPlayer
        })
        holdGrudge({ state, offended: targetPlayer, offender: coupingPlayer.name, weight: grudgeSizes[Actions.Coup] })
        recordCoup(state, coupingPlayer.name)
        recordInfluenceKill(state, coupingPlayer.name, targetPlayer)
        promptPlayerToLoseInfluence(state, targetPlayer)
      })
    } else if (action === Actions.Revive) {
      await mutateGameState(gameState, (state) => {
        if (isForcedMove) logForcedMove(state, player)

        const revivePlayer = state.players.find(({ id }) => id === playerId)

        if (!revivePlayer) {
          throw new UnableToFindPlayerError()
        }

        if (revivePlayer.coins !== player.coins) {
          throw new StateChangedSinceValidationError()
        }

        if (!canPlayerChooseAction(getPublicGameState({ gameState: state, playerId: revivePlayer.id }))) {
          throw new ActionNotCurrentlyAllowedError()
        }

        revivePlayer.coins -= 10
        const influenceToRevive = revivePlayer.deadInfluences.pop()
        if (!influenceToRevive) {
          throw new NoDeadInfluencesError()
        }
        revivePlayer.influences.push(influenceToRevive)
        revealAndReplaceInfluence(state, revivePlayer.name, influenceToRevive, false)
        moveTurnToNextPlayer(state)
        logEvent(state, {
          event: EventMessages.ActionProcessed,
          action,
          primaryPlayer: player.name
        })
      })
    } else if (action === Actions.Income) {
      await mutateGameState(gameState, (state) => {
        if (isForcedMove) logForcedMove(state, player)

        const incomePlayer = state.players.find(({ id }) => id === playerId)

        if (!incomePlayer) {
          throw new UnableToFindPlayerError()
        }

        if (incomePlayer.coins !== player.coins) {
          throw new StateChangedSinceValidationError()
        }

        if (!canPlayerChooseAction(getPublicGameState({ gameState: state, playerId: incomePlayer.id }))) {
          throw new ActionNotCurrentlyAllowedError()
        }

        incomePlayer.coins += 1
        moveTurnToNextPlayer(state)
        logEvent(state, {
          event: EventMessages.ActionProcessed,
          action,
          primaryPlayer: player.name
        })
      })
    } else if (action === Actions.Convert) {
      await mutateGameState(gameState, (state) => {
        if (isForcedMove) logForcedMove(state, player)

        const convertingPlayer = state.players.find(({ id }) => id === playerId)
        if (!convertingPlayer) {
          throw new UnableToFindPlayerError()
        }
        if (!canPlayerChooseAction(getPublicGameState({ gameState: state, playerId: convertingPlayer.id }))) {
          throw new ActionNotCurrentlyAllowedError()
        }

        const convertedPlayer = !targetPlayer || targetPlayer === convertingPlayer.name
          ? convertingPlayer
          : state.players.find(({ name }) => name === targetPlayer)
        if (!convertedPlayer) {
          throw new UnableToFindPlayerError()
        }

        const actionCost = getCoinsRequiredForAction({
          action,
          playerName: convertingPlayer.name,
          targetPlayer,
        })
        if (convertingPlayer.coins < actionCost) {
          throw new InsufficientCoinsError()
        }

        const fromAllegiance = convertedPlayer.allegiance ?? Allegiances.Loyalist
        const toAllegiance = convertedPlayer.allegiance
          ? (convertedPlayer.allegiance === Allegiances.Loyalist ? Allegiances.Reformist : Allegiances.Loyalist)
          : Allegiances.Loyalist

        convertingPlayer.coins -= actionCost
        state.treasuryReserveCoins += actionCost
        convertedPlayer.allegiance = toAllegiance
        moveTurnToNextPlayer(state)
        logEvent(state, {
          event: EventMessages.ActionProcessed,
          action,
          primaryPlayer: player.name,
          ...(convertedPlayer.name !== player.name && { secondaryPlayer: convertedPlayer.name }),
          fromAllegiance,
          toAllegiance,
        })
      })
    }
  } else {
    await mutateGameState(gameState, (state) => {
      if (isForcedMove) logForcedMove(state, player)

      if (!canPlayerChooseAction(getPublicGameState({ gameState: state, playerId: player.id }))) {
        throw new ActionNotCurrentlyAllowedError()
      }

      state.pendingAction = {
        action,
        pendingPlayers: state.players.reduce((agg, cur) => {
          if (cur.influences.length && cur.name !== player.name) {
            agg.add(cur.name)
          }
          return agg
        }, new Set<string>()),
        ...(targetPlayer && { targetPlayer }),
        claimConfirmed: false
      }

      const requiredInfluence = getRequiredInfluenceForAction(normalizedSettings, action)
      if (requiredInfluence) {
        recordInfluenceClaim(state, player.name, requiredInfluence)
        const actualPlayer = state.players.find(({ id }) => id === player.id)
        if (actualPlayer && !actualPlayer.influences.includes(requiredInfluence)) {
          recordBluff(state, player.name)
        }
      }

      logEvent(state, {
        event: EventMessages.ActionPending,
        action,
        primaryPlayer: player.name,
        ...(targetPlayer && { secondaryPlayer: targetPlayer })
      })
    })
  }

  return { roomId, playerId }
}

export const processPassActionResponse = (state: GameState, playerName: string) => {
  if (!state.pendingAction) {
    throw new ActionNotCurrentlyAllowedError()
  }

  const actionPlayer = state.players.find(({ name }) => name === state.turnPlayer)
  const respondingPlayer = state.players.find(({ name }) => name === playerName)

  if (!actionPlayer || !respondingPlayer) {
    throw new UnableToFindPlayerError()
  }

  if (state.pendingAction.action === Actions.ForeignAid) {
    addUnclaimedInfluence(respondingPlayer, Influences.Duke)
  }

  if (state.pendingAction.targetPlayer === playerName) {
    const targetPlayer = state.players.find(({ name }) => name === state.pendingAction?.targetPlayer)

    if (!targetPlayer) {
      throw new UnableToFindPlayerError()
    }

    if (state.pendingAction.action === Actions.Steal) {
      addUnclaimedInfluence(targetPlayer, Influences.Captain)
      addUnclaimedInfluence(targetPlayer, state.settings.enableInquisitor ? Influences.Inquisitor : Influences.Ambassador)
    } else if (state.pendingAction.action === Actions.Assassinate) {
      addUnclaimedInfluence(targetPlayer, Influences.Contessa)
    } else if (state.pendingAction.action === Actions.Examine && state.settings.allowContessaBlockExamine) {
      addUnclaimedInfluence(targetPlayer, Influences.Contessa)
    }
  }

  if (state.pendingAction.pendingPlayers.size > 1) {
    state.pendingAction.pendingPlayers.delete(playerName)
    return { updateLastEventTimestamp: false }
  }

  const claimedInfluence = getRequiredInfluenceForAction(state.settings, state.pendingAction.action)
  if (claimedInfluence) {
    addClaimedInfluence(actionPlayer, claimedInfluence)
    if (!actionPlayer.influences.includes(claimedInfluence)) {
      recordSuccessfulBluff(state, actionPlayer.name)
    }
  }
  processPendingAction(state)
}

export const actionResponseHandler = async ({ roomId, playerId, response, claimedInfluence, isForcedMove }: {
  roomId: string
  playerId: string
  response: Responses
  claimedInfluence?: Influences
  isForcedMove?: boolean
}) => {
  const gameState = await getGameState(roomId)

  enforceSpeedRoundTimer(gameState, isForcedMove)

  const player = getPlayerInRoom({ gameState, playerId })

  if (!player.influences.length) {
    throw new YouAreDeadError()
  }

  if (!canPlayerChooseActionResponse(getPublicGameState({ gameState, playerId: player.id }))) {
    throw new ActionNotCurrentlyAllowedError()
  }

  if (!gameState.pendingAction) {
    throw new ActionNotCurrentlyAllowedError()
  }

  const legalBlockInfluences = getLegalBlockInfluences(gameState.settings, gameState.pendingAction.action)

  if (response === Responses.Pass) {
    await mutateGameState(gameState, (state) => {
      if (isForcedMove) logForcedMove(state, player)

      return processPassActionResponse(state, player.name)
    })
  } else if (response === Responses.Challenge) {
    if (gameState.pendingAction!.claimConfirmed) {
      throw new ClaimedInfluenceAlreadyConfirmedError()
    }

    if (!ActionAttributes[gameState.pendingAction!.action].challengeable) {
      throw new ActionNotChallengeableError()
    }

    await mutateGameState(gameState, (state) => {
      if (isForcedMove) logForcedMove(state, player)

      recordChallengeMade(state, player.name)
      if (state.pendingAction?.action === Actions.Embezzle) {
        state.pendingEmbezzleChallengeDecision = {
          sourcePlayer: state.turnPlayer!,
          challengePlayer: player.name,
        }
      } else {
        state.pendingActionChallenge = {
          sourcePlayer: player.name
        }
      }
      logEvent(state, {
        event: EventMessages.ChallengePending,
        primaryPlayer: player.name,
        secondaryPlayer: state.turnPlayer!
      })
    })
  } else if (response === Responses.Block) {
    if (!claimedInfluence) {
      throw new ClaimedInfluenceRequiredError()
    }

    if (!legalBlockInfluences.includes(claimedInfluence)) {
      throw new ClaimedInfluenceInvalidError()
    }

    if (gameState.pendingAction!.targetPlayer && player.name !== gameState.pendingAction!.targetPlayer) {
      throw new ActionNotCurrentlyAllowedError()
    }

    if (gameState.pendingAction!.action === Actions.ForeignAid && !canPlayerBlockAction({
      gameState: getPublicGameState({ gameState, playerId }),
      action: gameState.pendingAction.action,
      actionPlayerName: gameState.turnPlayer!,
      blockPlayerName: player.name,
    })) {
      throw new ActionNotCurrentlyAllowedError()
    }

    await mutateGameState(gameState, (state) => {
      if (isForcedMove) logForcedMove(state, player)

      if (!state.pendingAction) {
        throw new ActionNotCurrentlyAllowedError()
      }

      state.pendingAction.pendingPlayers = new Set<string>()
      state.pendingBlock = {
        sourcePlayer: player.name,
        claimedInfluence,
        pendingPlayers: state.players.reduce((agg, cur) => {
          if (cur.influences.length && cur.name !== player.name) {
            agg.add(cur.name)
          }
          return agg
        }, new Set<string>()),
      }

      recordInfluenceClaim(state, player.name, claimedInfluence)
      const blockingPlayer = state.players.find(({ id }) => id === player.id)
      if (blockingPlayer && !blockingPlayer.influences.includes(claimedInfluence)) {
        recordBluff(state, player.name)
      }

      logEvent(state, {
        event: EventMessages.BlockPending,
        primaryPlayer: player.name,
        secondaryPlayer: state.turnPlayer!,
        influence: claimedInfluence
      })
    })
  }

  return { roomId, playerId }
}

export const actionChallengeResponseHandler = async ({ roomId, playerId, influence, isForcedMove }: {
  roomId: string
  playerId: string
  influence: Influences
  isForcedMove?: boolean
}) => {
  const gameState = await getGameState(roomId)

  enforceSpeedRoundTimer(gameState, isForcedMove)

  const player = getPlayerInRoom({ gameState, playerId })
  const requiredInfluence = getRequiredInfluenceForAction(gameState.settings, gameState.pendingAction!.action)

  if (!player.influences.length) {
    throw new YouAreDeadError()
  }

  if (!canPlayerChooseActionChallengeResponse(getPublicGameState({ gameState, playerId: player.id }))) {
    throw new ActionNotCurrentlyAllowedError()
  }

  if (!player.influences.includes(influence)) {
    throw new MissingInfluenceError()
  }

  if (requiredInfluence && influence === requiredInfluence) {
    await mutateGameState(gameState, (state) => {
      if (isForcedMove) logForcedMove(state, player)

      if (!state.pendingAction || !state.pendingActionChallenge) {
        throw new ActionNotCurrentlyAllowedError()
      }

      const challengePlayer = state.players.find(({ name }) => name === state.pendingActionChallenge!.sourcePlayer)

      if (!state.turnPlayer || !challengePlayer) {
        throw new UnableToFindPlayerError()
      }

      revealAndReplaceInfluence(state, state.turnPlayer, influence)
      logEvent(state, {
        event: EventMessages.ChallengeFailed,
        primaryPlayer: challengePlayer.name,
        secondaryPlayer: state.turnPlayer
      })
      recordInfluenceKill(state, state.turnPlayer, challengePlayer.name)
      promptPlayerToLoseInfluence(state, challengePlayer.name)
      delete state.pendingActionChallenge
      state.pendingAction.claimConfirmed = true
      if (state.pendingAction.targetPlayer) {
        const targetPlayer = state.players.find(({ name }) => name === state.pendingAction!.targetPlayer)

        if (!targetPlayer) {
          throw new UnableToFindPlayerError()
        }

        const remainingInfluenceCount = targetPlayer.influences.length - (state.pendingInfluenceLoss[targetPlayer.name]?.length ?? 0)
        if (remainingInfluenceCount > 0) {
          state.pendingAction.pendingPlayers = new Set([state.pendingAction.targetPlayer])
        } else {
          processPendingAction(state)
        }
      } else if (ActionAttributes[state.pendingAction.action].blockable) {
        state.pendingAction.pendingPlayers = state.players.reduce((agg, cur) => {
          if (cur.influences.length && cur.name !== state.turnPlayer) {
            agg.add(cur.name)
          }
          return agg
        }, new Set<string>())
      } else {
        processPendingAction(state)
      }
    })
  } else {
    await mutateGameState(gameState, (state) => {
      if (isForcedMove) logForcedMove(state, player)

      const actionPlayer = state.players.find(({ name }) => name === state.turnPlayer)
      const challengePlayer = state.players.find(({ name }) => name === state.pendingActionChallenge?.sourcePlayer)

      if (!actionPlayer || !challengePlayer) {
        throw new UnableToFindPlayerError()
      }

      logEvent(state, {
        event: EventMessages.ChallengeSuccessful,
        primaryPlayer: challengePlayer.name,
        secondaryPlayer: state.turnPlayer!
      })
      recordSuccessfulChallenge(state, challengePlayer.name)
      recordInfluenceKill(state, challengePlayer.name, state.turnPlayer!)
      const claimedInfluence = getRequiredInfluenceForAction(state.settings, state.pendingAction!.action)
      if (claimedInfluence) {
        removeClaimedInfluence(actionPlayer, claimedInfluence)
        addUnclaimedInfluence(actionPlayer, claimedInfluence)
      }
      holdGrudge({ state, offended: state.turnPlayer!, offender: challengePlayer.name, weight: grudgeSizes[Responses.Challenge] })
      killPlayerInfluence(state, actionPlayer.name, influence)
      moveTurnToNextPlayer(state)
      delete state.pendingActionChallenge
      delete state.pendingAction
    })
  }

  return { roomId, playerId }
}

export const processPassBlockResponse = (state: GameState, playerName: string) => {
  if (!state.pendingAction || !state.pendingBlock) {
    throw new ActionNotCurrentlyAllowedError()
  }

  if (state.pendingBlock.pendingPlayers.size > 1) {
    state.pendingBlock.pendingPlayers.delete(playerName)
    return { updateLastEventTimestamp: false }
  }

  const actionPlayer = state.players.find(({ name }) => name === state.turnPlayer)
  const blockPlayer = state.players.find(({ name }) => name === state.pendingBlock?.sourcePlayer)

  if (!actionPlayer || !blockPlayer) {
    throw new UnableToFindPlayerError()
  }

  const claimedInfluence = getRequiredInfluenceForAction(state.settings, state.pendingAction.action)
  if (claimedInfluence) {
    addClaimedInfluence(actionPlayer, claimedInfluence)
  }
  addClaimedInfluence(blockPlayer, state.pendingBlock?.claimedInfluence)

  // Block succeeded unchallenged — if the blocker was bluffing, it succeeded
  if (state.pendingBlock?.claimedInfluence && !blockPlayer.influences.includes(state.pendingBlock.claimedInfluence)) {
    recordSuccessfulBluff(state, blockPlayer.name)
  }

  logEvent(state, {
    event: EventMessages.BlockSuccessful,
    primaryPlayer: blockPlayer.name,
    secondaryPlayer: state.turnPlayer!
  })
  if (state.pendingAction.action === Actions.Assassinate) {
    const assassin = state.players.find(({ name }) => name === state.turnPlayer)

    if (!assassin) {
      throw new UnableToFindPlayerError()
    }

    assassin.coins -= ActionAttributes.Assassinate.coinsRequired!
  }
  moveTurnToNextPlayer(state)
  delete state.pendingBlock
  delete state.pendingActionChallenge
  delete state.pendingAction
}

export const blockResponseHandler = async ({ roomId, playerId, response, isForcedMove }: {
  roomId: string
  playerId: string
  response: Responses
  isForcedMove?: boolean
}) => {
  const gameState = await getGameState(roomId)

  enforceSpeedRoundTimer(gameState, isForcedMove)

  const player = getPlayerInRoom({ gameState, playerId })

  if (!player.influences.length) {
    throw new YouAreDeadError()
  }

  if (!canPlayerChooseBlockResponse(getPublicGameState({ gameState, playerId: player.id }))) {
    throw new ActionNotCurrentlyAllowedError()
  }

  if (response === Responses.Block) {
    throw new BlockMayNotBeBlockedError()
  }

  if (response === Responses.Challenge) {
    await mutateGameState(gameState, (state) => {
      if (isForcedMove) logForcedMove(state, player)

      const blockPlayer = state.players.find(({ name }) => name === state.pendingBlock?.sourcePlayer)

      if (!blockPlayer) {
        throw new UnableToFindPlayerError()
      }

      recordChallengeMade(state, player.name)
      logEvent(state, {
        event: EventMessages.ChallengePending,
        primaryPlayer: player.name,
        secondaryPlayer: blockPlayer.name
      })
      state.pendingBlockChallenge = { sourcePlayer: player.name }
    })
  } else if (response === Responses.Pass) {
    await mutateGameState(gameState, (state) => {
      if (isForcedMove) logForcedMove(state, player)

      return processPassBlockResponse(state, player.name)
    })
  }

  return { roomId, playerId }
}

export const blockChallengeResponseHandler = async ({ roomId, playerId, influence, isForcedMove }: {
  roomId: string
  playerId: string
  influence: Influences
  isForcedMove?: boolean
}) => {
  const gameState = await getGameState(roomId)

  enforceSpeedRoundTimer(gameState, isForcedMove)

  const player = getPlayerInRoom({ gameState, playerId })

  if (!player.influences.length) {
    throw new YouAreDeadError()
  }

  if (!canPlayerChooseBlockChallengeResponse(getPublicGameState({ gameState, playerId: player.id }))) {
    throw new ActionNotCurrentlyAllowedError()
  }

  if (!player.influences.includes(influence)) {
    throw new MissingInfluenceError()
  }

  if (influence === gameState.pendingBlock!.claimedInfluence) {
    await mutateGameState(gameState, (state) => {
      if (isForcedMove) logForcedMove(state, player)

      if (!state.pendingAction || !state.pendingBlock) {
        throw new ActionNotCurrentlyAllowedError()
      }

      const actionPlayer = state.players.find(({ name }) => name === state.turnPlayer)
      const challengePlayer = state.players.find(({ name }) => name === state.pendingBlockChallenge?.sourcePlayer)

      if (!actionPlayer || !challengePlayer) {
        throw new UnableToFindPlayerError()
      }

      const claimedInfluence = getRequiredInfluenceForAction(state.settings, state.pendingAction.action)
      if (claimedInfluence) {
        addClaimedInfluence(actionPlayer, claimedInfluence)
      }

      revealAndReplaceInfluence(state, state.pendingBlock.sourcePlayer, influence)
      logEvent(state, {
        event: EventMessages.BlockSuccessful,
        primaryPlayer: state.pendingBlock.sourcePlayer,
        secondaryPlayer: state.turnPlayer!
      })
      // Block challenge failed — blocker was telling the truth
      recordInfluenceKill(state, state.pendingBlock.sourcePlayer, challengePlayer.name)
      if (state.pendingAction.action === Actions.Assassinate) {
        const assassin = state.players.find(({ name }) => name === state.turnPlayer)

        if (!assassin) {
          throw new UnableToFindPlayerError()
        }

        assassin.coins -= ActionAttributes.Assassinate.coinsRequired!
      }
      delete state.pendingBlockChallenge
      delete state.pendingBlock
      delete state.pendingActionChallenge
      delete state.pendingAction

      promptPlayerToLoseInfluence(state, challengePlayer.name)
    })
  } else {
    await mutateGameState(gameState, (state) => {
      if (isForcedMove) logForcedMove(state, player)

      const actionPlayer = state.players.find(({ name }) => name === state.turnPlayer)
      const blockPlayer = state.players.find(({ name }) => name === state.pendingBlock?.sourcePlayer)
      const challengePlayer = state.players.find(({ name }) => name === state.pendingBlockChallenge?.sourcePlayer)

      if (!actionPlayer || !blockPlayer || !challengePlayer) {
        throw new UnableToFindPlayerError()
      }

      logEvent(state, {
        event: EventMessages.ChallengeSuccessful,
        primaryPlayer: challengePlayer.name,
        secondaryPlayer: blockPlayer.name
      })
      logEvent(state, {
        event: EventMessages.BlockFailed,
        primaryPlayer: blockPlayer.name,
        secondaryPlayer: state.turnPlayer!
      })
      // Block challenge succeeded — blocker was bluffing
      recordSuccessfulChallenge(state, challengePlayer.name)
      recordInfluenceKill(state, challengePlayer.name, blockPlayer.name)
      const claimedInfluence = getRequiredInfluenceForAction(state.settings, state.pendingAction!.action)
      if (claimedInfluence) {
        addClaimedInfluence(actionPlayer, claimedInfluence)
      }
      removeClaimedInfluence(blockPlayer, state.pendingBlock!.claimedInfluence)
      addUnclaimedInfluence(blockPlayer, state.pendingBlock!.claimedInfluence)
      holdGrudge({ state, offended: blockPlayer.name, offender: challengePlayer.name, weight: grudgeSizes[Responses.Challenge] })
      killPlayerInfluence(state, blockPlayer.name, influence)
      processPendingAction(state)
      delete state.pendingBlockChallenge
      delete state.pendingBlock
      delete state.pendingActionChallenge
      delete state.pendingAction
    })
  }

  return { roomId, playerId }
}

export const loseInfluencesHandler = async ({ roomId, playerId, influences, isForcedMove }: {
  roomId: string
  playerId: string
  influences: Influences[]
  isForcedMove?: boolean
}) => {
  const gameState = await getGameState(roomId)

  enforceSpeedRoundTimer(gameState, isForcedMove)

  const player = getPlayerInRoom({ gameState, playerId })

  if (!player.influences.length) {
    throw new YouAreDeadError()
  }

  const influenceCounts = influences.reduce((agg, cur) => {
    agg[cur] = (agg[cur] ?? 0) + 1
    return agg
  }, {} as { [key in Influences]: number })

  if (Object.entries(influenceCounts).some(([i, count]) => player.influences.filter((pi) => pi === i).length < count)) {
    throw new MissingInfluenceError()
  }

  const pendingInfluenceLossCount = gameState.pendingInfluenceLoss[player.name]?.length ?? 0
  if (influences.length > pendingInfluenceLossCount) {
    throw new MissingInfluenceError()
  }

  await mutateGameState(gameState, (state) => {
    if (isForcedMove) logForcedMove(state, player)

    const losingPlayer = state.players.find(({ id }) => id === playerId)

    if (!losingPlayer) {
      throw new UnableToFindPlayerError()
    }

    const putBackInDeck = state.pendingInfluenceLoss[losingPlayer.name][0].putBackInDeck

    influences.forEach((influence) => {
      if (state.pendingInfluenceLoss[losingPlayer.name].length > 1) {
        state.pendingInfluenceLoss[losingPlayer.name].splice(0, 1)
      } else {
        delete state.pendingInfluenceLoss[losingPlayer.name]
      }

      if (putBackInDeck) {
        const removedInfluence = losingPlayer.influences.splice(
          losingPlayer.influences.indexOf(influence),
          1
        )[0]
        state.deck.unshift(removedInfluence)

        if (!Object.keys(state.pendingInfluenceLoss).length && !state.pendingAction) {
          moveTurnToNextPlayer(state)
        }
      } else {
        killPlayerInfluence(state, losingPlayer.name, influence)
      }
    })
  })

  return { roomId, playerId }
}

export const chooseStartingAllegianceHandler = async ({ roomId, playerId, allegiance }: {
  roomId: string
  playerId: string
  allegiance: Allegiances
}) => {
  const gameState = await getGameState(roomId)
  const player = getPlayerInRoom({ gameState, playerId })

  if (!canPlayerChooseStartingAllegiance(getPublicGameState({ gameState, playerId: player.id }))) {
    throw new ActionNotCurrentlyAllowedError()
  }

  await mutateGameState(gameState, (state) => {
    assignAllegiances(state, allegiance)
    delete state.pendingStartingAllegiance
  })

  return { roomId, playerId }
}

export const chooseExamineInfluenceHandler = async ({ roomId, playerId, influence, isForcedMove }: {
  roomId: string
  playerId: string
  influence: Influences
  isForcedMove?: boolean
}) => {
  const gameState = await getGameState(roomId)

  enforceSpeedRoundTimer(gameState, isForcedMove)

  const player = getPlayerInRoom({ gameState, playerId })

  if (!canPlayerChooseExamineInfluence(getPublicGameState({ gameState, playerId: player.id }))) {
    throw new ActionNotCurrentlyAllowedError()
  }

  if (!player.influences.includes(influence)) {
    throw new MissingInfluenceError()
  }

  await mutateGameState(gameState, (state) => {
    if (isForcedMove) logForcedMove(state, player)
    if (!state.pendingExamine) {
      throw new ActionNotCurrentlyAllowedError()
    }
    state.pendingExamine.chosenInfluence = influence
  })

  return { roomId, playerId }
}

export const resolveExamineHandler = async ({ roomId, playerId, response, isForcedMove }: {
  roomId: string
  playerId: string
  response: ExamineResponses
  isForcedMove?: boolean
}) => {
  const gameState = await getGameState(roomId)

  enforceSpeedRoundTimer(gameState, isForcedMove)

  const player = getPlayerInRoom({ gameState, playerId })

  if (!canPlayerResolveExamine(getPublicGameState({ gameState, playerId: player.id }))) {
    throw new ActionNotCurrentlyAllowedError()
  }

  await mutateGameState(gameState, (state) => {
    if (isForcedMove) logForcedMove(state, player)

    if (!state.pendingExamine?.chosenInfluence) {
      throw new ActionNotCurrentlyAllowedError()
    }

    if (response === ExamineResponses.ForceExchange) {
      forceExchangeExaminedInfluence(state, state.pendingExamine.targetPlayer, state.pendingExamine.chosenInfluence)
    }

    logEvent(state, {
      event: response === ExamineResponses.ForceExchange
        ? EventMessages.ExamineForcedExchange
        : EventMessages.ExamineReturned,
      primaryPlayer: state.pendingExamine.sourcePlayer,
      secondaryPlayer: state.pendingExamine.targetPlayer
    })

    delete state.pendingExamine
    moveTurnToNextPlayer(state)
  })

  return { roomId, playerId }
}

export const embezzleChallengeDecisionHandler = async ({ roomId, playerId, response, isForcedMove }: {
  roomId: string
  playerId: string
  response: EmbezzleChallengeResponses
  isForcedMove?: boolean
}) => {
  const gameState = await getGameState(roomId)

  enforceSpeedRoundTimer(gameState, isForcedMove)

  const player = getPlayerInRoom({ gameState, playerId })

  if (!canPlayerChooseEmbezzleChallengeDecision(getPublicGameState({ gameState, playerId: player.id }))) {
    throw new ActionNotCurrentlyAllowedError()
  }

  await mutateGameState(gameState, (state) => {
    if (isForcedMove) logForcedMove(state, player)

    if (!state.pendingEmbezzleChallengeDecision || !state.pendingAction || state.pendingAction.action !== Actions.Embezzle) {
      throw new ActionNotCurrentlyAllowedError()
    }

    const challengePlayer = state.players.find(({ name }) => name === state.pendingEmbezzleChallengeDecision?.challengePlayer)
    const actionPlayer = state.players.find(({ name }) => name === state.pendingEmbezzleChallengeDecision?.sourcePlayer)

    if (!challengePlayer || !actionPlayer) {
      throw new UnableToFindPlayerError()
    }

    if (response === EmbezzleChallengeResponses.ProveNoDuke) {
      if (actionPlayer.influences.includes(Influences.Duke)) {
        throw new ActionNotCurrentlyAllowedError()
      }

      logEvent(state, {
        event: EventMessages.ChallengeFailed,
        primaryPlayer: challengePlayer.name,
        secondaryPlayer: actionPlayer.name,
      })
      recordInfluenceKill(state, actionPlayer.name, challengePlayer.name)
      promptPlayerToLoseInfluence(state, challengePlayer.name)
      replaceAllLiveInfluences(state, actionPlayer.name)
      delete state.pendingEmbezzleChallengeDecision
      processPendingAction(state)
    } else {
      logEvent(state, {
        event: EventMessages.ChallengeSuccessful,
        primaryPlayer: challengePlayer.name,
        secondaryPlayer: actionPlayer.name,
      })
      recordSuccessfulChallenge(state, challengePlayer.name)
      recordInfluenceKill(state, challengePlayer.name, actionPlayer.name)
      holdGrudge({ state, offended: actionPlayer.name, offender: challengePlayer.name, weight: grudgeSizes[Responses.Challenge] })
      promptPlayerToLoseInfluence(state, actionPlayer.name)
      delete state.pendingEmbezzleChallengeDecision
      delete state.pendingAction
    }
  })

  return { roomId, playerId }
}

export const sendChatMessageHandler = async ({ roomId, playerId, messageId, messageText }: {
  roomId: string
  playerId: string
  messageId: string
  messageText: string
}) => {
  const gameState = await getGameState(roomId)

  const player = getPlayerInRoom({ gameState, playerId })

  await mutateGameState(gameState, (state) => {
    const existingMessage = state.chatMessages.find(({ id }) => id === messageId)

    if (existingMessage && existingMessage?.from !== player.name) {
      throw new MessageIsNotYoursError()
    }

    if (existingMessage) {
      existingMessage.text = messageText
      return
    }

    state.chatMessages.push({
      id: messageId,
      text: messageText,
      from: player.name,
      timestamp: new Date(),
      deleted: false
    })

    const maxMessageCount = 500
    if (state.chatMessages.length > maxMessageCount) {
      state.chatMessages.splice(0, state.chatMessages.length - maxMessageCount)
    }
  })

  return { roomId, playerId }
}

export const setChatMessageDeletedHandler = async ({ roomId, playerId, messageId, deleted }: {
  roomId: string
  playerId: string
  messageId: string
  deleted: boolean
}) => {
  const gameState = await getGameState(roomId)

  const player = getPlayerInRoom({ gameState, playerId })

  await mutateGameState(gameState, (state) => {
    const existingMessage = state.chatMessages.find(({ id }) => id === messageId)

    if (!existingMessage) {
      throw new MessageDoesNotExistError()
    }

    if (existingMessage.from !== player.name) {
      throw new MessageIsNotYoursError()
    }

    existingMessage.deleted = deleted
  })

  return { roomId, playerId }
}

export const setEmojiOnChatMessageHandler = async ({
  roomId,
  playerId,
  messageId,
  emoji,
  selected,
}: {
  roomId: string
  playerId: string
  messageId: string
  emoji: string
  selected: boolean
  language: AvailableLanguageCode
}) => {
  const gameState = await getGameState(roomId)

  const player = getPlayerInRoom({ gameState, playerId })

  await mutateGameState(gameState, (state) => {
    const existingMessage = state.chatMessages.find(
      ({ id }) => id === messageId
    )

    if (!existingMessage) {
      throw new MessageDoesNotExistError()
    }

    if (selected) {
      existingMessage.emojis ??= {}
      if (!existingMessage.emojis[emoji]) {
        existingMessage.emojis[emoji] = new Set()
      }
      existingMessage.emojis[emoji].add(player.name)
    } else if (existingMessage.emojis?.[emoji]) {
      existingMessage.emojis[emoji].delete(player.name)
      if (!existingMessage.emojis[emoji].size) {
        delete existingMessage.emojis[emoji]
      }
    }
  })

  return { roomId, playerId }
}
