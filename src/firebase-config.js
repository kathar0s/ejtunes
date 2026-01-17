// Firebase SDK imports
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// TODO: Replace with your actual Firebase project configuration
// Firebase Console > Project Settings > General > Your apps > SDK setup
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "ejtune.firebaseapp.com",
  databaseURL: "https://ejtune-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ejtune",
  storageBucket: "ejtune.firebasestorage.app",
  messagingSenderId: "663588705370",
  appId: "1:663588705370:web:0690d6ba98cf618aec3463",
  measurementId: ""
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Realtime Database (NOT Firestore)
export const db = getDatabase(app);

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
