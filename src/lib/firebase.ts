import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0396790868',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:323581180173:web:28cd29e99114129fb11844',
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBEt9j6PeAw5gKq7-AIcFVf4bfGbbS9KIQ',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'gen-lang-client-0396790868.firebaseapp.com',
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || 'ai-studio-lessonregister-af576a67-cb60-45c9-962f-11eadf9f6017',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'gen-lang-client-0396790868.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '323581180173',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export const auth = getAuth(app);
