import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

function firebasePrivateKey() {
  const raw = process.env.FIREBASE_PRIVATE_KEY ?? process.env.FCM_PRIVATE_KEY;
  return raw?.replace(/\\n/g, "\n");
}

export function getFirebaseMessaging() {
  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL ?? process.env.FCM_CLIENT_EMAIL;
  const privateKey = firebasePrivateKey();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase Admin credentials.");
  }

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });

  return getMessaging(app);
}
