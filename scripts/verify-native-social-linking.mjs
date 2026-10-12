import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/auth/native-social-login.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup({ native = true, providerError, linkError, accounts = ["existing", "existing"] } = {}) {
  const calls = { login: [], link: [], signIn: [], diagnostics: [] };
  const plugin = {
    initialize: async () => {},
    logout: async () => {},
    login: async (options) => {
      calls.login.push(options);
      if (providerError) throw providerError;
      return { result: { idToken: "provider-signed-token" } };
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, crypto: webcrypto, Uint8Array, TextEncoder, console,
    process: { env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "web-client", NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID: "ios-client" } },
    require: (name) => {
      if (name === "@/lib/report-client-error") return { reportClientError: (_origin, error) => calls.diagnostics.push(error.message) };
      if (name === "@/hooks/use-native-app") return { isNativeAppRuntime: () => native };
      if (name === "@capgo/capacitor-social-login") return { SocialLogin: plugin };
      if (name === "@capacitor/core") return { Capacitor: { getPlatform: () => "ios" } };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  let userIndex = 0;
  const supabase = { auth: {
    getUser: async () => ({ data: { user: accounts[userIndex++] ? { id: accounts[userIndex - 1] } : null }, error: null }),
    linkIdentity: async (credentials) => { calls.link.push(credentials); return { error: linkError }; },
    signInWithIdToken: async (credentials) => { calls.signIn.push(credentials); return { error: null }; },
  } };
  return { api: exports, calls, supabase };
}

for (const provider of ["google", "apple"]) {
  test(`native ${provider} connects to the existing account with a verified nonce`, async () => {
    const { api, supabase, calls } = setup();
    assert.equal(await api.nativeSocialLink(provider, supabase), "linked");
    assert.equal(calls.signIn.length, 0);
    assert.equal(calls.link.length, 1);
    assert.equal(calls.link[0].provider, provider);
    assert.equal(calls.link[0].token, "provider-signed-token");
    const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(calls.link[0].nonce));
    assert.equal(Buffer.from(digest).toString("hex"), calls.login[0].options.nonce);
  });
}

test("an already-owned identity rejection never falls back to sign-in", async () => {
  const error = new Error("identity_already_exists");
  const { api, supabase, calls } = setup({ linkError: error });
  await assert.rejects(api.nativeSocialLink("google", supabase), (actual) => actual === error);
  assert.equal(calls.signIn.length, 0);
});

test("cancelling the native sheet leaves the account unchanged", async () => {
  const { api, supabase, calls } = setup({ providerError: new Error("user cancelled") });
  assert.equal(await api.nativeSocialLink("google", supabase), "cancelled");
  assert.equal(calls.link.length + calls.signIn.length, 0);
});

test("a session change while the provider sheet is open prevents linking", async () => {
  const { api, supabase, calls } = setup({ accounts: ["existing", "another-account"] });
  await assert.rejects(api.nativeSocialLink("google", supabase), /account changed/);
  assert.equal(calls.link.length + calls.signIn.length, 0);
});

test("logged-out visitors cannot connect a provider", async () => {
  const { api, supabase, calls } = setup({ accounts: [null] });
  await assert.rejects(api.nativeSocialLink("google", supabase), /Sign in before linking/);
  assert.equal(calls.login.length + calls.link.length + calls.signIn.length, 0);
});

test("regular native login still signs in without linking", async () => {
  const { api, supabase, calls } = setup();
  assert.equal(await api.nativeSocialSignIn("google", supabase), "signed-in");
  assert.equal(calls.signIn.length, 1);
  assert.equal(calls.link.length, 0);
});

test("the website leaves linking to its existing web OAuth flow", async () => {
  const { api, supabase, calls } = setup({ native: false });
  assert.equal(await api.nativeSocialLink("google", supabase), "unavailable");
  assert.equal(calls.login.length + calls.link.length + calls.signIn.length, 0);
});


test("native fallback reports a fixed reason without leaking provider data", async () => {
  const { api, supabase, calls } = setup({ providerError: new Error("Missing URL scheme private-token-example user@example.com") });
  assert.equal(await api.nativeSocialLink("google", supabase), "unavailable");
  assert.equal(calls.diagnostics.length, 1);
  assert.equal(calls.diagnostics[0], "native-social-fallback:link:google:provider-sheet:url-scheme");
  assert.equal(calls.link.length + calls.signIn.length, 0);
});
