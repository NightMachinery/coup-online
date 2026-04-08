import { ActionAttributes, Actions, Allegiances, EmbezzleChallengeResponses, ExamineResponses, Influences, Player, PlayerActions, PublicGameState, PublicPlayer, Responses } from "../../../shared/types/game"
import { randomlyDecideToBluff, randomlyDecideToNotUseOwnedInfluence } from "./aiRandomness"
import { shuffle } from "../utilities/array"
import { getCountOfEachInfluence } from "../utilities/deck"
import { getGameState, getPublicGameState } from '../utilities/gameState'
import { UnableToFindPlayerError } from '../utilities/errors'
import { canPlayerBlockAction, canPlayerChooseAction, canPlayerChooseActionChallengeResponse, canPlayerChooseActionResponse, canPlayerChooseBlockChallengeResponse, canPlayerChooseBlockResponse, canPlayerChooseEmbezzleChallengeDecision, canPlayerChooseExamineInfluence, canPlayerChooseStartingAllegiance, canPlayerResolveExamine, getLegalBlockInfluences, getLegalTargetPlayers, getRequiredInfluenceForAction } from '../../../shared/game/logic'

const getRevealedInfluences = (gameState: PublicGameState, influence?: Influences) =>
  gameState.players.reduce((agg: Influences[], { deadInfluences }) => {
    deadInfluences.forEach((i) => {
      if (!influence || i === influence) agg.push(i)
    })
    return agg
  }, [])

const getProbabilityOfHiddenCardBeingInfluence = (
  gameState: PublicGameState,
  influence: Influences
) => {
  const knownInfluences = [
    ...gameState.selfPlayer?.influences ?? [],
    ...getRevealedInfluences(gameState)
  ]

  const knownMatchedInfluenceCount = knownInfluences.filter((i) => i === influence).length

  const countOfEachInfluence = getCountOfEachInfluence(gameState.players.length)
  if ((influence === Influences.Ambassador && gameState.settings.enableInquisitor) || (influence === Influences.Inquisitor && !gameState.settings.enableInquisitor)) {
    return 0
  }

  if (knownMatchedInfluenceCount === countOfEachInfluence) {
    return 0
  }

  const totalInfluenceCount =
    gameState.players.reduce((agg, { influenceCount }) => agg + influenceCount, 0) +
    gameState.players.reduce((agg, { deadInfluences }) => agg + deadInfluences.length, 0) +
    gameState.deckCount

  return (countOfEachInfluence - knownMatchedInfluenceCount) / (totalInfluenceCount - knownInfluences.length)
}

export const getProbabilityOfPlayerInfluence = (
  gameState: PublicGameState,
  influence: Influences,
  playerName?: string
) => {
  if (playerName) {
    const player = gameState.players.find(({ name }) => name === playerName)
    if (!player) {
      throw new Error('Player not found for probability function')
    }

    return player.influenceCount * getProbabilityOfHiddenCardBeingInfluence(gameState, influence)
  }

  const hiddenInfluenceCount =
    gameState.players.reduce((agg, { influenceCount }) => agg + influenceCount, 0)
    - (gameState.selfPlayer?.influences.length ?? 0)

  return hiddenInfluenceCount * getProbabilityOfHiddenCardBeingInfluence(gameState, influence)
}

export const getPlayerDangerFactor = (player: PublicPlayer) => {
  if (!player.influenceCount) {
    return 0
  }

  return player.influenceCount * 10 + player.coins
}

export const getOpponents = (gameState: PublicGameState): PublicPlayer[] =>
  gameState.players.filter(({ name, influenceCount }) =>
    influenceCount && name !== gameState.selfPlayer?.name)

const getActionTargets = (gameState: PublicGameState, action: Actions, sourcePlayerName = gameState.selfPlayer!.name) =>
  getLegalTargetPlayers({
    gameState,
    action,
    sourcePlayerName,
  }).filter(({ name, influenceCount }) => influenceCount && name !== sourcePlayerName)

const getPlayerByName = (gameState: Pick<PublicGameState, 'players'>, playerName: string) =>
  gameState.players.find(({ name }) => name === playerName)

const canSourceTargetPlayer = ({
  gameState,
  action,
  sourcePlayerName,
  targetPlayerName,
}: {
  gameState: Pick<PublicGameState, 'players' | 'settings'>
  action: Actions
  sourcePlayerName: string
  targetPlayerName: string
}) => getLegalTargetPlayers({ gameState, action, sourcePlayerName })
  .some(({ name, influenceCount }) => name === targetPlayerName && influenceCount > 0)

const getAggressiveActionsForSelf = (gameState: PublicGameState) => {
  if (!gameState.selfPlayer) {
    return []
  }

  const aggressiveActions: Actions[] = []
  if (gameState.selfPlayer.coins >= 3 && gameState.selfPlayer.influences.includes(Influences.Assassin)) {
    aggressiveActions.push(Actions.Assassinate)
  }
  if (gameState.selfPlayer.influences.includes(Influences.Captain)) {
    aggressiveActions.push(Actions.Steal)
  }
  if (gameState.settings.enableInquisitor && gameState.selfPlayer.influences.includes(Influences.Inquisitor)) {
    aggressiveActions.push(Actions.Examine)
  }

  return aggressiveActions
}

const getStartingAllegianceAssignments = (
  players: PublicPlayer[],
  startingAllegiance: Allegiances
) => {
  let currentAllegiance = startingAllegiance
  return players.map((player) => {
    const nextPlayer = { ...player, allegiance: currentAllegiance }
    currentAllegiance = currentAllegiance === Allegiances.Loyalist ? Allegiances.Reformist : Allegiances.Loyalist
    return nextPlayer
  })
}

const getConvertedAllegiance = (allegiance?: Allegiances) => {
  if (!allegiance) {
    return Allegiances.Loyalist
  }

  return allegiance === Allegiances.Loyalist ? Allegiances.Reformist : Allegiances.Loyalist
}

const getConvertedPlayers = (players: PublicPlayer[], targetPlayerName: string) =>
  players.map((player) => player.name === targetPlayerName
    ? { ...player, allegiance: getConvertedAllegiance(player.allegiance) }
    : player)

const checkRequiredTargetPlayer = (gameState: PublicGameState, action: Actions) => {
  const opponents = getActionTargets(gameState, action)

  if (opponents.length === 2 && opponents[0].influenceCount === 1 && opponents[1].influenceCount === 1) {
    if (opponents[0].coins >= 7 && opponents[1].coins < 7) {
      return opponents[0]
    }
    if (opponents[1].coins >= 7 && opponents[0].coins < 7) {
      return opponents[1]
    }
  }
}

const decideCoupTarget = (gameState: PublicGameState) => {
  const requiredTarget = checkRequiredTargetPlayer(gameState, Actions.Coup)
  if (requiredTarget) return requiredTarget

  const opponents = getActionTargets(gameState, Actions.Coup)

  const vengefulness = (gameState.selfPlayer?.personality?.vengefulness ?? 50) / 100
  const opponentAffinities: [number, PublicPlayer][] = opponents.map((opponent) => {
    const dangerFactor = getPlayerDangerFactor(opponent)
    const revengeFactor = (gameState.selfPlayer?.grudges[opponent.name] ?? 0) * vengefulness * 2
    return [dangerFactor + revengeFactor + Math.random() * 3, opponent]
  })

  return opponentAffinities.sort((a, b) => b[0] - a[0])[0]?.[1]
}

const decideAssasinationTarget = (gameState: PublicGameState) => {
  const requiredTarget = checkRequiredTargetPlayer(gameState, Actions.Assassinate)
  if (requiredTarget) return requiredTarget

  const opponents = getActionTargets(gameState, Actions.Assassinate)

  const skepticism = (gameState.selfPlayer?.personality?.skepticism ?? 50) / 100
  const vengefulness = (gameState.selfPlayer?.personality?.vengefulness ?? 50) / 100
  const opponentAffinities: [number, PublicPlayer][] = opponents.map((opponent) => {
    const dangerFactor = getPlayerDangerFactor(opponent)
    const revengeFactor = (gameState.selfPlayer?.grudges[opponent.name] ?? 0) * vengefulness * 2
    const contessaFactor = opponent.claimedInfluences.has(Influences.Contessa) ? -10 - 10 * (1 - skepticism) : 0
    return [dangerFactor + revengeFactor + contessaFactor + Math.random() * 3, opponent]
  })

  return opponentAffinities.sort((a, b) => b[0] - a[0])[0]?.[1]
}

const getExamineTargetScore = (gameState: PublicGameState, opponent: PublicPlayer) => {
  const vengefulness = (gameState.selfPlayer?.personality?.vengefulness ?? 50) / 100
  return getPlayerDangerFactor(opponent)
    + (opponent.claimedInfluences.has(Influences.Duke) ? 4 : 0)
    + (opponent.claimedInfluences.has(Influences.Assassin) ? 3 : 0)
    + (opponent.claimedInfluences.has(Influences.Captain) ? 3 : 0)
    + (opponent.claimedInfluences.has(Influences.Inquisitor) ? 3 : 0)
    + (gameState.selfPlayer?.grudges[opponent.name] ?? 0) * vengefulness * 0.5
}

const decideExamineTarget = (gameState: PublicGameState) => {
  const opponents = getActionTargets(gameState, Actions.Examine)

  return opponents
    .map((opponent): [number, PublicPlayer] => [getExamineTargetScore(gameState, opponent) + Math.random() * 2, opponent])
    .sort((a, b) => b[0] - a[0])[0]?.[1]
}

const decideStartingAllegiance = (gameState: PublicGameState) => {
  if (!gameState.selfPlayer) {
    throw new Error('AI could not determine self player')
  }

  const aggressiveActions = getAggressiveActionsForSelf(gameState)

  const candidates = shuffle([Allegiances.Loyalist, Allegiances.Reformist]).map((startingAllegiance) => {
    const players = getStartingAllegianceAssignments(gameState.players, startingAllegiance)
    const selfPlayer = players.find(({ name }) => name === gameState.selfPlayer!.name)
    if (!selfPlayer) {
      throw new UnableToFindPlayerError()
    }

    const score = players.reduce((agg, opponent) => {
      if (!opponent.influenceCount || opponent.name === selfPlayer.name) {
        return agg
      }

      const danger = getPlayerDangerFactor(opponent)
      const isOpposingAllegiance = !selfPlayer.allegiance || !opponent.allegiance || selfPlayer.allegiance !== opponent.allegiance
      if (!isOpposingAllegiance) {
        return agg - danger * 0.6
      }

      const aggressiveOpportunityBonus = aggressiveActions.some((action) => canSourceTargetPlayer({
        gameState: { players, settings: gameState.settings },
        action,
        sourcePlayerName: selfPlayer.name,
        targetPlayerName: opponent.name,
      })) ? 3 : 0

      return agg + danger + (opponent.coins >= 7 ? 4 : 0) + aggressiveOpportunityBonus
    }, 0)

    return { allegiance: startingAllegiance, score }
  })

  candidates.sort((a, b) => b.score - a.score)
  return candidates[0].allegiance
}

const getConvertScore = (gameState: PublicGameState, targetPlayerName: string) => {
  if (!gameState.selfPlayer) {
    throw new Error('AI could not determine self player')
  }

  const beforePlayers = gameState.players
  const afterPlayers = getConvertedPlayers(beforePlayers, targetPlayerName)
  const cost = targetPlayerName === gameState.selfPlayer.name ? 1 : 2
  const targetPlayerBefore = getPlayerByName(gameState, targetPlayerName)
  const selfPlayerAfter = afterPlayers.find(({ name }) => name === gameState.selfPlayer!.name)

  if (!targetPlayerBefore || !selfPlayerAfter) {
    throw new UnableToFindPlayerError()
  }

  let score = -cost
  beforePlayers.forEach((opponent) => {
    if (!opponent.influenceCount || opponent.name === gameState.selfPlayer!.name) {
      return
    }

    const wasTargetable = canSourceTargetPlayer({
      gameState: { players: beforePlayers, settings: gameState.settings },
      action: Actions.Coup,
      sourcePlayerName: gameState.selfPlayer!.name,
      targetPlayerName: opponent.name,
    })
    const isTargetable = canSourceTargetPlayer({
      gameState: { players: afterPlayers, settings: gameState.settings },
      action: Actions.Coup,
      sourcePlayerName: gameState.selfPlayer!.name,
      targetPlayerName: opponent.name,
    })

    if (!wasTargetable && isTargetable) {
      score += getPlayerDangerFactor(opponent)
      if (opponent.coins >= 7) {
        score += 4
      }
    }

    if (wasTargetable && !isTargetable) {
      score -= getPlayerDangerFactor(opponent)
    }
  })

  const getLivingPlayersOnAllegiance = (
    players: PublicPlayer[],
    allegiance?: Allegiances
  ) => allegiance
    ? players.filter((player) => player.influenceCount > 0 && player.allegiance === allegiance)
    : []

  const selfBeforeTeammates = getLivingPlayersOnAllegiance(beforePlayers, gameState.selfPlayer.allegiance)
  const selfAfterTeammates = getLivingPlayersOnAllegiance(afterPlayers, selfPlayerAfter.allegiance)
  const selfAfterOpponents = selfPlayerAfter.allegiance
    ? afterPlayers.filter((player) =>
      player.influenceCount > 0
      && player.allegiance
      && player.allegiance !== selfPlayerAfter.allegiance)
    : []

  if (selfBeforeTeammates.length === 1 && selfAfterTeammates.length >= 2) {
    score += 12
  } else if (selfAfterTeammates.length >= 2) {
    score += 4
  }

  if (selfAfterTeammates.length === 1 && selfAfterOpponents.length >= 2) {
    score -= 40
  }

  if (targetPlayerName !== gameState.selfPlayer.name) {
    const targetPlayerAfter = afterPlayers.find(({ name }) => name === targetPlayerName)
    const targetAfterTeammates = getLivingPlayersOnAllegiance(afterPlayers, targetPlayerAfter?.allegiance)
    if (
      targetPlayerAfter
      && targetAfterTeammates.length === 1
      && selfAfterTeammates.length >= 2
    ) {
      score += 8
    }
  }

  return score
}

const getHasLegalTargetForAction = ({
  gameState,
  playerName,
  action,
}: {
  gameState: PublicGameState
  playerName: string
  action: Actions
}) => getActionTargets(gameState, action, playerName).length > 0

const getHasLegalStealTarget = ({
  gameState,
  playerName,
}: {
  gameState: PublicGameState
  playerName: string
}) => getActionTargets(gameState, Actions.Steal, playerName).some(({ coins }) => coins > 0)

const getHasThreateningOpponent = ({
  gameState,
  playerName,
}: {
  gameState: PublicGameState
  playerName: string
}) => gameState.players.some(({ name, influenceCount, coins }) =>
  name !== playerName && influenceCount > 0 && coins >= 3)

const getInfluenceUtility = ({
  gameState,
  playerName,
  playerCoins,
  claimedInfluences,
  influences,
  influence,
}: {
  gameState: PublicGameState
  playerName: string
  playerCoins: number
  claimedInfluences: Set<Influences>
  influences?: Influences[]
  influence: Influences
}) => {
  let utility = 0

  if (influence === Influences.Duke) {
    utility = playerCoins >= 7 ? 3 : 6
  } else if (influence === Influences.Assassin) {
    utility = playerCoins >= 3 && getHasLegalTargetForAction({ gameState, playerName, action: Actions.Assassinate }) ? 7 : 2
  } else if (influence === Influences.Captain) {
    utility = getHasLegalStealTarget({ gameState, playerName }) ? 6 : 2
  } else if (influence === Influences.Inquisitor) {
    utility = gameState.settings.enableInquisitor && getHasLegalTargetForAction({ gameState, playerName, action: Actions.Examine }) ? 6 : 3
  } else if (influence === Influences.Ambassador) {
    utility = 5
  } else if (influence === Influences.Contessa) {
    utility = getHasThreateningOpponent({ gameState, playerName }) ? 7 : 2
  }

  if (claimedInfluences.has(influence)) {
    utility += 2
  }

  if (influences && influences.filter((ownedInfluence) => ownedInfluence === influence).length > 1) {
    utility -= 2
  }

  return utility
}

const getLeastUsefulSelfInfluence = (gameState: PublicGameState, influences = gameState.selfPlayer!.influences) => {
  if (!gameState.selfPlayer) {
    throw new Error('AI could not determine self player')
  }

  return shuffle([...influences])
    .map((influence) => ({
      influence,
      utility: getInfluenceUtility({
        gameState,
        playerName: gameState.selfPlayer!.name,
        playerCoins: gameState.selfPlayer!.coins,
        claimedInfluences: gameState.selfPlayer!.claimedInfluences,
        influences,
        influence,
      })
    }))
    .sort((a, b) => a.utility - b.utility)[0].influence
}

const getObservedInfluenceUtility = (gameState: PublicGameState, playerName: string, influence: Influences) => {
  const player = getPlayerByName(gameState, playerName)
  if (!player) {
    throw new UnableToFindPlayerError()
  }

  return getInfluenceUtility({
    gameState,
    playerName,
    playerCoins: player.coins,
    claimedInfluences: player.claimedInfluences,
    influence,
  })
}

const decideExamineResponse = (gameState: PublicGameState) => {
  if (!gameState.pendingExamine?.chosenInfluence) {
    throw new Error('AI could not determine examined influence')
  }

  const targetPlayer = getPlayerByName(gameState, gameState.pendingExamine.targetPlayer)
  if (!targetPlayer) {
    throw new UnableToFindPlayerError()
  }

  const examinedInfluenceUtility = getObservedInfluenceUtility(
    gameState,
    targetPlayer.name,
    gameState.pendingExamine.chosenInfluence,
  )

  if (
    examinedInfluenceUtility >= 5
    || targetPlayer.claimedInfluences.has(gameState.pendingExamine.chosenInfluence)
  ) {
    return ExamineResponses.ForceExchange
  }

  return ExamineResponses.Return
}

const checkEndGameAction = (gameState: PublicGameState): {
  action: Actions
  targetPlayer?: string
} | null => {
  const coupTargets = getActionTargets(gameState, Actions.Coup)

  if (coupTargets.length === 1 && coupTargets[0].influenceCount === 1 && gameState.selfPlayer!.coins >= 7) {
    return { action: Actions.Coup, targetPlayer: coupTargets[0].name }
  }

  if (gameState.selfPlayer?.influences.length === 1) {
    const assassinationTargets = getActionTargets(gameState, Actions.Assassinate)
    const stealTargets = getActionTargets(gameState, Actions.Steal).filter(({ coins }) => coins > 0)
    const opponent = assassinationTargets[0] ?? stealTargets[0]

    if (opponent && (assassinationTargets.length === 1 || stealTargets.length === 1) && opponent.coins >= 7) {
      if (opponent.influenceCount === 1 && gameState.selfPlayer.coins >= 7 && coupTargets[0]) {
        return { action: Actions.Coup, targetPlayer: coupTargets[0].name }
      }

      const assassinate = assassinationTargets[0] ? { action: Actions.Assassinate, targetPlayer: assassinationTargets[0].name } : null
      const steal = stealTargets[0] ? { action: Actions.Steal, targetPlayer: stealTargets[0].name } : null

      if (!assassinate && steal) {
        return steal
      }
      if (!steal && assassinate) {
        return assassinate
      }
      if (!assassinate || !steal) {
        return null
      }

      if (gameState.selfPlayer.coins < 3) {
        return steal
      }

      if (opponent.coins >= 9) {
        return assassinate
      }

      if (gameState.selfPlayer.influences.includes(Influences.Assassin)) {
        return assassinate
      }

      if (gameState.selfPlayer.influences.includes(Influences.Captain)) {
        return steal
      }

      const chanceOfAssassin = getProbabilityOfPlayerInfluence(gameState, Influences.Assassin, gameState.selfPlayer.name)
      const chanceOfCaptain = getProbabilityOfPlayerInfluence(gameState, Influences.Captain, gameState.selfPlayer.name)

      if ((chanceOfAssassin === 0 && chanceOfCaptain === 0) || chanceOfAssassin === chanceOfCaptain) {
        return Math.random() > 0.5 ? assassinate : steal
      }

      return chanceOfAssassin + Math.random() * 0.1 > chanceOfCaptain + Math.random() * 0.1
        ? assassinate : steal
    }
  }

  return null
}

const checkEndGameBlockResponse = (gameState: PublicGameState): {
  response: Responses
} | null => {
  if (gameState.selfPlayer?.influences.length === 1) {
    const opponents = getOpponents(gameState)

    if (opponents.length === 1 && opponents[0].coins >= 7) {
      return { response: Responses.Challenge }
    }
  }

  return null
}

const getFinalBluffMargin = (
  baseBluffMargin: number,
  influence: Influences,
  self: Player
) => {
  let finalBluffMargin = baseBluffMargin
  if (self.unclaimedInfluences.has(influence)) {
    finalBluffMargin *= 0.2
  }
  if (self.claimedInfluences.has(influence)) {
    finalBluffMargin *= 5
  }
  return finalBluffMargin
}

export const decideAction = (gameState: PublicGameState): {
  action: Actions
  targetPlayer?: string
} => {
  if (!gameState.selfPlayer) {
    throw new Error('AI could not determine self player')
  }

  let willCoup = false
  let willRevive = false
  if (gameState.selfPlayer?.coins >= 10) {
    if (gameState.settings.allowRevive
      && gameState.selfPlayer.influences.length === 1
      && Math.random() > 0.2) {
      willRevive = true
    } else {
      willCoup = true
    }
  } else if (gameState.selfPlayer?.coins >= 7) {
    const endGameAction = checkEndGameAction(gameState)
    if (endGameAction) return endGameAction

    willCoup = Math.random() > 0.5
  }

  if (willCoup) {
    const targetPlayer = decideCoupTarget(gameState)
    if (targetPlayer) {
      return { action: Actions.Coup, targetPlayer: targetPlayer.name }
    }
  }

  if (willRevive) return { action: Actions.Revive }

  const honesty = (gameState.selfPlayer.personality?.honesty ?? 50) / 100
  const skepticism = (gameState.selfPlayer.personality?.skepticism ?? 50) / 100
  const vengefulness = (gameState.selfPlayer.personality?.vengefulness ?? 50) / 100
  const selfPlayer = gameState.selfPlayer

  const baseBluffMargin = (1 - honesty) ** 1.5 * 0.3
  const getFinalBluffMarginForAction = (influence: Influences) =>
    getFinalBluffMargin(baseBluffMargin, influence, gameState.selfPlayer!)

  if (
    gameState.settings.enableReformation
    && gameState.treasuryReserveCoins > 0
    && !gameState.selfPlayer.influences.includes(Influences.Duke)
    && !gameState.selfPlayer.claimedInfluences.has(Influences.Duke)
  ) {
    let embezzleScore = gameState.treasuryReserveCoins
    if ((selfPlayer.coins < 3 && selfPlayer.coins + gameState.treasuryReserveCoins >= 3)
      || (selfPlayer.coins < 7 && selfPlayer.coins + gameState.treasuryReserveCoins >= 7)) {
      embezzleScore += 2
    }

    const bestSafeEconomyScore = selfPlayer.influences.includes(Influences.Duke) ? 3 : 2
    if (embezzleScore >= 4 && embezzleScore > bestSafeEconomyScore && Math.random() > 0.25) {
      return { action: Actions.Embezzle }
    }
  }

  if (
    getProbabilityOfPlayerInfluence(gameState, Influences.Duke) > 0 && (
      (!randomlyDecideToNotUseOwnedInfluence() && gameState.selfPlayer.influences.includes(Influences.Duke))
      || randomlyDecideToBluff(getFinalBluffMarginForAction(Influences.Duke))
    )
  ) {
    return { action: Actions.Tax }
  }

  if (
    getProbabilityOfPlayerInfluence(gameState, Influences.Captain) > 0 && (
      (!randomlyDecideToNotUseOwnedInfluence() && gameState.selfPlayer.influences.includes(Influences.Captain))
      || randomlyDecideToBluff(getFinalBluffMarginForAction(Influences.Captain))
    )
  ) {
    const stealBlockInfluence = gameState.settings.enableInquisitor ? Influences.Inquisitor : Influences.Ambassador
    const getProbabilityOfBlockingSteal = (playerName: string) =>
      getProbabilityOfPlayerInfluence(gameState, Influences.Captain, playerName)
      + getProbabilityOfPlayerInfluence(gameState, stealBlockInfluence, playerName)

    const possibleTargets = getActionTargets(gameState, Actions.Steal).filter(({ coins }) => coins > 0)

    let minBlockingAbility = Infinity
    const bestTargets: PublicPlayer[] = []
    possibleTargets.forEach((possibleTarget) => {
      const blockingAbility =
        (possibleTarget.claimedInfluences.has(Influences.Captain) ? (0.5 * (1.5 - skepticism)) : 0)
        + (possibleTarget.claimedInfluences.has(gameState.settings.enableInquisitor ? Influences.Inquisitor : Influences.Ambassador) ? (0.5 * (1.5 - skepticism)) : 0)
        - (possibleTarget.unclaimedInfluences.has(Influences.Captain) ? (0.5 * (1.5 - skepticism)) : 0)
        - (possibleTarget.unclaimedInfluences.has(gameState.settings.enableInquisitor ? Influences.Inquisitor : Influences.Ambassador) ? (0.5 * (1.5 - skepticism)) : 0)
        + getProbabilityOfBlockingSteal(possibleTarget.name)

      if (blockingAbility < minBlockingAbility) {
        minBlockingAbility = blockingAbility
        bestTargets.length = 0
      }

      if (blockingAbility <= minBlockingAbility) {
        bestTargets.push(possibleTarget)
      }
    })

    if (bestTargets.length && minBlockingAbility < 0.99) {
      const chosenTarget = bestTargets[Math.floor(Math.random() * bestTargets.length)]
      return { action: Actions.Steal, targetPlayer: chosenTarget.name }
    }
  }

  if (
    getProbabilityOfPlayerInfluence(gameState, gameState.settings.enableInquisitor ? Influences.Inquisitor : Influences.Ambassador) > 0 && (
      (!randomlyDecideToNotUseOwnedInfluence() && gameState.selfPlayer.influences.includes(gameState.settings.enableInquisitor ? Influences.Inquisitor : Influences.Ambassador))
      || randomlyDecideToBluff(getFinalBluffMarginForAction(gameState.settings.enableInquisitor ? Influences.Inquisitor : Influences.Ambassador))
    )
  ) {
    if (gameState.settings.enableInquisitor) {
      const targetPlayer = decideExamineTarget(gameState)
      const examineThreshold = 18 - vengefulness * 2
      if (targetPlayer && getExamineTargetScore(gameState, targetPlayer) >= examineThreshold) {
        return { action: Actions.Examine, targetPlayer: targetPlayer.name }
      }
    }

    return { action: Actions.Exchange }
  }

  if (
    getProbabilityOfPlayerInfluence(gameState, Influences.Assassin) > 0
    && gameState.selfPlayer.coins >= 3 && (
      (!randomlyDecideToNotUseOwnedInfluence() && gameState.selfPlayer.influences.includes(Influences.Assassin))
      || randomlyDecideToBluff(getFinalBluffMarginForAction(Influences.Assassin))
    )
  ) {
    const targetPlayer = decideAssasinationTarget(gameState)
    if (targetPlayer) {
      return { action: Actions.Assassinate, targetPlayer: targetPlayer.name }
    }
  }

  const claimedDukeCount = gameState.players.filter(({ claimedInfluences }) => claimedInfluences.has(Influences.Duke)).length
  if (claimedDukeCount * (0.35 - skepticism * 0.35) + getProbabilityOfPlayerInfluence(gameState, Influences.Duke) < 0.25 + Math.random() * 0.1) {
    return { action: Actions.ForeignAid }
  }

  if (
    gameState.settings.enableReformation
    && gameState.selfPlayer.coins >= 1
  ) {
    const convertTargets = getLegalTargetPlayers({
      gameState,
      action: Actions.Convert,
      sourcePlayerName: selfPlayer.name,
    }).filter(({ name, influenceCount }) => name === selfPlayer.name || influenceCount > 0)

    const rankedConvertTargets = shuffle(convertTargets)
      .map((targetPlayer) => ({
        targetPlayer: targetPlayer.name,
        score: getConvertScore(gameState, targetPlayer.name),
        selfTarget: targetPlayer.name === selfPlayer.name,
      }))
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score
        }
        if (a.selfTarget !== b.selfTarget) {
          return a.selfTarget ? -1 : 1
        }
        return 0
      })

    if (rankedConvertTargets[0] && rankedConvertTargets[0].score >= 4) {
      return { action: Actions.Convert, targetPlayer: rankedConvertTargets[0].targetPlayer }
    }
  }

  return { action: Actions.Income }
}

export const decideActionResponse = (gameState: PublicGameState): {
  response: Responses
  claimedInfluence?: Influences
} => {
  if (!gameState.selfPlayer) {
    throw new Error('AI could not determine self player')
  }

  const honesty = (gameState.selfPlayer.personality?.honesty ?? 50) / 100
  const skepticism = (gameState.selfPlayer.personality?.skepticism ?? 50) / 100
  const turnPlayer = gameState.players.find(({ name }) => name === gameState.turnPlayer)

  if (gameState.pendingAction?.action === Actions.Embezzle) {
    const expectedDukeCount = getProbabilityOfPlayerInfluence(gameState, Influences.Duke, gameState.turnPlayer)
    const suspicionScore = expectedDukeCount
      + (turnPlayer?.claimedInfluences.has(Influences.Duke) ? 0.5 : 0)
      + (gameState.treasuryReserveCoins >= 3 ? 0.25 : 0)
      + (((turnPlayer?.coins ?? 0) + gameState.treasuryReserveCoins >= 7) ? 0.25 : 0)

    if (suspicionScore >= 1 - 0.4 * skepticism) {
      return { response: Responses.Challenge }
    }

    return { response: Responses.Pass }
  }

  const requiredInfluenceForAction = getRequiredInfluenceForAction(gameState.settings, gameState.pendingAction!.action)
  const isSelfTarget = gameState.pendingAction?.targetPlayer === gameState.selfPlayer.name
  const skepticismMargin = skepticism ** 2 * ((isSelfTarget ? 0.8 : 0.4) + Math.random() * 0.1)
  const isChallengeable = requiredInfluenceForAction && !gameState.pendingAction?.claimConfirmed

  if (
    isChallengeable
    && getProbabilityOfPlayerInfluence(gameState, requiredInfluenceForAction, gameState.turnPlayer) === 0
  ) {
    return { response: Responses.Challenge }
  }

  const isBlockable = (
    ActionAttributes[gameState.pendingAction!.action].blockable
    && (
      gameState.pendingAction?.targetPlayer === gameState.selfPlayer.name
      || gameState.pendingAction!.action === Actions.ForeignAid
    )
  )
  const canLegallyBlockAction = (
    isBlockable
    && canPlayerBlockAction({
      gameState,
      action: gameState.pendingAction!.action,
      actionPlayerName: gameState.turnPlayer!,
      blockPlayerName: gameState.selfPlayer.name,
    })
  )

  const legalBlockInfluences = shuffle(getLegalBlockInfluences(gameState.settings, gameState.pendingAction!.action))

  if (canLegallyBlockAction) {
    for (const legalBlockInfluence of legalBlockInfluences) {
      const hasLegalBlockingInfluence = gameState.selfPlayer?.influences.includes(legalBlockInfluence)
      if (hasLegalBlockingInfluence && !randomlyDecideToNotUseOwnedInfluence()) {
        return { response: Responses.Block, claimedInfluence: legalBlockInfluence }
      }
    }
  }

  if (
    isChallengeable
    && getProbabilityOfPlayerInfluence(gameState, requiredInfluenceForAction, gameState.turnPlayer) <= skepticismMargin
    && (
      !turnPlayer?.claimedInfluences.has(requiredInfluenceForAction)
      || turnPlayer?.unclaimedInfluences.has(requiredInfluenceForAction)
      || Math.random() < skepticismMargin
    )
  ) {
    return { response: Responses.Challenge }
  }

  if (canLegallyBlockAction) {
    for (const legalBlockInfluence of legalBlockInfluences) {
      const baseBluffMargin = (1 - honesty) ** 1.5 * ((isSelfTarget ? 0.4 : 0.2) + Math.random() * 0.1)
      const finalBluffMargin = getFinalBluffMargin(baseBluffMargin, legalBlockInfluence, gameState.selfPlayer)

      if (
        randomlyDecideToBluff(finalBluffMargin)
        && getProbabilityOfPlayerInfluence(gameState, legalBlockInfluence) > 0
      ) {
        return { response: Responses.Block, claimedInfluence: legalBlockInfluence }
      }
    }
  }

  if (gameState.pendingAction?.action === Actions.Assassinate
    && gameState.pendingAction.targetPlayer === gameState.selfPlayer?.name
    && gameState.selfPlayer?.influences.length === 1
  ) {
    const probabilityOfAssassin = getProbabilityOfPlayerInfluence(gameState, Influences.Assassin, gameState.turnPlayer)
    const probabilityOfContessa = getProbabilityOfPlayerInfluence(gameState, Influences.Contessa, gameState.selfPlayer.name)

    if (probabilityOfAssassin === 0 || probabilityOfContessa === 0) {
      return { response: Responses.Challenge }
    }

    return probabilityOfAssassin > 0.4 + Math.random() * 0.2
      ? { response: Responses.Block, claimedInfluence: Influences.Contessa }
      : { response: Responses.Challenge }
  }

  return { response: Responses.Pass }
}

export const decideActionChallengeResponse = (gameState: PublicGameState): {
  influence: Influences
} => {
  const requiredInfluence = getRequiredInfluenceForAction(gameState.settings, gameState.pendingAction!.action)
  const revealedInfluence = requiredInfluence && gameState.selfPlayer?.influences.some((i) => i === requiredInfluence)
    ? requiredInfluence
    : gameState.selfPlayer!.influences[Math.floor(Math.random() * gameState.selfPlayer!.influences.length)]

  return { influence: revealedInfluence }
}

export const decideBlockResponse = (gameState: PublicGameState): {
  response: Responses
} => {
  const skepticism = (gameState.selfPlayer?.personality?.skepticism ?? 50) / 100

  const endGameBlockResponse = checkEndGameBlockResponse(gameState)
  if (endGameBlockResponse) {
    return endGameBlockResponse
  }

  const isSelfAction = gameState.turnPlayer === gameState.selfPlayer?.name
  const skepticismMargin = skepticism ** 2 * ((isSelfAction ? 0.8 : 0.4) + Math.random() * 0.1)
  if (getProbabilityOfPlayerInfluence(gameState, gameState.pendingBlock!.claimedInfluence, gameState.pendingBlock!.sourcePlayer) <= skepticismMargin
    && (!gameState.players.find(({ name }) => name === gameState.pendingBlock!.sourcePlayer)?.claimedInfluences.has(gameState.pendingBlock!.claimedInfluence) || Math.random() < skepticismMargin)) {
    return { response: Responses.Challenge }
  }

  return { response: Responses.Pass }
}

export const decideBlockChallengeResponse = (gameState: PublicGameState): {
  influence: Influences
} => {
  const revealedInfluence = gameState.selfPlayer?.influences.some((i) => i === gameState.pendingBlock!.claimedInfluence)
    ? gameState.pendingBlock!.claimedInfluence
    : gameState.selfPlayer!.influences[Math.floor(Math.random() * gameState.selfPlayer!.influences.length)]

  return { influence: revealedInfluence }
}

export const decideInfluencesToLose = (gameState: PublicGameState): {
  influences: Influences[]
} => {
  const currentInfluences = [...gameState.selfPlayer!.influences]
  const influencesToLose = gameState.pendingInfluenceLoss[gameState.selfPlayer!.name].length
  const lostInfluences: Influences[] = []

  while (lostInfluences.length < influencesToLose) {
    const influenceToLose = getLeastUsefulSelfInfluence(gameState, currentInfluences)
    lostInfluences.push(influenceToLose)
    currentInfluences.splice(currentInfluences.indexOf(influenceToLose), 1)
  }

  return { influences: lostInfluences }
}

export const getPlayerSuggestedMove = async ({ roomId, playerId }: {
  roomId: string
  playerId: string
}) => {
  const gameState = await getGameState(roomId)
  const player = gameState.players.find(({ id }) => id === playerId)

  if (!player) {
    throw new UnableToFindPlayerError()
  }

  const playersLeft = gameState.players.filter(({ influences }) => influences.length)
  const gameIsOver = playersLeft.length === 1

  if (gameIsOver) {
    return null
  }

  const playerState = getPublicGameState({ gameState, playerId })

  if (canPlayerChooseStartingAllegiance(playerState)) {
    return [PlayerActions.chooseStartingAllegiance, {
      roomId,
      playerId,
      allegiance: decideStartingAllegiance(playerState)
    }]
  }

  if (canPlayerChooseExamineInfluence(playerState)) {
    const influence = getLeastUsefulSelfInfluence(playerState)
    return [PlayerActions.chooseExamineInfluence, { roomId, playerId, influence }]
  }

  if (canPlayerResolveExamine(playerState)) {
    return [PlayerActions.resolveExamine, { roomId, playerId, response: decideExamineResponse(playerState) }]
  }

  if (canPlayerChooseEmbezzleChallengeDecision(playerState)) {
    const hasDuke = playerState.selfPlayer!.influences.includes(Influences.Duke)
    return [PlayerActions.embezzleChallengeDecision, { roomId, playerId, response: hasDuke ? EmbezzleChallengeResponses.Concede : EmbezzleChallengeResponses.ProveNoDuke }]
  }

  const pendingLossPlayers = Object.keys(gameState.pendingInfluenceLoss)
  if (pendingLossPlayers.includes(player.name)) {
    const { influences } = decideInfluencesToLose(playerState)

    return [PlayerActions.loseInfluences, {
      roomId,
      playerId,
      influences
    }]
  }

  if (canPlayerChooseAction(playerState)) {
    const { action, targetPlayer } = decideAction(playerState)

    return [PlayerActions.action, {
      roomId,
      playerId,
      action,
      ...(targetPlayer && { targetPlayer })
    }]
  }

  if (canPlayerChooseActionResponse(playerState)) {
    const { response, claimedInfluence } = decideActionResponse(playerState)

    return [PlayerActions.actionResponse, {
      roomId,
      playerId,
      response,
      ...(claimedInfluence && { claimedInfluence })
    }]
  }

  if (canPlayerChooseActionChallengeResponse(playerState)) {
    const { influence } = decideActionChallengeResponse(playerState)

    return [PlayerActions.actionChallengeResponse, {
      roomId,
      playerId,
      influence
    }]
  }

  if (canPlayerChooseBlockResponse(playerState)) {
    const { response } = decideBlockResponse(playerState)

    return [PlayerActions.blockResponse, {
      roomId,
      playerId,
      response
    }]
  }

  if (canPlayerChooseBlockChallengeResponse(playerState)) {
    const { influence } = decideBlockChallengeResponse(playerState)

    return [PlayerActions.blockChallengeResponse, {
      roomId,
      playerId,
      influence
    }]
  }

  return null
}
