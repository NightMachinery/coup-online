import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Actions, Allegiances, Influences, PublicGameState } from '@shared'
import { render } from '../../../tests/utilities/render'
import ChooseActionResponse from './ChooseActionResponse'

vi.mock('../../contexts/TranslationsContext', () => ({
  useTranslationContext: () => ({
    t: (key: string) => key,
  }),
}))

describe('ChooseActionResponse', () => {
  const getGameState = ({
    selfAllegiance,
    otherPlayerAllegiances,
  }: {
    selfAllegiance: Allegiances
    otherPlayerAllegiances: Allegiances[]
  }): PublicGameState => ({
    roomId: 'ROOM1',
    deckCount: 7,
    eventLogs: [],
    chatMessages: [],
    lastEventTimestamp: new Date(),
    turn: 1,
    turnPlayer: 'Alice',
    isStarted: true,
    selfIsCreator: false,
    treasuryReserveCoins: 0,
    pendingInfluenceLoss: {},
    settings: {
      allowRevive: true,
      allowContessaBlockExamine: false,
      enableInquisitor: false,
      enableReformation: true,
      eventLogRetentionTurns: 3,
    },
    players: [
      {
        name: 'Alice',
        coins: 2,
        influenceCount: 2,
        deadInfluences: [] as Influences[],
        claimedInfluences: new Set<Influences>(),
        unclaimedInfluences: new Set<Influences>(),
        color: '#111111',
        ai: false,
        grudges: {},
        allegiance: otherPlayerAllegiances[0],
      },
      {
        name: 'Bob',
        coins: 2,
        influenceCount: 2,
        deadInfluences: [] as Influences[],
        claimedInfluences: new Set<Influences>(),
        unclaimedInfluences: new Set<Influences>(),
        color: '#222222',
        ai: false,
        grudges: {},
        allegiance: selfAllegiance,
      },
      {
        name: 'Cara',
        coins: 2,
        influenceCount: 2,
        deadInfluences: [] as Influences[],
        claimedInfluences: new Set<Influences>(),
        unclaimedInfluences: new Set<Influences>(),
        color: '#333333',
        ai: false,
        grudges: {},
        allegiance: otherPlayerAllegiances[1],
      },
    ],
    selfPlayer: {
      id: 'player-2',
      name: 'Bob',
      coins: 2,
      influences: [Influences.Duke, Influences.Captain],
      deadInfluences: [] as Influences[],
      claimedInfluences: new Set<Influences>(),
      unclaimedInfluences: new Set<Influences>(),
      color: '#222222',
      ai: false,
      grudges: {},
      allegiance: selfAllegiance,
    },
    pendingAction: {
      action: Actions.ForeignAid,
      claimConfirmed: false,
      pendingPlayers: new Set(['Bob', 'Cara']),
    },
  })

  it('hides Block for same-allegiance Foreign Aid in reformation while mixed allegiances remain', () => {
    render(<ChooseActionResponse />, {
      gameState: getGameState({
        selfAllegiance: Allegiances.Loyalist,
        otherPlayerAllegiances: [Allegiances.Loyalist, Allegiances.Reformist],
      }),
    })

    expect(screen.queryByRole('button', { name: 'Block' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pass' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Challenge' })).not.toBeInTheDocument()
  })

  it('shows Block for opposite-allegiance Foreign Aid in reformation', () => {
    render(<ChooseActionResponse />, {
      gameState: getGameState({
        selfAllegiance: Allegiances.Reformist,
        otherPlayerAllegiances: [Allegiances.Loyalist, Allegiances.Reformist],
      }),
    })

    expect(screen.getByRole('button', { name: 'Block' })).toBeInTheDocument()
  })

  it('shows Block when all living players share one allegiance in reformation', () => {
    render(<ChooseActionResponse />, {
      gameState: getGameState({
        selfAllegiance: Allegiances.Loyalist,
        otherPlayerAllegiances: [Allegiances.Loyalist, Allegiances.Loyalist],
      }),
    })

    expect(screen.getByRole('button', { name: 'Block' })).toBeInTheDocument()
  })
})
