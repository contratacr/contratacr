# ContrataCR — branded Supabase auth email templates

Paste each file's HTML into **Supabase Dashboard → Authentication → Email Templates → [template]**, then **Save**.

| File | Supabase template | Required variable(s) |
|------|-------------------|----------------------|
| `confirm-signup.html` | **Confirm signup** | `{{ .Token }}` (6-digit code) |
| `invite-user.html` | **Invite user** | `{{ .ConfirmationURL }}` |
| `magic-link.html` | **Magic Link** | `{{ .ConfirmationURL }}` |
| `change-email.html` | **Change Email Address** | `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}` |
| `reset-password.html` | **Reset Password** | `{{ .ConfirmationURL }}` |
| `reauthentication.html` | **Reauthentication** | `{{ .Token }}` (6-digit code) |

## Notes
- **Change Email uses `{{ .ConfirmationURL }}` (the code flow), same as password reset.** The link works ONLY when the app passes **`emailRedirectTo = https://contratacr.com/auth/callback?next=…`** to `updateUser({ email }, …)` — that becomes GoTrue's `redirect_to`, so the confirmation **code lands on `/auth/callback`** (which exchanges it, then honors `next` → the account tab). If `emailRedirectTo` is omitted, GoTrue falls back to the **Site URL** and the code lands on `/es` (home), unprocessed (the Sprint 250→252 bug). **Requires `https://contratacr.com/auth/callback` in Authentication → Redirect URLs** (already used by password reset) and **Site URL = `https://contratacr.com`**.
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
