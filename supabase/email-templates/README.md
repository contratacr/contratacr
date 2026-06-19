# ContrataCR — branded Supabase auth email templates

Paste each file's HTML into **Supabase Dashboard → Authentication → Email Templates → [template]**, then **Save**.

| File | Supabase template | Required variable(s) |
|------|-------------------|----------------------|
| `confirm-signup.html` | **Confirm signup** | `{{ .Token }}` (6-digit code) |
| `invite-user.html` | **Invite user** | `{{ .ConfirmationURL }}` |
| `magic-link.html` | **Magic Link** | `{{ .ConfirmationURL }}` |
| `change-email.html` | **Change Email Address** | `{{ .SiteURL }}`, `{{ .TokenHash }}`, `{{ .Email }}`, `{{ .NewEmail }}` |
| `reset-password.html` | **Reset Password** | `{{ .ConfirmationURL }}` |
| `reauthentication.html` | **Reauthentication** | `{{ .Token }}` (6-digit code) |

## Notes
- **Change Email uses the `token_hash` flow — a SELF-BUILT link, NOT `{{ .ConfirmationURL }}`.** The button/link points to **`{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email_change`**, which `/auth/callback` finalizes with `verifyOtp({ type: "email_change", token_hash })` (`route.ts`). Why not `{{ .ConfirmationURL }}` (the PKCE code flow)? That flow requires the browser's **PKCE `code_verifier`** (breaks when an Outlook/corporate scanner prefetches the link or the user opens it on another device) AND a `redirect_to` **allowlist** match — when it failed, GoTrue fell back to the **Site URL** and the code stranded on `/es` (home), so the email never reflected without a re-login (the Sprint 250→257 bug). **token_hash needs neither** the verifier nor an allowlist, so it always reaches `/auth/callback`. The route resolves the role + the UI locale (stashed in `user_metadata.email_change_locale` by `account-security`, since a static template can't know it) and lands the user on **`/{locale}/dashboard/{panel}?tab=cuenta&emailChanged=1`** → the account page's `refreshSession()` makes the new email show immediately. **Requires Site URL = `https://contratacr.com`** and **"Secure email change" OFF** (single confirmation; if ON, GoTrue needs BOTH the old- and new-address links clicked or the change stays pending).
- **Confirm signup MUST use `{{ .Token }}` (the 6-digit code), not `{{ .ConfirmationURL }}` (a link).** The app verifies registration with `supabase.auth.verifyOtp({ type: "signup" })` and the UI says "Ingresa el código de 6 dígitos" (`OtpVerification`). If the Confirm-signup template sends a link instead, the user gets an email with a "Confirmar mi correo" button but no code, and registration can't complete. Same idea for any flow that asks the user to type a code.
- Branding: dark navy `#162543` text, brand blue `#008ce0` buttons/accents, white card on `#f4f7fa`.
- Logo (public PNG, looks good on white): `https://res.cloudinary.com/dxxrjx2go/image/upload/f_png,w_128/contratacr/brand/email-logo.png` (source `contratacr/brand/email-logo`).
- Table-based layout + inline CSS only (Gmail/Outlook safe). No external CSS/JS/SVG.
- Spanish (no "vos"). Do NOT alter the `{{ .Variable }}` tokens — they generate the real action links.
- The **Subject** lines (set in the same dashboard screen) are plain text, suggested:
  - Confirm signup: `Tu código de confirmación · ContrataCR`
  - Invite user: `Te invitaron a ContrataCR`
  - Magic Link: `Tu enlace de acceso · ContrataCR`
  - Change Email: `Confirma tu nuevo correo · ContrataCR`
  - Reset Password: `Restablece tu contraseña · ContrataCR`
  - Reauthentication: `Tu código de verificación · ContrataCR`
