import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAlZxxA7lVTgCrNtMEX9EMRR1oi0J9IWnc",
  authDomain: "logs-4dcc8.firebaseapp.com",
  projectId: "logs-4dcc8",
  storageBucket: "logs-4dcc8.firebasestorage.app",
  messagingSenderId: "192107182232",
  appId: "1:192107182232:web:5ec34a10bcc3be4066b8ed",
  measurementId: "G-0ZR9Z97CXE"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
