import type { Credential } from "firebase-admin/app";
import { JWT } from "google-auth-library";

/** Keep Google's signing/token handling, but use Workers' native fetch instead
 * of the Node HTTP implementation bundled by google-auth-library. */
export function createFirebasePushCredential(
  clientEmail: string,
  privateKey: string,
  fetchImplementation = globalThis.fetch,
): Credential {
  const client = new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    transporterOptions: {
      fetchImplementation,
      timeout: 15_000,
    },
  });
  return {
    async getAccessToken() {
      const result = await client.getAccessToken();
      const expiresAt = client.credentials.expiry_date;
      if (!result.token || !expiresAt || expiresAt <= Date.now()) {
        throw new Error("Firebase OAuth did not return a usable access token.");
      }
      return {
        access_token: result.token,
        expires_in: Math.floor((expiresAt - Date.now()) / 1_000),
      };
    },
  };
}
