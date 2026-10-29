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

const returnExports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/auth/android-oauth-return.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: returnExports, URL, URLSearchParams, Response });

// Use the real timeout boundary imported by native-social-login. Keeping the
// dependency in this VM preserves the same initialization path as the app.
const timeoutExports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/promise-timeout.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: timeoutExports, setTimeout, clearTimeout });

function setup({ build = "15", native = true, platform = "ios", providerError, providerErrors, linkError, returnState = true, accounts = ["existing", "existing"] } = {}) {
  const calls = { login: [], logout: [], link: [], signIn: [], oauth: [], exchange: [], diagnostics: [] };
  const plugin = {
    openSecureWindow: async ({ redirectUri }) => {
      const request = calls.oauth[0] ?? calls.link[0];
      const state = new URL(request.options.redirectTo).searchParams.get("native_state");
      return { redirectedUri: `${redirectUri}?native_state=${returnState ? state : "wrong"}&code=one-use-code` };
    },
    initialize: async () => {},
    logout: async (options) => { calls.logout.push(options); },
    login: async (options) => {
      calls.login.push(options);
      const failure = providerErrors?.[calls.login.length - 1] ?? providerError;
      if (failure) throw failure;
      return { result: { idToken: "provider-signed-token" } };
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, crypto: webcrypto, Uint8Array, TextEncoder, console, URL,
    window: { location: { origin: "https://contratacr.com", pathname: "/login" } },
    process: { env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "web-client", NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID: "ios-client" } },
    require: (name) => {
      if (name === "@/lib/auth/android-oauth-return") return returnExports;
      if (name === "@/lib/promise-timeout") return timeoutExports;
      if (name === "@/lib/report-client-error") return { reportClientError: (_origin, error) => calls.diagnostics.push(error.message) };
      if (name === "@/hooks/use-native-app") return { isNativeAppRuntime: () => native };
      if (name === "@capgo/capacitor-social-login") return { SocialLogin: plugin };
      if (name === "@capacitor/app") return { App: { getInfo: async () => ({ build }) } };
      if (name === "@capacitor/core") return { Capacitor: { getPlatform: () => platform } };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  let userIndex = 0;
  const supabase = { auth: {
    getUser: async () => ({ data: { user: accounts[userIndex++] ? { id: accounts[userIndex - 1] } : null }, error: null }),
    linkIdentity: async (credentials) => { calls.link.push(credentials); return { data: { url: "https://example.supabase.co/auth/v1/authorize" }, error: linkError }; },
    signInWithOAuth: async (options) => { calls.oauth.push(options); return { data: { url: "https://example.supabase.co/auth/v1/authorize" }, error: null }; },
    exchangeCodeForSession: async (code) => { calls.exchange.push(code); return { data: { session: {}, user: { id: accounts[0] } }, error: null }; },
    signOut: async () => {},
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
  await assert.rejects(api.nativeSocialLink("google", supabase), /native-social-unavailable/);
  assert.equal(calls.diagnostics.length, 1);
  assert.equal(calls.diagnostics[0], "native-social-fallback:link:google:provider-sheet:url-scheme");
  assert.equal(calls.link.length + calls.signIn.length, 0);
});

for (const platform of ["ios", "android"]) {
  test(`${platform} Google obtains a fresh nonce and Android keeps the account chooser`, async () => {
    const { api, supabase, calls } = setup({ platform });
    await api.nativeSocialSignIn("google", supabase);
    await api.nativeSocialSignIn("google", supabase);
    assert.notEqual(calls.login[0].options.nonce, calls.login[1].options.nonce);
    assert.equal(calls.logout.length, platform === "ios" ? 2 : 0);
    if (platform === "android") assert.equal(calls.login[0].options.style, "standard");
  });
  test(`${platform} provider failure never requests browser OAuth or signs into another account`, async () => {
    const { api, supabase, calls } = setup({ platform, providerError: new Error("No credentials available") });
    await assert.rejects(api.nativeSocialSignIn("google", supabase), /native-social-unavailable/);
    assert.equal(calls.signIn.length + calls.link.length, 0);
    assert.match(calls.diagnostics[0], /no-credentials$/);
  });
}
test("missing native bridge is an error, never permission to leave the app", async () => {
  const { api, supabase } = setup({ platform: "web" });
  await assert.rejects(api.nativeSocialSignIn("google", supabase), /native-social-unavailable/);
});

test("Android account reauthentication recovers once in the native chooser", async () => {
  const { api, supabase, calls } = setup({ platform: "android", providerErrors: [new Error("AccountReauthFailed"), null] });
  assert.equal(await api.nativeSocialSignIn("google", supabase), "signed-in");
  assert.equal(calls.login.length, 2);
  assert.equal(calls.logout.length, 1);
  assert.equal(calls.signIn.length, 1);
});
test("Android reauthentication retry remains bounded", async () => {
  const { api, supabase, calls } = setup({ platform: "android", providerError: new Error("AccountReauthFailed") });
  await assert.rejects(api.nativeSocialSignIn("google", supabase), /native-social-unavailable/);
  assert.equal(calls.login.length, 2);
  assert.equal(calls.signIn.length, 0);
});

for (const operation of ["sign-in", "link"]) {
  test(`Android Apple ${operation} exchanges PKCE in the original app without native Apple secrets`, async () => {
    const { api, supabase, calls } = setup({ platform: "android" });
    assert.equal(await (operation === "link" ? api.nativeSocialLink("apple", supabase) : api.nativeSocialSignIn("apple", supabase)), operation === "link" ? "linked" : "signed-in");
    assert.deepEqual(calls.exchange, ["one-use-code"]);
    assert.equal(calls.login.length + calls.signIn.length, 0);
    const request = operation === "link" ? calls.link[0] : calls.oauth[0];
    assert.equal(request.options.skipBrowserRedirect, true);
    assert.equal(new URL(request.options.redirectTo).searchParams.get("flow"), "android-apple");
  });
}
test("Android Apple rejects a return from another attempt before exchanging a code", async () => {
  const { api, supabase, calls } = setup({ platform: "android", returnState: false });
  await assert.rejects(api.nativeSocialSignIn("apple", supabase), /native-social-unavailable/);
  assert.equal(calls.exchange.length, 0);
});
test("Android Apple linking cannot change the existing account", async () => {
  const { api, supabase, calls } = setup({ platform: "android", accounts: ["existing", "other"] });
  await assert.rejects(api.nativeSocialLink("apple", supabase), /native-social-unavailable/);
  assert.equal(calls.exchange.length, 0);
});
test("Android return only accepts the exact app link and attempt state", () => {
  const state = "a".repeat(64);
  const base = `https://contratacr.com/dashboard/native-auth-return?native_state=${state}&code=once`;
  assert.equal(returnExports.readAndroidOAuthReturn(base, state), "once");
  for (const invalid of [base.replace("contratacr.com", "evil.example"), base.replace("native-auth-return", "native-auth-return/other"), `${base}#access_token=secret`, base.replace("https:", "http:")]) {
    assert.throws(() => returnExports.readAndroidOAuthReturn(invalid, state));
  }
});
test("Android browser callback only renders a fixed app handoff, without creating a session", async () => {
  const response = returnExports.androidOAuthReturnResponse(new URLSearchParams({ native_state: "a".repeat(64), code: "one-use-code", next: "https://evil.example", access_token: "must-not-leak" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("cache-control"), /no-store/);
  const html = await response.text();
  assert.match(html, /package=com.contratacr.app;end/);
  assert.match(html, /src="\/brand\/logo-primary.png"/);
  assert.match(response.headers.get("content-security-policy"), /img-src 'self'/);
  assert.doesNotMatch(html, /evil.example|must-not-leak/);
  assert.equal(returnExports.androidOAuthReturnResponse(new URLSearchParams({ code: "once", native_state: "bad" })).status, 400);
});

test("published Android build without app links cannot start the Apple browser flow", async () => {
  const { api, supabase, calls } = setup({ platform: "android", build: "14" });
  await assert.rejects(api.nativeSocialSignIn("apple", supabase), /native-apple-update-required/);
  assert.equal(calls.oauth.length + calls.exchange.length, 0);
});
test("published Android Google stays available without app links", async () => {
  const { api, supabase, calls } = setup({ platform: "android", build: "14" });
  assert.equal(await api.nativeSocialSignIn("google", supabase), "signed-in");
  assert.equal(calls.signIn.length, 1);
});
