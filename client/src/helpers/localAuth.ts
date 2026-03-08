import { localAuthProfileStorageKey } from './localStorageKeys'
import { generateUUID } from './uuid'

export type LocalAuthProfile = {
  token: string
  uid: string
  displayName: string | null
}

const sanitizeDisplayName = (displayName: string | null | undefined): string | null => {
  const trimmed = displayName?.trim().slice(0, 10)
  return trimmed ? trimmed : null
}

const createLocalAuthProfile = (): LocalAuthProfile => ({
  token: generateUUID(),
  uid: `local-${generateUUID()}`,
  displayName: null,
})

const isValidProfile = (profile: unknown): profile is LocalAuthProfile => {
  if (!profile || typeof profile !== 'object') return false

  const candidate = profile as Partial<LocalAuthProfile>
  return typeof candidate.token === 'string'
    && typeof candidate.uid === 'string'
    && (typeof candidate.displayName === 'string' || candidate.displayName === null || typeof candidate.displayName === 'undefined')
}

export const readLocalAuthProfile = (): LocalAuthProfile | null => {
  const raw = localStorage.getItem(localAuthProfileStorageKey)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (!isValidProfile(parsed)) return null

    return {
      token: parsed.token,
      uid: parsed.uid,
      displayName: sanitizeDisplayName(parsed.displayName),
    }
  } catch {
    return null
  }
}

export const writeLocalAuthProfile = (profile: LocalAuthProfile): LocalAuthProfile => {
  const normalized: LocalAuthProfile = {
    token: profile.token,
    uid: profile.uid,
    displayName: sanitizeDisplayName(profile.displayName),
  }
  localStorage.setItem(localAuthProfileStorageKey, JSON.stringify(normalized))
  return normalized
}

export const getOrCreateLocalAuthProfile = (): LocalAuthProfile => {
  const existingProfile = readLocalAuthProfile()
  if (existingProfile) {
    return writeLocalAuthProfile(existingProfile)
  }

  return writeLocalAuthProfile(createLocalAuthProfile())
}

export const saveLocalAuthDisplayName = (displayName: string): LocalAuthProfile => {
  const profile = getOrCreateLocalAuthProfile()
  return writeLocalAuthProfile({
    ...profile,
    displayName,
  })
}

export const resetLocalAuthProfile = (): LocalAuthProfile =>
  writeLocalAuthProfile(createLocalAuthProfile())
