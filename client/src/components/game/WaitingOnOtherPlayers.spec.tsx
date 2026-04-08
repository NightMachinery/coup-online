import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Actions, Influences, PublicGameState } from '@shared'
import { render } from '../../../tests/utilities/render'
import WaitingOnOtherPlayers from './WaitingOnOtherPlayers'

vi.mock('../../contexts/TranslationsContext', () => ({
  useTranslationContext: () => ({
    t: (key: string, variables?: { players?: string }) =>
      key === 'waitingOnPlayersNamed'
        ? `Waiting on: ${variables?.players}`
        : key,
  }),
}))

describe('WaitingOnOtherPlayers', () => {
  it('shows pending player names for spectators', () => {
    const gameState: PublicGameState = {
      roomId: 'ROOM1',
      deckCount: 7,
      eventLogs: [],
      chatMessages: [],
      lastEventTimestamp: new Date(),
      turn: 1,
      turnPlayer: 'Alice',
      isStarted: true,
      selfIsCreator: false,
      selfIsModerator: false,
      connectedLobbyAuthorityPresent: false,
      treasuryReserveCoins: 0,
      pendingInfluenceLoss: {},
      settings: {
        allowRevive: true,
        allowContessaBlockExamine: false,
        enableInquisitor: false,
        enableReformation: false,
        eventLogRetentionTurns: 3,
      },
      players: [
        {
          name: 'Alice',
          coins: 2,
          influenceCount: 2,
          isModerator: false,
          deadInfluences: [] as Influences[],
          claimedInfluences: new Set<Influences>(),
          unclaimedInfluences: new Set<Influences>(),
          color: '#111111',
          ai: false,
          grudges: {},
        },
        {
          name: 'Bob',
          coins: 2,
          influenceCount: 2,
          isModerator: false,
          deadInfluences: [] as Influences[],
          claimedInfluences: new Set<Influences>(),
          unclaimedInfluences: new Set<Influences>(),
          color: '#222222',
          ai: false,
          grudges: {},
        },
        {
          name: 'Cara',
          coins: 2,
          influenceCount: 2,
          isModerator: false,
          deadInfluences: [] as Influences[],
          claimedInfluences: new Set<Influences>(),
          unclaimedInfluences: new Set<Influences>(),
          color: '#333333',
          ai: false,
          grudges: {},
        },
      ],
      pendingAction: {
        action: Actions.ForeignAid,
        claimConfirmed: false,
        pendingPlayers: new Set(['Bob', 'Cara']),
      },
    }

    render(<WaitingOnOtherPlayers />, { gameState })

    expect(screen.getByText('waitingOnOtherPlayers')).toBeInTheDocument()
    expect(screen.getByText('Waiting on: Bob, Cara')).toBeInTheDocument()
  })
})
