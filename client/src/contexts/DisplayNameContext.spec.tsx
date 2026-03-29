import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DisplayNameContextProvider } from './DisplayNameContext'
import { useDisplayName } from '../hooks/useDisplayName'

const mockAuthState = {
  user: {
    uid: 'user-1',
    displayName: null,
    photoURL: null,
    email: null,
    getIdToken: vi.fn(async () => 'token-1'),
  },
  isLocalAuth: false,
}

vi.mock('./AuthContext', () => ({
  useAuthContext: () => mockAuthState,
}))

function DisplayNameViewer({ testId }: { testId: string }) {
  const { displayName } = useDisplayName()
  return <div data-testid={testId}>{displayName ?? 'empty'}</div>
}

function SaveDisplayNameButton() {
  const { saveDisplayName } = useDisplayName()

  return (
    <button onClick={() => { void saveDisplayName('Alice') }}>
      Save
    </button>
  )
}

describe('DisplayNameContextProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
    mockAuthState.user.getIdToken.mockResolvedValue('token-1')
  })

  it('shares updated display name across consumers without remounting', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        json: async () => ({ displayName: null }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ displayName: 'Alice' }),
      } as Response)

    render(
      <DisplayNameContextProvider>
        <DisplayNameViewer testId="viewer-a" />
        <DisplayNameViewer testId="viewer-b" />
        <SaveDisplayNameButton />
      </DisplayNameContextProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('viewer-a')).toHaveTextContent('empty')
      expect(screen.getByTestId('viewer-b')).toHaveTextContent('empty')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.getByTestId('viewer-a')).toHaveTextContent('Alice')
      expect(screen.getByTestId('viewer-b')).toHaveTextContent('Alice')
    })

    expect(global.fetch).toHaveBeenNthCalledWith(1, expect.stringContaining('/api/users/user-1/displayName'))
    expect(global.fetch).toHaveBeenNthCalledWith(2, expect.stringContaining('/api/users/displayName'), expect.objectContaining({
      method: 'PUT',
    }))
  })
})
