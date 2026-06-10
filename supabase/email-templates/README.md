# ContrataCR — branded Supabase auth email templates

Paste each file's HTML into **Supabase Dashboard → Authentication → Email Templates → [template]**, then **Save**.

| File | Supabase template | Required variable(s) |
|------|-------------------|----------------------|
| `confirm-signup.html` | **Confirm signup** | `{{ .ConfirmationURL }}` |
| `invite-user.html` | **Invite user** | `{{ .ConfirmationURL }}` |
| `magic-link.html` | **Magic Link** | `{{ .ConfirmationURL }}` |
| `change-email.html` | **Change Email Address** | `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}` |
| `reset-password.html` | **Reset Password** | `{{ .ConfirmationURL }}` |
| `reauthentication.html` | **Reauthentication** | `{{ .Token }}` (6-digit code) |

## Notes
- Branding: dark navy `#162543` text, brand blue `#008ce0` buttons/accents, white card on `#f4f7fa`.
- Logo (public PNG, looks good on white): `https://res.cloudinary.com/dxxrjx2go/image/upload/f_png,w_128/contratacr/brand/email-logo.png` (source `contratacr/brand/email-logo`).
- Table-based layout + inline CSS only (Gmail/Outlook safe). No external CSS/JS/SVG.
- Spanish (no "vos"). Do NOT alter the `{{ .Variable }}` tokens — they generate the real action links.
- The **Subject** lines (set in the same dashboard screen) are plain text, suggested:
  - Confirm signup: `Confirma tu correo · ContrataCR`
  - Invite user: `Te invitaron a ContrataCR`
  - Magic Link: `Tu enlace de acceso · ContrataCR`
  - Change Email: `Confirma tu nuevo correo · ContrataCR`
  - Reset Password: `Restablece tu contraseña · ContrataCR`
  - Reauthentication: `Tu código de verificación · ContrataCR`
