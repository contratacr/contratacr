# ContrataCR - branded Supabase auth email templates

These files are the source of truth for Supabase Auth email templates. Prefer the GitHub Action **Supabase email templates** for test and production syncs.

Manual fallback: paste each HTML file in **Supabase Dashboard -> Authentication -> Email Templates -> [template]** and press **Save**.

| File | Supabase template | Required variable(s) |
|------|-------------------|----------------------|
| `confirm-signup.html` | **Confirm signup** | `{{ .Token }}` (codigo de 6 digitos) |
| `invite-user.html` | **Invite user** | `{{ .ConfirmationURL }}` |
| `magic-link.html` | **Magic Link** | `{{ .ConfirmationURL }}` |
| `change-email.html` | **Change Email Address** | `{{ .SiteURL }}`, `{{ .TokenHash }}`, `{{ .Email }}`, `{{ .NewEmail }}` |
| `reset-password.html` | **Reset Password** | `{{ .SiteURL }}`, `{{ .TokenHash }}` |
| `reauthentication.html` | **Reauthentication** | `{{ .Token }}` (codigo de 6 digitos) |

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

Production should be applied through GitHub Actions with environment approval:

1. Open **Actions -> Supabase email templates**.
2. Run the workflow from `test` for the test environment, or from `main` for production.
3. Keep `dry_run` enabled first.
4. Run it again with `dry_run` disabled after reviewing the planned fields.

## Notes

- **Change Email uses the `token_hash` flow:** the button points to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email_change`, and `/auth/callback` finishes the change with `verifyOtp({ type: "email_change", token_hash })`.
- **Reset Password uses the `token_hash` flow:** this lets a user request the email on one device and open it on another. The callback verifies the one-time token server-side and then opens `/es/reset-password` with the recovery session.
- **Confirm signup must use `{{ .Token }}`**, not `{{ .ConfirmationURL }}`. The app verifies signup with `supabase.auth.verifyOtp({ type: "signup" })` and asks the user for the 6-digit code.
- Design: light and stable by default. Dark-mode CSS only swaps the logo to the white version for clients that support `prefers-color-scheme` or Outlook.com's `[data-ogsc]` dark-mode attribute.
- Public logos:
  - Light/default: `https://contratacr.com/brand/email-logo-light.png`
  - Dark surfaces: `https://contratacr.com/brand/email-logo-dark.png`
- Layout uses tables and inline fallback CSS. The small `<style>` block is only for logo swapping in dark mode.
- Spanish neutral. Do not alter `{{ .Variable }}` tokens because they generate real links and codes.
- Suggested subjects:
  - Confirm signup: `Tu codigo de confirmacion - ContrataCR`
  - Invite user: `Te invitaron a ContrataCR`
  - Magic Link: `Tu enlace de acceso - ContrataCR`
  - Change Email: `Confirma tu nuevo correo - ContrataCR`
  - Reset Password: `Restablece tu contrasena - ContrataCR`
  - Reauthentication: `Tu codigo de verificacion - ContrataCR`
