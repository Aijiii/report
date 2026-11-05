// ------------------------------------------------------------
// OPTIONAL: Firebase settings
//
// Leave the "YOUR_..." values as they are to run in DEMO MODE
// (reports are saved only in this browser, no backend needed).
//
// To share reports between devices, paste your Firebase web app
// config below (Firebase Console -> Project settings -> Your apps).
// These values are meant to be public. Your data is protected by the
// Firestore rules in firestore.rules.
// ------------------------------------------------------------
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const isConfigured = !Object.values(firebaseConfig).some((v) => String(v).includes("YOUR_"));

// Demo mode admin login. NOT secure: anyone can read it here.
// Only used when Firebase is not configured.
const demoAdmin = {
  email: "admin@barangay.demo",
  password: "admin123"
};

// Emergency strip at the top of every page. Change to your barangay hotline.
const HOTLINE = { text: "In an emergency, do not wait for a report.", label: "911", tel: "911" };
