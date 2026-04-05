import { ActionAttributes, Actions, Allegiances, GameSettings, Influences, PublicGameState, PublicPlayer } from "../types/game"

const getLivingPlayers = (players: Pick<PublicPlayer, 'influenceCount' | 'allegiance'>[]) =>
  players.filter(({ influenceCount }) => influenceCount > 0)

export const getExchangeInfluence = (settings: Pick<GameSettings, 'enableInquisitor'>) =>
  settings.enableInquisitor ? Influences.Inquisitor : Influences.Ambassador

export const getRequiredInfluenceForAction = (
  settings: Pick<GameSettings, 'enableInquisitor'>,
  action: Actions
): Influences | undefined => {
  if (action === Actions.Exchange) {
    return getExchangeInfluence(settings)
  }

  if (action === Actions.Examine) {
    return Influences.Inquisitor
  }

  return ActionAttributes[action].influenceRequired
}

export const getLegalBlockInfluences = (
  settings: Pick<GameSettings, 'enableInquisitor' | 'allowContessaBlockExamine'>,
  action: Actions
): Influences[] => {
  if (action === Actions.Steal) {
    return [
      Influences.Captain,
      settings.enableInquisitor ? Influences.Inquisitor : Influences.Ambassador,
    ]
  }

  if (action === Actions.Assassinate) {
    return [Influences.Contessa]
  }

  if (action === Actions.ForeignAid) {
    return [Influences.Duke]
  }

  if (action === Actions.Examine && settings.allowContessaBlockExamine) {
    return [Influences.Contessa]
  }

  return []
}

export const canEveryoneTargetSameAllegiance = (
  players: Pick<PublicPlayer, 'allegiance' | 'influenceCount'>[]
) => {
  const livingPlayers = getLivingPlayers(players)
  const livingAllegiances = new Set(livingPlayers.map(({ allegiance }) => allegiance).filter(Boolean))
  return livingPlayers.length > 0 && livingAllegiances.size <= 1
}

export const canTargetPlayerForAction = ({
  gameState,
  action,
  sourcePlayerName,
  targetPlayerName,
}: {
  gameState: Pick<PublicGameState, 'players' | 'settings'>
  action: Actions
  sourcePlayerName: string
  targetPlayerName: string
}) => {
  if (sourcePlayerName === targetPlayerName) {
    return action === Actions.Convert
  }

  const targetPlayer = gameState.players.find(({ name }) => name === targetPlayerName)
  const sourcePlayer = gameState.players.find(({ name }) => name === sourcePlayerName)
  if (!targetPlayer || !sourcePlayer || !targetPlayer.influenceCount) {
    return false
  }

  if (!gameState.settings.enableReformation) {
    return true
  }

  if (![
    Actions.Coup,
    Actions.Assassinate,
    Actions.Steal,
    Actions.Examine,
  ].includes(action)) {
    return true
  }

  if (canEveryoneTargetSameAllegiance(gameState.players)) {
    return true
  }

  return !sourcePlayer.allegiance || !targetPlayer.allegiance || sourcePlayer.allegiance !== targetPlayer.allegiance
}

export const canPlayerBlockAction = ({
  gameState,
  action,
  actionPlayerName,
  blockPlayerName,
}: {
  gameState: Pick<PublicGameState, 'players' | 'settings'>
  action: Actions
  actionPlayerName: string
  blockPlayerName: string
}) => {
  if (!gameState.settings.enableReformation) {
    return true
  }

  if (![Actions.ForeignAid].includes(action)) {
    return true
  }

  if (canEveryoneTargetSameAllegiance(gameState.players)) {
    return true
  }

  const actionPlayer = gameState.players.find(({ name }) => name === actionPlayerName)
  const blockPlayer = gameState.players.find(({ name }) => name === blockPlayerName)
  if (!actionPlayer || !blockPlayer) {
    return false
  }

  return !actionPlayer.allegiance || !blockPlayer.allegiance || actionPlayer.allegiance !== blockPlayer.allegiance
}

export const getLegalTargetPlayers = ({
  gameState,
  action,
  sourcePlayerName,
}: {
  gameState: Pick<PublicGameState, 'players' | 'settings'>
  action: Actions
  sourcePlayerName: string
}) => {
  if (action === Actions.Convert) {
    return gameState.players.filter(({ name, influenceCount }) =>
      name === sourcePlayerName || influenceCount > 0
    )
  }

  return gameState.players.filter(({ name }) =>
    canTargetPlayerForAction({ gameState, action, sourcePlayerName, targetPlayerName: name })
  )
}

export const canPlayerChooseAction = (state: PublicGameState) =>
  state.selfPlayer
  && state.turnPlayer === state.selfPlayer.name
  && !state.pendingAction
  && !state.pendingStartingAllegiance
  && !state.pendingExamine
  && !state.pendingEmbezzleChallengeDecision
  && !Object.keys(state.pendingInfluenceLoss).length

export const canPlayerChooseActionResponse = (state: PublicGameState) =>
  state.selfPlayer
  && state.turnPlayer !== state.selfPlayer.name
  && state.pendingAction
  && !state.pendingActionChallenge
  && !state.pendingBlock
  && !state.pendingExamine
  && !state.pendingEmbezzleChallengeDecision
  && state.pendingAction.pendingPlayers.has(state.selfPlayer.name)

export const canPlayerChooseActionChallengeResponse = (state: PublicGameState) =>
  state.selfPlayer
  && state.turnPlayer === state.selfPlayer.name
  && state.pendingActionChallenge
  && state.pendingAction?.action !== Actions.Embezzle

export const canPlayerChooseBlockResponse = (state: PublicGameState) =>
  state.selfPlayer
  && state.pendingBlock
  && !state.pendingBlockChallenge
  && state.pendingBlock.sourcePlayer !== state.selfPlayer.name
  && state.pendingBlock.pendingPlayers.has(state.selfPlayer.name)

export const canPlayerChooseBlockChallengeResponse = (state: PublicGameState) =>
  state.selfPlayer
  && state.pendingBlock
  && state.pendingBlockChallenge
  && state.pendingBlock.sourcePlayer === state.selfPlayer.name

export const canPlayerChooseStartingAllegiance = (state: PublicGameState) =>
  state.selfPlayer
  && state.pendingStartingAllegiance?.sourcePlayer === state.selfPlayer.name

export const canPlayerChooseExamineInfluence = (state: PublicGameState) =>
  state.selfPlayer
  && state.pendingExamine
  && !state.pendingExamine.chosenInfluence
  && state.pendingExamine.targetPlayer === state.selfPlayer.name

export const canPlayerResolveExamine = (state: PublicGameState) =>
  state.selfPlayer
  && state.pendingExamine
  && !!state.pendingExamine.chosenInfluence
  && state.pendingExamine.sourcePlayer === state.selfPlayer.name

export const canPlayerChooseEmbezzleChallengeDecision = (state: PublicGameState) =>
  state.selfPlayer
  && state.pendingEmbezzleChallengeDecision?.sourcePlayer === state.selfPlayer.name

export const getOpposingAllegiance = (allegiance: Allegiances) =>
  allegiance === Allegiances.Loyalist ? Allegiances.Reformist : Allegiances.Loyalist
