import { useEffect, useState } from 'react'
import { useAuthContext } from '../contexts/AuthContext'
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

export function useDisplayName() {
  const { user, isLocalAuth } = useAuthContext()
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
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
        setDisplayName(data.displayName ?? null)
      })
      .catch(() => {
        setDisplayName(null)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [isLocalAuth, user?.uid])

  const saveDisplayName = async (name: string): Promise<{ success: boolean; error?: string }> => {
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
      setDisplayName(data.displayName)
      return { success: true }
    } catch {
      return { success: false, error: 'Failed to save display name' }
    }
  }

  return { displayName, loading, saveDisplayName, setDisplayName }
}
