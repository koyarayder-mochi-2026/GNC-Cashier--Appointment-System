# GNC Pause/Resume + Email Verification — QA report

## Email callback issue fixed

The screenshots showed Supabase redirecting to `http://localhost:3000/?code=...`; the local development server was not running, so Chrome returned `ERR_CONNECTION_REFUSED`.

Changes in this release:
- `config.js` now contains the fixed production callback URL `https://gnc-cashier-appointment-system.vercel.app/email-verified.html`.
- Signup and resend-verification both use that configured URL; they no longer use `window.location.origin`.
- `email-verified.js` explicitly exchanges PKCE `?code=` using `exchangeCodeForSession`, supports `token_hash` using `verifyOtp`, and retains support for legacy implicit access-token fragments.
- The page validates `email_confirmed_at`/`confirmed_at`, clears the temporary local callback session, removes one-time callback parameters from the address bar, and then displays the GNC verified-success screen.
- The success button opens `/?verified=1#authPanel`; the main portal selects Login, shows the verified confirmation message, and scrolls to the login area (or to the paused notice if online access is paused).
- The setup guide now includes a direct `{{ .TokenHash }}` Confirm signup template link. This avoids PKCE verifier origin problems if signup began on localhost or the confirmation opens in a different browser context.

## Automated checks completed

- Node syntax checks for all 8 project JavaScript files.
- HTML parse checks for 4 HTML pages.
- Duplicate HTML ID checks.
- All local HTML asset references checked.
- Fixed HTTPS callback configuration checked.
- Signup and resend wiring checked to use the same configured callback helper.
- Mocked auth tests passed for PKCE `code` and `token_hash` verification branches.
- Verified-success message, session cleanup, callback URL cleanup and continue-to-login target checked.
- ZIP integrity test completed.

## Required Supabase dashboard configuration

After deploying this build:

1. Authentication → URL Configuration: Site URL = `https://gnc-cashier-appointment-system.vercel.app`.
2. Add Redirect URL = `https://gnc-cashier-appointment-system.vercel.app/email-verified.html`.
3. Authentication → Email Templates → Confirm signup: replace the current `{{ .ConfirmationURL }}` link with:

```html
<a href="https://gnc-cashier-appointment-system.vercel.app/email-verified.html?token_hash={{ .TokenHash }}&amp;type=signup">Confirm email address</a>
```

4. Save the template and request a fresh verification email from the deployed GNC site.

Old emails that already contain `localhost:3000` cannot be rewritten. They must be replaced with a newly sent email. Students should use the newest link only.

## Not claimed

The live Supabase dashboard template/settings and live Vercel deployment were not changed from this environment. End-to-end message delivery and redirect must be confirmed after applying the dashboard settings above.
