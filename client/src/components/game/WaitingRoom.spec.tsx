import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import WaitingRoom from './WaitingRoom'

const mockGameState = {
  roomId: 'ROOM1',
  players: [
    { name: 'Alice', influenceCount: 2, ai: false },
    { name: 'Bob', influenceCount: 2, ai: false },
  ],
  selfPlayer: { name: 'Alice' },
  selfIsCreator: true,
  creatorDisplayName: 'Alice',
  settings: {
    allowRevive: true,
    allowContessaBlockExamine: true,
    enableInquisitor: true,
    enableReformation: true,
    eventLogRetentionTurns: 3,
    speedRoundSeconds: 15,
  },
}

vi.mock('../game/Players', () => ({
  default: () => <div>Players</div>,
}))

vi.mock('./AddAiPlayer', () => ({
  default: () => <div>AddAiPlayer</div>,
}))

vi.mock('qrcode.react', () => ({
  QRCodeSVG: () => <div>QRCode</div>,
}))

vi.mock('../../contexts/GameStateContext', () => ({
  useGameStateContext: () => ({ gameState: mockGameState }),
}))

vi.mock('../../contexts/TranslationsContext', () => ({
  useTranslationContext: () => ({ t: (key: string) => key }),
}))

vi.mock('../../contexts/NotificationsContext', () => ({
  useNotificationsContext: () => ({ showNotification: vi.fn() }),
}))

vi.mock('../../hooks/useGameMutation', () => ({
  default: () => ({ trigger: vi.fn(), isMutating: false }),
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

vi.mock('../../helpers/players', () => ({
  getPlayerId: () => 'player-1',
}))

describe('WaitingRoom', () => {
  it('shows explanatory summaries for enabled rules variants', () => {
    render(<WaitingRoom />)

    expect(screen.getByText('reviveSummary')).toBeInTheDocument()
    expect(screen.getByText('reformationSummary')).toBeInTheDocument()
    expect(screen.getByText('inquisitorSummary')).toBeInTheDocument()
    expect(screen.getByText('contessaBlockExamineSummary')).toBeInTheDocument()
    expect(screen.getByText(/speedRoundSeconds/)).toBeInTheDocument()
  })
})
