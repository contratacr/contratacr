import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

const FIREBASE_PUSH_APP_NAME = "contratacr-push";

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
    getApps().find((candidate) => candidate.name === FIREBASE_PUSH_APP_NAME) ??
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    }, FIREBASE_PUSH_APP_NAME);

  return getMessaging(app);
}
