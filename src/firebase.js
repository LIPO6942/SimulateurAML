// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCH7Am76Pit5KDosIK8qSDJRm9r3wIF2Yw",
  authDomain: "simulateur-aml.firebaseapp.com",
  projectId: "simulateur-aml",
  storageBucket: "simulateur-aml.firebasestorage.app",
  messagingSenderId: "355107034345",
  appId: "1:355107034345:web:62ecbe3731c4e332894c78",
  measurementId: "G-LBRQCQ00JX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
