import { createContext, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuthContext } from './AuthContext'
import { getBaseUrl } from '../helpers/api'
import { readLocalAuthProfile, saveLocalAuthDisplayName } from '../helpers/localAuth'
import { guestDisplayNameStorageKey } from '../helpers/localStorageKeys'

const sanitizeDisplayName = (name: string | null | undefined) => {
  const trimmed = name?.trim().slice(0, 10)
  return trimmed ? trimmed : null
}

const readGuestDisplayName = () => sanitizeDisplayName(localStorage.getItem(guestDisplayNameStorageKey))

const writeGuestDisplayName = (name: string) => {
  const trimmed = sanitizeDisplayName(name)
  if (trimmed) {
    localStorage.setItem(guestDisplayNameStorageKey, trimmed)
  } else {
    localStorage.removeItem(guestDisplayNameStorageKey)
  }
  return trimmed
}

type DisplayNameContextType = {
  displayName: string | null
  loading: boolean
  saveDisplayName: (name: string) => Promise<{ success: boolean; error?: string }>
  setDisplayName: React.Dispatch<React.SetStateAction<string | null>>
}

export const DisplayNameContext = createContext<DisplayNameContextType>({
  displayName: null,
  loading: false,
  saveDisplayName: async () => ({ success: false, error: 'DisplayNameContextProviderMissing' }),
  setDisplayName: () => { },
})

export function DisplayNameContextProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { user, isLocalAuth } = useAuthContext()
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestIdRef.current

    if (!user?.uid) {
      setDisplayName(readGuestDisplayName())
      setLoading(false)
      return
    }

    if (isLocalAuth) {
      setDisplayName(readLocalAuthProfile()?.displayName ?? null)
      setLoading(false)
      return
    }

    setLoading(true)
    fetch(`${getBaseUrl()}/api/users/${user.uid}/displayName`)
      .then((res) => res.json())
      .then((data) => {
        if (requestId === requestIdRef.current) {
          setDisplayName(data.displayName ?? null)
        }
      })
      .catch(() => {
        if (requestId === requestIdRef.current) {
          setDisplayName(null)
        }
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          setLoading(false)
        }
      })
  }, [isLocalAuth, user?.uid])

  const saveDisplayName = useCallback(async (name: string): Promise<{ success: boolean; error?: string }> => {
    if (!user) {
      setDisplayName(writeGuestDisplayName(name))
      return { success: true }
    }

    if (isLocalAuth) {
      const profile = saveLocalAuthDisplayName(name)
      setDisplayName(profile.displayName)
      return { success: true }
    }

    try {
      const token = await user.getIdToken()
      const res = await fetch(`${getBaseUrl()}/api/users/displayName`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          displayName: name,
          ...(user.photoURL && { photoURL: user.photoURL }),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        return { success: false, error: data.error }
      }

      const data = await res.json()
      requestIdRef.current += 1
      setDisplayName(data.displayName)
      setLoading(false)
      return { success: true }
    } catch {
      return { success: false, error: 'Failed to save display name' }
    }
  }, [isLocalAuth, user])

  const value = useMemo(() => ({
    displayName,
    loading,
    saveDisplayName,
    setDisplayName,
  }), [displayName, loading, saveDisplayName])

  return (
    <DisplayNameContext.Provider value={value}>
      {children}
    </DisplayNameContext.Provider>
  )
}
