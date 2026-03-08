/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_SOCKET_SERVER_URL?: string
  readonly VITE_SOCKET_SERVER_PATH?: string
  readonly VITE_DISABLE_TRANSITIONS?: string
  readonly VITE_AUTH_MODE?: string
  readonly VITE_PUBLIC_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
