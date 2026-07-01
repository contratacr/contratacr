# ContrataCR — branded Supabase auth email templates

These files are the source of truth for Supabase Auth email templates. Prefer the GitHub Action **Supabase email templates** for test and production syncs.

Manual fallback: paste each HTML file in **Supabase Dashboard → Authentication → Email Templates → [template]** and press **Save**.

| File | Supabase template | Required variable(s) |
|------|-------------------|----------------------|
| `confirm-signup.html` | **Confirm signup** | `{{ .Token }}` (código de 6 dígitos) |
| `invite-user.html` | **Invite user** | `{{ .ConfirmationURL }}` |
| `magic-link.html` | **Magic Link** | `{{ .ConfirmationURL }}` |
| `change-email.html` | **Change Email Address** | `{{ .SiteURL }}`, `{{ .TokenHash }}`, `{{ .Email }}`, `{{ .NewEmail }}` |
| `reset-password.html` | **Reset Password** | `{{ .ConfirmationURL }}` |
| `reauthentication.html` | **Reauthentication** | `{{ .Token }}` (código de 6 dígitos) |

## Automated sync

The deploy manifest is `templates.json`. It maps each HTML file to Supabase Management API keys and the subject line.

Validate files and required Supabase tokens without calling the API:

```bash
node scripts/sync-supabase-email-templates.mjs --validate-only
```

Dry run:

```bash
SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... node scripts/sync-supabase-email-templates.mjs --dry-run
```

Apply:

```bash
SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... node scripts/sync-supabase-email-templates.mjs
```

Production should be applied through GitHub Actions with environment approval.

## Notes

- **Change Email usa el flujo `token_hash`: un enlace construido por nosotros, no `{{ .ConfirmationURL }}`.** El botón apunta a `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email_change`, y `/auth/callback` finaliza el cambio con `verifyOtp({ type: "email_change", token_hash })`.
- **Confirm signup debe usar `{{ .Token }}`**, no `{{ .ConfirmationURL }}`. La app verifica el registro con `supabase.auth.verifyOtp({ type: "signup" })` y la UI pide ingresar el código de 6 dígitos.
- Diseño: cuerpo claro para evitar problemas de dark mode en clientes de correo, tarjeta blanca, texto navy `#162543`, azul de marca `#009FD9`.
- Logo público: `https://res.cloudinary.com/dxxrjx2go/image/upload/f_png,w_160/contratacr/brand/email-logo.png`.
- Layout con tablas e inline CSS solamente. No usar CSS externo, JS ni SVG.
- Español neutro. No alterar los tokens `{{ .Variable }}` porque generan enlaces y códigos reales.
- Asuntos sugeridos:
  - Confirm signup: `Tu código de confirmación · ContrataCR`
  - Invite user: `Te invitaron a ContrataCR`
  - Magic Link: `Tu enlace de acceso · ContrataCR`
  - Change Email: `Confirma tu nuevo correo · ContrataCR`
  - Reset Password: `Restablece tu contraseña · ContrataCR`
  - Reauthentication: `Tu código de verificación · ContrataCR`
