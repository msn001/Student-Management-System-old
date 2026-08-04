import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "gen-lang-client-0396790868",
  appId: "1:323581180173:web:28cd29e99114129fb11844",
  apiKey: "AIzaSyBEt9j6PeAw5gKq7-AIcFVf4bfGbbS9KIQ",
  authDomain: "gen-lang-client-0396790868.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-lessonregister-af576a67-cb60-45c9-962f-11eadf9f6017",
  storageBucket: "gen-lang-client-0396790868.firebasestorage.app",
  messagingSenderId: "323581180173",
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
