import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import JoinGame from './JoinGame'
import { PlayerActions } from '@shared'

const mockNavigate = vi.fn()
const mockJoinTrigger = vi.fn()
const mockSpectateTrigger = vi.fn()
const mockSaveDisplayName = vi.fn()

const mockGameStateContext = {
  gameState: {
    roomId: 'ROOM1',
    isStarted: false,
  },
  hasInitialStateLoaded: true,
}

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../hooks/useDisplayName', () => ({
  useDisplayName: () => ({
    displayName: null,
    loading: false,
    saveDisplayName: mockSaveDisplayName,
    setDisplayName: vi.fn(),
  }),
}))

vi.mock('../../hooks/useGameMutation', () => ({
  default: ({ action }: { action: PlayerActions }) => ({
    trigger: action === PlayerActions.joinGame ? mockJoinTrigger : mockSpectateTrigger,
    isMutating: false,
  }),
}))

vi.mock('../../contexts/TranslationsContext', () => ({
  useTranslationContext: () => ({ t: (key: string) => key }),
}))

vi.mock('../../contexts/GameStateContext', () => ({
  useGameStateContext: () => mockGameStateContext,
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuthContext: () => ({
    user: {
      uid: 'user-1',
      photoURL: 'photo.png',
    },
    isLocalAuth: false,
  }),
}))

vi.mock('../../helpers/players', () => ({
  getPlayerId: () => 'player-1',
}))

describe('JoinGame', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(HTMLFormElement.prototype, 'checkValidity').mockReturnValue(true)
    vi.spyOn(HTMLFormElement.prototype, 'reportValidity').mockReturnValue(true)
    mockGameStateContext.gameState = {
      roomId: 'ROOM1',
      isStarted: false,
    }
  })

  it('saves the typed name before joining the game for signed-in users without a saved profile name', async () => {
    const user = userEvent.setup()
    const callOrder: string[] = []
    mockSaveDisplayName.mockImplementation(async () => {
      callOrder.push('save')
      return { success: true }
    })
    mockJoinTrigger.mockImplementation(() => {
      callOrder.push('trigger')
    })

    render(
      <MemoryRouter initialEntries={['/join-game?roomId=ROOM1']}>
        <JoinGame />
      </MemoryRouter>
    )

    await user.type(screen.getByTestId('playerNameInput'), 'Alice')
    await user.click(screen.getByRole('button', { name: 'joinGame' }))

    await waitFor(() => {
      expect(mockSaveDisplayName).toHaveBeenCalledWith('Alice')
      expect(mockJoinTrigger).toHaveBeenCalledWith({
        roomId: 'ROOM1',
        playerId: 'player-1',
        playerName: 'Alice',
        uid: 'user-1',
        photoURL: 'photo.png',
      })
    })

    expect(callOrder).toEqual(['save', 'trigger'])
  })

  it('blocks spectating and shows the save error when profile-name save fails', async () => {
    const user = userEvent.setup()
    mockGameStateContext.gameState = {
      roomId: 'ROOM1',
      isStarted: true,
    }
    mockSaveDisplayName.mockResolvedValue({
      success: false,
      error: 'displayNameTaken',
    })

    render(
      <MemoryRouter initialEntries={['/join-game?roomId=ROOM1']}>
        <JoinGame />
      </MemoryRouter>
    )

    await user.type(screen.getByTestId('playerNameInput'), 'Alice')
    await user.click(screen.getByRole('button', { name: 'spectateGame' }))

    await waitFor(() => {
      expect(mockSaveDisplayName).toHaveBeenCalledWith('Alice')
      expect(mockSpectateTrigger).not.toHaveBeenCalled()
      expect(screen.getByText('displayNameTaken')).toBeInTheDocument()
    })
  })
})
