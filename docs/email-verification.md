# Admin-created accounts with email verification

Admins enter a name, email address (including Gmail), role, and unit in **Manage Users → Add User**. **Send Invitation** creates a pending profile and sends a Supabase invitation. The recipient opens the email link, verifies ownership of the email, and sets a password. They then sign in with that email and password. New accounts cannot use the old password-table login path.

The admin never sets or sees the invited user's password. **Email status** shows **Pending verification**, **Verified**, or **Legacy account**. Pending accounts include **Resend link** for an expired or missing invitation. Existing badge and email accounts retain their existing credentials until separately migrated. Passwords and role assignments are now read through the server, and invitations require a signed administrator session. Existing browser sessions need to sign in again once to obtain that session.

Selecting any user row opens **User details**. Admins can edit the name, role, unit, and legacy email/badge credential, set a new password with confirmation, or confirm account deletion. Auth-linked email addresses are read-only to preserve verification. Pending invitations must be verified before an admin can change their password. An admin cannot delete or demote their own account. Updated legacy passwords are stored as salted scrypt hashes; original legacy passwords still work until changed. Deletion retains citation and payment history. Auth-linked accounts require the server admin key for password changes and Auth deletion; existing legacy account edits work with the current database setup.

## Configure before enabling invitations

1. In `.env.local` and the deployed server environment, set `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) from Supabase Project Settings → API. Set `AUTH_SESSION_SECRET` to a random secret of at least 32 characters. These values must never have a `VITE_` prefix. Keep the existing public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. Restart the dev server so it loads the new server variables. Production must configure these variables in its hosting environment.
3. With `DATABASE_URL` configured, run `node run-schema.cjs email_verification.sql`. This adds Auth identity and verification fields, syncs confirmation from Supabase Auth, and removes anonymous access to the users table. **Configure the server admin key first**: after migration, only the server can read legacy accounts or manage users. Do not rerun the old `schema.sql` afterward; it recreates permissive user policies.
4. In Supabase Authentication → URL Configuration, set the production Site URL and add exact allowed redirect URLs: `http://localhost:3000/auth/verify` for local development and `https://your-app-domain/auth/verify` for production.
5. Enable custom SMTP in Supabase Authentication → Email. Set a sender address verified with your SMTP provider. The built-in sender is restricted to project team email addresses, so it cannot deliver to arbitrary Gmail recipients. SMTP provider credentials stay in Supabase; this application doesn't need a Gmail password.
6. Keep the default **Invite user** template link `{{ .ConfirmationURL }}`. Supabase verifies the invite before redirecting to `/auth/verify` with a session. The callback also accepts a customized invite template using `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite`. Do not put tokens in logs or screenshots.
7. Sign out and sign in again as an existing administrator, then send an invitation to a mailbox you control. Verify that the pending account cannot sign in, follow the delivered link, set a password, and confirm sign-in reaches the assigned role. An invalid or expired link displays an error; no dashboard access is granted.

The handler returns an explicit setup error if the admin key, migration, or email delivery is unavailable. A rejected email removes the newly inserted pending profile so the admin can retry. It does not report an invitation as sent when Supabase rejects it. Delivery acceptance is not proof of inbox delivery; inspect Supabase Auth logs and the recipient's spam folder if needed.

## Verification

`node --test tests/*.test.mjs` exercises authentication and invitation handlers with isolated adapters; it sends no emails and creates no real users. `npx tsc --noEmit`, targeted ESLint, and `npm run build` validate integration. Live SMTP delivery and acceptance require the external setup above.

Reference: [Supabase invitations](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [redirects](https://supabase.com/docs/guides/auth/redirect-urls), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
