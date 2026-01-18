// Firebase SDK imports
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// TODO: Replace with your actual Firebase project configuration
// Firebase Console > Project Settings > General > Your apps > SDK setup
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "ejtunes.web.app",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://ejtunes-prod-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ejtunes-music",
  storageBucket: "ejtunes-music.firebasestorage.app",
  messagingSenderId: "797159646057",
  appId: "1:797159646057:web:2fd8f79e11955d64fed3f8",
  measurementId: "G-ER4Y5PTNXS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Realtime Database (NOT Firestore)
export const db = getDatabase(app);

if (firebaseConfig.databaseURL.includes('ejtunes-prod-rtdb')) {
  console.warn('%c⚠️ WARNING: Connected to PRODUCTION Database!', 'background: red; color: white; font-size: 16px; padding: 4px; font-weight: bold;');
} else {
  console.log('%c✅ Connected to DEVELOPMENT Database', 'background: green; color: white; padding: 4px;');
}

// Auth
export const auth = getAuth(app);
auth.languageCode = 'ko';
export const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  hl: 'ko'
});

export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
