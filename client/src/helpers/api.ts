import { PlayerActions } from '@shared'

const getDefaultOrigin = () =>
  typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8008'

export const getBaseUrl = () =>
  import.meta.env.VITE_API_BASE_URL ?? getDefaultOrigin()

export const getSocketBaseUrl = () =>
  import.meta.env.VITE_SOCKET_SERVER_URL ?? getDefaultOrigin()

export const getGameActionUrl = (action: PlayerActions) =>
  `${getBaseUrl()}/api/game/${action}`

export const isLocalAuthEnabled = () =>
  import.meta.env.VITE_AUTH_MODE === 'local'
