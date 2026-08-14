/**
 * src/lib/firebase.ts
 * Inicialización de Firebase. Las claves se leen de variables de entorno
 * (.env local y Netlify -> Site settings -> Environment variables).
 *
 * Si no hay configuración, la app arranca en MODO LOCAL (datos en el navegador)
 * para que puedas probar todo antes de conectar tu proyecto de Firebase.
 */
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const env = import.meta.env as Record<string, string | undefined>;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: env.VITE_FIREBASE_APP_ID ?? "",
};

export const firebaseConfigured =
  Boolean(firebaseConfig.apiKey) && Boolean(firebaseConfig.projectId) && Boolean(firebaseConfig.appId);

/** Usar Cloud Functions para operaciones sensibles (recomendado en producción) */
export const useCloudFunctions = env.VITE_USE_CLOUD_FUNCTIONS === "true";
export const functionsRegion = env.VITE_FUNCTIONS_REGION || "europe-west1";

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;
let _functions: Functions | null = null;

export function fb() {
  if (!firebaseConfigured) return null;
  if (!_app) {
    _app = initializeApp(firebaseConfig);
    _auth = getAuth(_app);
    _db = getFirestore(_app);
    _storage = getStorage(_app);
    _functions = getFunctions(_app, functionsRegion);
  }
  return { app: _app!, auth: _auth!, db: _db!, storage: _storage!, functions: _functions! };
}
