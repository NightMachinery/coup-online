import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CreateGame from './CreateGame'

const mockNavigate = vi.fn()
const mockTrigger = vi.fn()
const mockSaveDisplayName = vi.fn()

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
  default: () => ({
    trigger: mockTrigger,
    isMutating: false,
  }),
}))

vi.mock('../../contexts/TranslationsContext', () => ({
  useTranslationContext: () => ({ t: (key: string) => key }),
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

vi.mock('../../hooks/usePersistedState', () => ({
  usePersistedState: <T,>(_: string, initialValue: T) => [initialValue, vi.fn()] as const,
}))

vi.mock('../../helpers/players', () => ({
  getPlayerId: () => 'player-1',
}))

describe('CreateGame', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves the typed name before creating the game for signed-in users without a saved profile name', async () => {
    const callOrder: string[] = []
    mockSaveDisplayName.mockImplementation(async () => {
      callOrder.push('save')
      return { success: true }
    })
    mockTrigger.mockImplementation(() => {
      callOrder.push('trigger')
    })

    render(
      <MemoryRouter>
        <CreateGame />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByTestId('playerNameInput'), { target: { value: 'Alice' } })
    fireEvent.click(screen.getByRole('button', { name: 'createGame' }))

    await waitFor(() => {
      expect(mockSaveDisplayName).toHaveBeenCalledWith('Alice')
      expect(mockTrigger).toHaveBeenCalledWith(expect.objectContaining({
        playerId: 'player-1',
        playerName: 'Alice',
        uid: 'user-1',
        photoURL: 'photo.png',
      }))
    })

    expect(callOrder).toEqual(['save', 'trigger'])
  })
})
