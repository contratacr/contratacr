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
- **Change Email MUST link to our callback with `{{ .TokenHash }}`, NOT `{{ .ConfirmationURL }}`.** The link is `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email_change`; `/auth/callback` finalizes the change via `verifyOtp({ type: "email_change", token_hash })`, then redirects to the account tab. The old `{{ .ConfirmationURL }}` (PKCE code) flow did NOT apply the change and dumped the user on the main page — the callback only had a `code` handler and email-change links carry a `token_hash`. (Requires **Site URL = `https://contratacr.com`**.) Same `token_hash`→callback pattern is the safe choice for any email link we want finalized server-side.
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
