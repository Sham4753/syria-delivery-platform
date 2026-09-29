import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { connectAuthEmulator } from 'firebase/auth'
import { connectFirestoreEmulator } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'
import { getStorage } from 'firebase/storage'

const env = import.meta.env
const useEmulators = env.VITE_USE_FIREBASE_EMULATORS === 'true'
const allowDemoConfig = useEmulators
const value = (key, fallback = '') => String(env[key] || fallback).trim()

const firebaseConfig = {
  apiKey: value('VITE_FIREBASE_API_KEY', allowDemoConfig ? 'demo-api-key' : ''),
  authDomain: value('VITE_FIREBASE_AUTH_DOMAIN', allowDemoConfig ? 'demo-syria-delivery.firebaseapp.com' : ''),
  projectId: value('VITE_FIREBASE_PROJECT_ID', allowDemoConfig ? 'demo-syria-delivery' : ''),
  storageBucket: value('VITE_FIREBASE_STORAGE_BUCKET', allowDemoConfig ? 'demo-syria-delivery.appspot.com' : ''),
  messagingSenderId: value('VITE_FIREBASE_MESSAGING_SENDER_ID', allowDemoConfig ? '000000000000' : ''),
  appId: value('VITE_FIREBASE_APP_ID', allowDemoConfig ? '1:000000000000:web:demo' : ''),
}

const missingKeys = Object.entries(firebaseConfig).filter(([, item]) => !item).map(([key]) => key)
export const hasFirebaseConfig = missingKeys.length === 0
export const firebaseConfigError = hasFirebaseConfig ? '' : `Missing: ${missingKeys.join(', ')}`

let app = null
let initializationError = ''
try {
  if (hasFirebaseConfig) app = initializeApp(firebaseConfig)
} catch (error) {
  initializationError = error?.message || String(error)
}

export const firebaseInitError = initializationError
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
export const functions = app ? getFunctions(app) : null
export const storage = app ? getStorage(app) : null

if (useEmulators && auth && db && functions) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}
