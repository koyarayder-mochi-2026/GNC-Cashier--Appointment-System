# GNC Email Verification Redirect Fix — QA Report

## Root cause

The previous `getEmailVerificationRedirect()` used `window.location.origin`. When a student registered from `http://localhost:3000`, Supabase embedded that local origin into the confirmation email. After the local development server stopped, clicking the link produced `ERR_CONNECTION_REFUSED`.

## Changes

- Added a fixed production callback in `config.js`: `https://gnc-cashier-appointment-system.vercel.app/email-verified.html`.
- Both signup and resend-verification use `getEmailVerificationRedirect()` and no longer derive a callback from `window.location.origin`.
- Reworked `email-verified.js` to explicitly handle PKCE `?code=` via `exchangeCodeForSession`, direct `token_hash` links via `verifyOtp`, and legacy implicit token fragments.
- Checks that Supabase returns a user with a confirmed email before showing success.
- Clears the temporary local callback session and removes the one-time query/token from the address bar.
- Success button returns to `/?verified=1#authPanel`; `app.js` selects Login and displays a verified notice.
- Added Supabase Email Template instructions for using `{{ .TokenHash }}` directly. This avoids a PKCE verifier being inaccessible when signup begins on localhost and callback opens on the deployed domain.

## Automated checks

- Node syntax checks across all project JavaScript files.
- HTML parse checks for all pages.
- Duplicate HTML ID checks.
- Local asset reference checks.
- Config asserts the fixed Vercel callback.
- Signup and resend both call the configured callback helper.
- Node mocked-auth tests passed for PKCE `code` and direct `token_hash` verification paths.
- Success CTA and callback URL cleanup verified.
- ZIP integrity check passed.

## Required dashboard action

In Supabase Dashboard:

1. Authentication → URL Configuration: Site URL `https://gnc-cashier-appointment-system.vercel.app`.
2. Add redirect URL `https://gnc-cashier-appointment-system.vercel.app/email-verified.html`.
3. Authentication → Email Templates → Confirm signup: use the direct link below rather than `{{ .ConfirmationURL }}`:

`https://gnc-cashier-appointment-system.vercel.app/email-verified.html?token_hash={{ .TokenHash }}&amp;type=signup`

Old emails with `localhost:3000` remain unchanged. Deploy this version, save the template, and request a new verification email.

## Not claimed

The live Supabase email sender and Vercel deployment were not accessed from this environment. The actual email delivery and redirect must be tested after the dashboard setting/template change.
