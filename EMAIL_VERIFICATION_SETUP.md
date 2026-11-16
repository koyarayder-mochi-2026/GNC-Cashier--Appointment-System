# GNC student email verification setup

1. Deploy the project files, including `email-verified.html` and `email-verified.js`.
2. In Supabase Dashboard → Authentication → URL Configuration:
   - Site URL: `https://gnc-cashier-appointment-system.vercel.app`
   - Add Redirect URL: `https://gnc-cashier-appointment-system.vercel.app/email-verified.html`
   - Add your exact localhost callback URL only if using local development.
3. Keep email confirmation enabled in Supabase Auth.
4. Keep the email confirmation template using Supabase's `{{ .ConfirmationURL }}` link so Supabase can apply the `emailRedirectTo` sent by the frontend.
5. Test with a new student email address:
   - Create account on the GNC website.
   - Confirm the email from the received message.
   - The user should see “Your email is now verified.”
   - Click “Continue to sign in”; it should return to the main page with Login selected.
   - Sign in using the registered email and password.

If the callback says the link is expired or no confirmed session was returned, check that the exact callback URL is allow-listed and that the email confirmation link is not expired or previously used.
