import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { connectAuthEmulator } from 'firebase/auth'
import { connectFirestoreEmulator } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'
import { getStorage } from 'firebase/storage'

const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
const allowDemoConfig = useEmulators
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || (allowDemoConfig ? 'demo-api-key' : ''),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || (allowDemoConfig ? 'demo-syria-delivery.firebaseapp.com' : ''),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || (allowDemoConfig ? 'demo-syria-delivery' : ''),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || (allowDemoConfig ? 'demo-syria-delivery.appspot.com' : ''),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || (allowDemoConfig ? '000000000000' : ''),
  appId: import.meta.env.VITE_FIREBASE_APP_ID || (allowDemoConfig ? '1:000000000000:web:demo' : ''),
}
const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean)
const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
export const functions = app ? getFunctions(app) : null
export const storage = app ? getStorage(app) : null
if (useEmulators && auth && db && functions) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}
export { hasFirebaseConfig }
