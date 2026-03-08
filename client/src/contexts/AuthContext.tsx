import {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react'
import {
  User as FirebaseUser,
  AuthProvider,
  OAuthCredential,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  linkWithCredential,
  OAuthProvider,
  deleteUser,
} from 'firebase/auth'
import { FirebaseError } from 'firebase/app'
import { auth, googleProvider, githubProvider } from '../firebase'
import { getBaseUrl } from '../helpers/api'
import { getOrCreateLocalAuthProfile, resetLocalAuthProfile } from '../helpers/localAuth'
import { isLocalAuthEnabled } from '../helpers/api'

type SignInResult = { linked: boolean }
export type AppUser = Pick<FirebaseUser, 'uid' | 'displayName' | 'photoURL' | 'email' | 'getIdToken'>

type AuthContextType = {
  user: AppUser | null
  loading: boolean
  isLocalAuth: boolean
  signInWithGoogle: () => Promise<SignInResult>
  signInWithGitHub: () => Promise<SignInResult>
  signOut: () => Promise<void>
  deleteAccount: () => Promise<void>
  getIdToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isLocalAuth: false,
  signInWithGoogle: async () => ({ linked: false }),
  signInWithGitHub: async () => ({ linked: false }),
  signOut: async () => { },
  deleteAccount: async () => { },
  getIdToken: async () => null,
})

export function AuthContextProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const localAuthEnabled = isLocalAuthEnabled()

  const getLocalUser = useCallback((): AppUser => {
    const profile = getOrCreateLocalAuthProfile()
    return {
      uid: profile.uid,
      displayName: profile.displayName,
      photoURL: null,
      email: null,
      getIdToken: async () => profile.token,
    }
  }, [])

  useEffect(() => {
    if (localAuthEnabled) {
      setUser(getLocalUser())
      setLoading(false)
      return
    }

    if (!auth) {
      setLoading(false)
      return
    }
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
    })
    return unsubscribe
  }, [getLocalUser, localAuthEnabled])

  const pendingCredential = useRef<OAuthCredential | null>(null)

  const signInAndLink = useCallback(async (provider: AuthProvider): Promise<SignInResult> => {
    if (localAuthEnabled) return { linked: false }
    if (!auth) throw new Error('Firebase auth is not configured')
    try {
      const result = await signInWithPopup(auth, provider)
      if (pendingCredential.current) {
        try {
          await linkWithCredential(result.user, pendingCredential.current)
          pendingCredential.current = null
          return { linked: true }
        } catch (linkError) {
          console.error('Failed to link credential:', linkError)
          pendingCredential.current = null
        }
      }
      return { linked: false }
    } catch (error) {
      if (error instanceof FirebaseError && error.code === 'auth/account-exists-with-different-credential') {
        const credential = OAuthProvider.credentialFromError(error)
        if (credential) {
          pendingCredential.current = credential
        }
      }
      throw error
    }
  }, [localAuthEnabled])

  const signInWithGoogle = useCallback(() => signInAndLink(googleProvider), [signInAndLink])
  const signInWithGitHub = useCallback(() => signInAndLink(githubProvider), [signInAndLink])

  const signOut = useCallback(async () => {
    if (localAuthEnabled) {
      resetLocalAuthProfile()
      setUser(getLocalUser())
      return
    }
    if (!auth) return
    await firebaseSignOut(auth)
  }, [getLocalUser, localAuthEnabled])

  const deleteAccount = useCallback(async () => {
    if (localAuthEnabled) {
      resetLocalAuthProfile()
      setUser(getLocalUser())
      return
    }

    const currentUser = auth?.currentUser
    if (!currentUser) return

    const token = await currentUser.getIdToken()
    const response = await fetch(`${getBaseUrl()}/api/users/account`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      throw new Error('Failed to delete account')
    }

    try {
      await deleteUser(currentUser)
    } catch {
      // Server already deleted the Firebase auth user, so this may fail — that's fine
    }

    setUser(null)
  }, [getLocalUser, localAuthEnabled])

  const getIdToken = useCallback(async () => {
    if (localAuthEnabled) {
      return user?.getIdToken() ?? null
    }
    if (!auth?.currentUser) return null
    return auth.currentUser.getIdToken()
  }, [localAuthEnabled, user])

  const value = useMemo(() => ({
    user,
    loading,
    isLocalAuth: localAuthEnabled,
    signInWithGoogle,
    signInWithGitHub,
    signOut,
    deleteAccount,
    getIdToken,
  }), [user, loading, localAuthEnabled, signInWithGoogle, signInWithGitHub, signOut, deleteAccount, getIdToken])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuthContext = () => useContext(AuthContext)
