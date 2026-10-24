import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

const FIREBASE_PUSH_APP_NAME = "contratacr-push";

function firebasePrivateKey() {
  const raw = process.env.FIREBASE_PRIVATE_KEY ?? process.env.FCM_PRIVATE_KEY;
  return raw?.replace(/\\n/g, "\n");
}

function getFirebasePushApp() {
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

  return app;
}

/** OAuth-only readiness check: never reads recipients or sends notifications. */
export async function verifyFirebasePushCredentials() {
  const credential = getFirebasePushApp().options.credential;
  if (!credential) throw new Error("Missing Firebase Admin credential.");
  const token = await credential.getAccessToken();
  if (!token.access_token || token.expires_in <= 0) {
    throw new Error("Firebase Admin credential did not return a usable token.");
  }
}

export function getFirebaseMessaging() {
  const messaging = getMessaging(getFirebasePushApp());
  // Firebase multicast defaults to node:http2. Workers exposes that module as
  // a stub: http2.connect throws before Firebase can deliver anything. This
  // selects HTTP/1.1 for the current FCM HTTP v1 API, not the retired FCM API.
  messaging.enableLegacyHttpTransport();
  return messaging;
}
