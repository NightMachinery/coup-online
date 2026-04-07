import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameState, Player, PublicGameState, PublicPlayer } from '../../../shared/types/game'
import {
  Actions,
  Allegiances,
  EmbezzleChallengeResponses,
  ExamineResponses,
  Influences,
  PlayerActions,
  Responses,
} from '../../../shared/types/game'

vi.mock('./aiRandomness')
vi.mock('../utilities/gameState', async () => {
  const actual = await vi.importActual<typeof import('../utilities/gameState')>('../utilities/gameState')
  return {
    ...actual,
    getGameState: vi.fn(),
    getPublicGameState: vi.fn(),
  }
})

import {
  decideAction,
  decideActionResponse,
  decideInfluencesToLose,
  getOpponents,
  getPlayerDangerFactor,
  getPlayerSuggestedMove,
  getProbabilityOfPlayerInfluence,
} from './ai'
import { randomlyDecideToBluff, randomlyDecideToNotUseOwnedInfluence } from './aiRandomness'
import { getGameState, getPublicGameState } from '../utilities/gameState'

const randomlyDecideToBluffMock = vi.mocked(randomlyDecideToBluff)
const randomlyDecideToNotUseOwnedInfluenceMock = vi.mocked(randomlyDecideToNotUseOwnedInfluence)
const getGameStateMock = vi.mocked(getGameState)
const getPublicGameStateMock = vi.mocked(getPublicGameState)

const buildPublicPlayer = (overrides: Partial<PublicPlayer> & Pick<PublicPlayer, 'name'>): PublicPlayer => {
  const { name, ...rest } = overrides
  return {
    name,
    coins: 2,
    influenceCount: 2,
    claimedInfluences: new Set(),
    unclaimedInfluences: new Set(),
    deadInfluences: [],
    color: '#123456',
    ai: true,
    grudges: {},
    ...rest,
  }
}

const buildPlayer = (overrides: Partial<Player> & Pick<Player, 'id' | 'name'>): Player => {
  const { id, name, ...rest } = overrides
  return {
    id,
    name,
    coins: 2,
    influences: [Influences.Contessa, Influences.Captain],
    claimedInfluences: new Set(),
    unclaimedInfluences: new Set(),
    deadInfluences: [],
    color: '#654321',
    ai: true,
    grudges: {},
    ...rest,
  }
}

const buildGameState = ({
  players,
  selfPlayer,
  settings,
  pendingAction,
  pendingExamine,
  pendingInfluenceLoss,
  turnPlayer,
  treasuryReserveCoins,
}: {
  players: PublicPlayer[]
  selfPlayer: Player
  settings?: PublicGameState['settings']
  pendingAction?: PublicGameState['pendingAction']
  pendingExamine?: PublicGameState['pendingExamine']
  pendingInfluenceLoss?: PublicGameState['pendingInfluenceLoss']
  turnPlayer?: string
  treasuryReserveCoins?: number
}): PublicGameState => ({
  roomId: 'room-1',
  isStarted: true,
  turn: 1,
  eventLogs: [],
  chatMessages: [],
  lastEventTimestamp: new Date('2026-04-07T00:00:00.000Z'),
  players,
  selfPlayer,
  settings: {
    eventLogRetentionTurns: 3,
    allowRevive: true,
    ...settings,
  },
  pendingInfluenceLoss: pendingInfluenceLoss ?? {},
  selfIsCreator: false,
  treasuryReserveCoins: treasuryReserveCoins ?? 0,
  deckCount: Math.max(0, 15 - players.length * 2),
  ...(pendingAction && { pendingAction }),
  ...(pendingExamine && { pendingExamine }),
  ...(turnPlayer && { turnPlayer }),
})

beforeEach(() => {
  randomlyDecideToBluffMock.mockReturnValue(false)
  randomlyDecideToNotUseOwnedInfluenceMock.mockReturnValue(false)
  getGameStateMock.mockReset()
  getPublicGameStateMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ai', () => {
  describe('getProbabilityOfPlayerInfluence', () => {
    it('returns zero when all copies of an influence are already known', () => {
      const gameState = buildGameState({
        players: [
          buildPublicPlayer({ name: 'bot', influenceCount: 1, deadInfluences: [Influences.Ambassador] }),
          buildPublicPlayer({ name: 'alice', influenceCount: 1, deadInfluences: [Influences.Assassin] }),
          buildPublicPlayer({ name: 'carol', influenceCount: 1, deadInfluences: [Influences.Assassin] }),
        ],
        selfPlayer: buildPlayer({
          id: 'bot-id',
          name: 'bot',
          influences: [Influences.Assassin],
          deadInfluences: [Influences.Ambassador],
        }),
      })

      expect(getProbabilityOfPlayerInfluence(gameState, Influences.Assassin, 'alice')).toBe(0)
      expect(getProbabilityOfPlayerInfluence(gameState, Influences.Assassin)).toBe(0)
    })
  })

  describe('getPlayerDangerFactor', () => {
    it('treats dead players as non-threatening', () => {
      expect(getPlayerDangerFactor(buildPublicPlayer({ name: 'alice', influenceCount: 0, coins: 12 }))).toBe(0)
    })

    it('weights influence count and coins', () => {
      expect(getPlayerDangerFactor(buildPublicPlayer({ name: 'alice', influenceCount: 2, coins: 12 }))).toBe(32)
    })
  })

  describe('getOpponents', () => {
    it('returns only living opponents', () => {
      const gameState = buildGameState({
        players: [
          buildPublicPlayer({ name: 'bot', influenceCount: 1 }),
          buildPublicPlayer({ name: 'alice', influenceCount: 0 }),
          buildPublicPlayer({ name: 'carol', influenceCount: 1 }),
        ],
        selfPlayer: buildPlayer({ id: 'bot-id', name: 'bot', influences: [Influences.Duke] }),
      })

      expect(getOpponents(gameState).map(({ name }) => name)).toEqual(['carol'])
    })
  })

  describe('decideAction', () => {
    it('chooses Coup at 10 coins when Revive is not available', () => {
      expect(
        decideAction(
          buildGameState({
            players: [
              buildPublicPlayer({ name: 'bot' }),
              buildPublicPlayer({ name: 'alice' }),
            ],
            selfPlayer: buildPlayer({
              id: 'bot-id',
              name: 'bot',
              coins: 10,
              influences: [Influences.Ambassador, Influences.Contessa],
            }),
            settings: { eventLogRetentionTurns: 3, allowRevive: false },
          }),
        ),
      ).toEqual({
        action: Actions.Coup,
        targetPlayer: 'alice',
      })
    })

    it('chooses self Convert when that opens access to the most dangerous opponent', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)

      const gameState = buildGameState({
        players: [
          buildPublicPlayer({
            name: 'bot',
            coins: 1,
            allegiance: Allegiances.Loyalist,
            claimedInfluences: new Set([Influences.Duke]),
          }),
          buildPublicPlayer({
            name: 'threat-1',
            coins: 8,
            allegiance: Allegiances.Loyalist,
            claimedInfluences: new Set([Influences.Duke]),
          }),
          buildPublicPlayer({
            name: 'threat-2',
            coins: 7,
            allegiance: Allegiances.Loyalist,
          }),
          buildPublicPlayer({
            name: 'carol',
            coins: 0,
            allegiance: Allegiances.Reformist,
            influenceCount: 1,
          }),
          buildPublicPlayer({
            name: 'dave',
            coins: 0,
            allegiance: Allegiances.Reformist,
            influenceCount: 1,
          }),
        ],
        selfPlayer: buildPlayer({
          id: 'bot-id',
          name: 'bot',
          coins: 1,
          influences: [Influences.Contessa, Influences.Contessa],
          allegiance: Allegiances.Loyalist,
          claimedInfluences: new Set(),
        }),
        settings: {
          eventLogRetentionTurns: 3,
          allowRevive: true,
          enableReformation: true,
        },
      })

      expect(decideAction(gameState)).toEqual({
        action: Actions.Convert,
        targetPlayer: 'bot',
      })
    })

    it('chooses opponent Convert when flipping them is better than flipping self', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)

      const gameState = buildGameState({
        players: [
          buildPublicPlayer({
            name: 'bot',
            coins: 2,
            allegiance: Allegiances.Loyalist,
            claimedInfluences: new Set([Influences.Duke]),
          }),
          buildPublicPlayer({
            name: 'threat',
            coins: 8,
            allegiance: Allegiances.Loyalist,
            claimedInfluences: new Set([Influences.Duke]),
          }),
          buildPublicPlayer({
            name: 'carol',
            coins: 0,
            allegiance: Allegiances.Reformist,
            influenceCount: 1,
          }),
        ],
        selfPlayer: buildPlayer({
          id: 'bot-id',
          name: 'bot',
          coins: 2,
          influences: [Influences.Contessa, Influences.Contessa],
          allegiance: Allegiances.Loyalist,
          claimedInfluences: new Set(),
        }),
        settings: {
          eventLogRetentionTurns: 3,
          allowRevive: true,
          enableReformation: true,
        },
      })

      expect(decideAction(gameState)).toEqual({
        action: Actions.Convert,
        targetPlayer: 'threat',
      })
    })

    it('prefers Examine over Exchange when an Inquisitor target is dangerous and highly claimed', () => {
      const gameState = buildGameState({
        players: [
          buildPublicPlayer({ name: 'bot', coins: 2 }),
          buildPublicPlayer({
            name: 'threat',
            coins: 5,
            claimedInfluences: new Set([Influences.Duke, Influences.Assassin]),
          }),
          buildPublicPlayer({ name: 'carol', coins: 1, influenceCount: 1 }),
        ],
        selfPlayer: buildPlayer({
          id: 'bot-id',
          name: 'bot',
          coins: 2,
          influences: [Influences.Inquisitor, Influences.Contessa],
        }),
        settings: {
          eventLogRetentionTurns: 3,
          allowRevive: true,
          enableInquisitor: true,
        },
      })

      expect(decideAction(gameState)).toEqual({
        action: Actions.Examine,
        targetPlayer: 'threat',
      })
    })
  })

  describe('decideActionResponse', () => {
    it('passes instead of illegally blocking same-allegiance Foreign Aid in reformation', () => {
      expect(
        decideActionResponse(
          buildGameState({
            players: [
              buildPublicPlayer({ name: 'alice', allegiance: Allegiances.Loyalist }),
              buildPublicPlayer({ name: 'bot', allegiance: Allegiances.Loyalist }),
              buildPublicPlayer({ name: 'carol', allegiance: Allegiances.Reformist }),
            ],
            selfPlayer: buildPlayer({
              id: 'bot-id',
              name: 'bot',
              influences: [Influences.Duke, Influences.Captain],
              allegiance: Allegiances.Loyalist,
            }),
            pendingAction: {
              action: Actions.ForeignAid,
              claimConfirmed: false,
              pendingPlayers: new Set(['bot', 'carol']),
            },
            turnPlayer: 'alice',
            settings: {
              eventLogRetentionTurns: 3,
              allowRevive: true,
              enableReformation: true,
            },
          }),
        ),
      ).toEqual({ response: Responses.Pass })
    })

    it('now challenges suspicious Embezzle claims', () => {
      const gameState = buildGameState({
        players: [
          buildPublicPlayer({
            name: 'alice',
            coins: 4,
            claimedInfluences: new Set([Influences.Duke]),
          }),
          buildPublicPlayer({ name: 'bot', coins: 2 }),
          buildPublicPlayer({ name: 'carol', influenceCount: 1 }),
        ],
        selfPlayer: buildPlayer({
          id: 'bot-id',
          name: 'bot',
          influences: [Influences.Contessa, Influences.Captain],
          personality: { honesty: 50, skepticism: 100, vengefulness: 50 },
        }),
        pendingAction: {
          action: Actions.Embezzle,
          claimConfirmed: false,
          pendingPlayers: new Set(['bot', 'carol']),
        },
        turnPlayer: 'alice',
        treasuryReserveCoins: 4,
      })

      expect(decideActionResponse(gameState)).toEqual({ response: Responses.Challenge })
    })

    it('passes on Embezzle when Duke is effectively impossible', () => {
      const gameState = buildGameState({
        players: [
          buildPublicPlayer({ name: 'alice', influenceCount: 1, deadInfluences: [Influences.Duke] }),
          buildPublicPlayer({ name: 'bot', influenceCount: 1, deadInfluences: [Influences.Duke] }),
          buildPublicPlayer({ name: 'carol', influenceCount: 1, deadInfluences: [Influences.Duke] }),
        ],
        selfPlayer: buildPlayer({
          id: 'bot-id',
          name: 'bot',
          influences: [Influences.Contessa],
          deadInfluences: [Influences.Duke],
          personality: { honesty: 50, skepticism: 0, vengefulness: 50 },
        }),
        pendingAction: {
          action: Actions.Embezzle,
          claimConfirmed: false,
          pendingPlayers: new Set(['bot', 'carol']),
        },
        turnPlayer: 'alice',
        treasuryReserveCoins: 1,
      })

      expect(decideActionResponse(gameState)).toEqual({ response: Responses.Pass })
    })
  })

  describe('decideInfluencesToLose', () => {
    it('drops the least useful influence instead of choosing randomly', () => {
      const gameState = buildGameState({
        players: [
          buildPublicPlayer({ name: 'bot', coins: 2 }),
          buildPublicPlayer({ name: 'alice', coins: 1, influenceCount: 1 }),
        ],
        selfPlayer: buildPlayer({
          id: 'bot-id',
          name: 'bot',
          coins: 2,
          influences: [Influences.Contessa, Influences.Duke],
        }),
        pendingInfluenceLoss: {
          bot: [{ putBackInDeck: false }],
        },
      })

      expect(decideInfluencesToLose(gameState)).toEqual({ influences: [Influences.Contessa] })
    })
  })

  describe('getPlayerSuggestedMove', () => {
    it('reveals the least useful card when examined', async () => {
      const rawGameState = {
        players: [
          { id: 'bot-id', name: 'bot', influences: [Influences.Contessa, Influences.Duke] },
          { id: 'alice-id', name: 'alice', influences: [Influences.Captain, Influences.Assassin] },
        ],
        pendingInfluenceLoss: {},
      } as GameState

      const publicGameState = buildGameState({
        players: [
          buildPublicPlayer({ name: 'bot', coins: 2 }),
          buildPublicPlayer({ name: 'alice', coins: 1, influenceCount: 1 }),
        ],
        selfPlayer: buildPlayer({
          id: 'bot-id',
          name: 'bot',
          coins: 2,
          influences: [Influences.Contessa, Influences.Duke],
        }),
        pendingExamine: {
          sourcePlayer: 'alice',
          targetPlayer: 'bot',
        },
      })

      getGameStateMock.mockResolvedValue(rawGameState)
      getPublicGameStateMock.mockReturnValue(publicGameState)

      await expect(getPlayerSuggestedMove({ roomId: 'room-1', playerId: 'bot-id' })).resolves.toEqual([
        PlayerActions.chooseExamineInfluence,
        { roomId: 'room-1', playerId: 'bot-id', influence: Influences.Contessa },
      ])
    })

    it('forces exchange after seeing a highly valuable claimed card', async () => {
      const rawGameState = {
        players: [
          { id: 'bot-id', name: 'bot', influences: [Influences.Inquisitor, Influences.Contessa] },
          { id: 'alice-id', name: 'alice', influences: [Influences.Duke, Influences.Captain] },
        ],
        pendingInfluenceLoss: {},
      } as GameState

      const publicGameState = buildGameState({
        players: [
          buildPublicPlayer({ name: 'bot', coins: 2 }),
          buildPublicPlayer({
            name: 'alice',
            coins: 5,
            claimedInfluences: new Set([Influences.Duke]),
          }),
        ],
        selfPlayer: buildPlayer({
          id: 'bot-id',
          name: 'bot',
          coins: 2,
          influences: [Influences.Inquisitor, Influences.Contessa],
        }),
        settings: {
          eventLogRetentionTurns: 3,
          allowRevive: true,
          enableInquisitor: true,
        },
        pendingExamine: {
          sourcePlayer: 'bot',
          targetPlayer: 'alice',
          chosenInfluence: Influences.Duke,
        },
      })

      getGameStateMock.mockResolvedValue(rawGameState)
      getPublicGameStateMock.mockReturnValue(publicGameState)

      await expect(getPlayerSuggestedMove({ roomId: 'room-1', playerId: 'bot-id' })).resolves.toEqual([
        PlayerActions.resolveExamine,
        { roomId: 'room-1', playerId: 'bot-id', response: ExamineResponses.ForceExchange },
      ])
    })

    it('concedes or proves no Duke correctly during an Embezzle challenge decision', async () => {
      const rawGameState = {
        players: [
          { id: 'bot-id', name: 'bot', influences: [Influences.Contessa] },
          { id: 'alice-id', name: 'alice', influences: [Influences.Duke] },
        ],
        pendingInfluenceLoss: {},
      } as GameState

      const publicGameState = buildGameState({
        players: [
          buildPublicPlayer({ name: 'bot', coins: 2 }),
          buildPublicPlayer({ name: 'alice', coins: 2 }),
        ],
        selfPlayer: buildPlayer({
          id: 'bot-id',
          name: 'bot',
          coins: 2,
          influences: [Influences.Contessa],
        }),
        pendingInfluenceLoss: {},
      })
      publicGameState.pendingEmbezzleChallengeDecision = {
        sourcePlayer: 'bot',
        challengePlayer: 'alice',
      }

      getGameStateMock.mockResolvedValue(rawGameState)
      getPublicGameStateMock.mockReturnValue(publicGameState)

      await expect(getPlayerSuggestedMove({ roomId: 'room-1', playerId: 'bot-id' })).resolves.toEqual([
        PlayerActions.embezzleChallengeDecision,
        { roomId: 'room-1', playerId: 'bot-id', response: EmbezzleChallengeResponses.ProveNoDuke },
      ])
    })
  })
})
