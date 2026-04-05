import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import GameBoard from './GameBoard'
import { MaterialThemeContextProvider } from '../../contexts/MaterialThemeContext'

const mockGameState = {
  roomId: 'ROOM1',
  deckCount: 6,
  players: [
    { name: 'Alice', influenceCount: 2, deadInfluences: [], ai: false, coins: 2, color: '#111111' },
    { name: 'Bob', influenceCount: 2, deadInfluences: [], ai: false, coins: 2, color: '#222222' },
    { name: 'Cara', influenceCount: 2, deadInfluences: [], ai: false, coins: 2, color: '#333333' },
    { name: 'Dan', influenceCount: 2, deadInfluences: [], ai: false, coins: 2, color: '#444444' },
    { name: 'Eli', influenceCount: 2, deadInfluences: [], ai: false, coins: 2, color: '#555555' },
    { name: 'Fran', influenceCount: 2, deadInfluences: [], ai: false, coins: 2, color: '#666666' },
    { name: 'Gus', influenceCount: 2, deadInfluences: [], ai: false, coins: 2, color: '#777777' },
  ],
  selfPlayer: {
    name: 'Alice',
    influences: [],
  },
  settings: {
    allowRevive: false,
    allowContessaBlockExamine: false,
    enableInquisitor: true,
    enableReformation: false,
    eventLogRetentionTurns: 3,
  },
  isStarted: true,
  selfIsCreator: false,
  pendingInfluenceLoss: {},
  treasuryReserveCoins: 0,
  turn: 1,
  turnPlayer: 'Alice',
  eventLogs: [],
  chatMessages: [],
  lastEventTimestamp: new Date(),
}

vi.mock('../game/PlayerInfluences', () => ({
  default: () => <div>PlayerInfluences</div>,
}))

vi.mock('../game/Players', () => ({
  default: () => <div>Players</div>,
}))

vi.mock('./EventLog', () => ({
  default: () => <div>EventLog</div>,
}))

vi.mock('./RequestReset', () => ({
  default: () => <div>RequestReset</div>,
}))

vi.mock('./PlayerDecision', () => ({
  default: () => <div>PlayerDecision</div>,
}))

vi.mock('./SnarkyDeadComment', () => ({
  default: () => <div>SnarkyDeadComment</div>,
}))

vi.mock('./Victory', () => ({
  default: () => <div>Victory</div>,
}))

vi.mock('./PlayAgain', () => ({
  default: () => <div>PlayAgain</div>,
}))

vi.mock('./Forfeit', () => ({
  default: () => <div>Forfeit</div>,
}))

vi.mock('./EndGamePlayerCards', () => ({
  default: () => <div>EndGamePlayerCards</div>,
}))

vi.mock('../../contexts/GameStateContext', () => ({
  useGameStateContext: () => ({ gameState: mockGameState }),
}))

vi.mock('../../contexts/TranslationsContext', () => ({
  useTranslationContext: () => ({
    t: (key: string, variables?: { count?: number }) => {
      if (key === 'countOfEachCardType') {
        return `${variables?.count} of each card type`
      }

      if (key === 'cardCountInDeck') {
        return `${variables?.count} cards in the deck`
      }

      return key
    }
  }),
}))

describe('GameBoard', () => {
  it('shows inquisitor room influence counts in the sidebar', () => {
    render(
      <MaterialThemeContextProvider>
        <GameBoard leftDrawerOpen={false} rightDrawerOpen={false} />
      </MaterialThemeContextProvider>
    )

    expect(screen.getByText('4 of each card type')).toBeInTheDocument()
    expect(screen.getByText('Inquisitor ×4')).toBeInTheDocument()
    expect(screen.queryByText('Ambassador ×4')).not.toBeInTheDocument()
  })
})
