import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth, Auth } from 'firebase-admin/auth'
import { getFirestore, Firestore } from 'firebase-admin/firestore'

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
  : undefined

export const firebaseConfigured = Boolean(
  serviceAccount
  || process.env.FIREBASE_PROJECT_ID
)

if (firebaseConfigured && !getApps().length) {
  initializeApp({
    ...(serviceAccount && { credential: cert(serviceAccount) }),
    projectId: process.env.FIREBASE_PROJECT_ID,
  })
}

export const adminAuth: Auth | null = firebaseConfigured ? getAuth() : null
export const firestore: Firestore | null = firebaseConfigured ? getFirestore() : null
