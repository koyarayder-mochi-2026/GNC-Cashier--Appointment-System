# GNC Pause/Resume and Email Verification QA

## Implemented
- Admin pause/resume calls now read the saved status back from `get_queue_system_status()` before showing a success toast.
- Admin system status is loaded and rendered independently from cashier queue data and audit history. Auxiliary panel failures no longer suppress the global pause state.
- Unknown/unverified backend status disables both pause and resume controls rather than assuming the system is open.
- Admin dashboard refreshes on a 5-second interval and when the tab regains focus.
- Student landing page starts with a status-check notice, hides the login/create-account panel until status is known, and polls the saved status every 4 seconds. A paused state shows the custom unavailable notice; a resumed state restores student access.
- Added a GNC-styled Supabase email callback page (`email-verified.html`). It verifies the returned Supabase user, clears the temporary callback session locally, and displays a verified confirmation with a button to return to the main page's Login tab.
- Signup now sends `emailRedirectTo` to `/email-verified.html`; unverified login errors expose a resend-verification action.

## Static checks
- `node --check` passed for all 8 JavaScript files.
- HTML parsed for `index.html`, `admin/index.html`, `display.html`, and `email-verified.html`.
- No duplicate IDs found.
- All local `src`/`href` references resolve within the project.
- Required verification and pause-state DOM elements confirmed.
- Pause/resume and email verification call sites checked.
- Dollar-quoted SQL delimiters balanced in the new migration and existing SQL files.
- Final ZIP tested with `unzip -t`; no archive errors.

## Required deployment configuration
1. Run `gnc_pause_resume_reliability_patch.sql` in the existing Supabase SQL Editor. It is idempotent for the global settings row and replaces the status/pause RPC definitions without deleting tickets.
2. Deploy the updated frontend bundle.
3. In Supabase Authentication → URL Configuration, set Site URL to `https://gnc-cashier-appointment-system.vercel.app` and add `https://gnc-cashier-appointment-system.vercel.app/email-verified.html` to Redirect URLs.
4. Keep Supabase email confirmation enabled and use the standard `{{ .ConfirmationURL }}` confirmation link in the email template.

## Not performed
This environment does not have authenticated access to the user's live Supabase project or Vercel deployment. The SQL migration has not been run against the live database, and real email delivery/confirmation plus browser behavior have not been tested on the deployed site. These require the deployment steps above and a test student email address.
