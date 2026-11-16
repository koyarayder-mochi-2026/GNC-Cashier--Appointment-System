import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const config = window.GNC_SUPABASE_CONFIG || {};
const title = document.getElementById('verificationTitle');
const description = document.getElementById('verificationDescription');
const button = document.getElementById('continueLoginLink');
const errorBox = document.getElementById('verificationError');
const icon = document.getElementById('verificationIcon');

function showFailure(message) {
  title.textContent = 'We could not confirm your email yet.';
  description.textContent = 'The verification link may have expired, already been used, or was created from a different website address. Return to the deployed GNC portal and request a fresh verification email.';
  icon.textContent = '!';
  icon.style.background = '#fff0ed';
  icon.style.color = '#a23f35';
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearCallbackParameters() {
  // Remove one-time auth codes/tokens from the visible address after processing.
  const clean = new URL(window.location.href);
  clean.search = '';
  clean.hash = '';
  window.history.replaceState({}, document.title, clean.pathname);
}

async function verifyCallback() {
  if (!config.url || !config.anonKey || String(config.anonKey).includes('YOUR_')) {
    showFailure('The GNC Supabase project configuration is missing.');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const providerError = params.get('error_description') || params.get('error') || hashParams.get('error_description') || hashParams.get('error');
  if (providerError) {
    clearCallbackParameters();
    showFailure(providerError);
    return;
  }

  try {
    // Keep the same origin's PKCE verifier available and explicitly exchange
    // the ?code= value returned by Supabase. Disabling auto URL detection avoids
    // racing Supabase's automatic callback parser against this page's handler.
    const client = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: 'pkce'
      }
    });

    let user = null;
    const code = params.get('code');
    const tokenHash = params.get('token_hash');
    const type = params.get('type');

    if (code) {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error) throw error;
      user = data?.user || data?.session?.user || null;
    } else if (tokenHash && type) {
      const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error) throw error;
      user = data?.user || data?.session?.user || null;
    } else {
      // Support implicit-flow callbacks in case the Supabase project has older
      // confirmation links already in circulation.
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      if (accessToken && refreshToken) {
        const { data, error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) throw error;
        user = data?.user || data?.session?.user || null;
      }
    }

    if (!user) {
      const { data, error } = await client.auth.getUser();
      if (error) throw error;
      user = data?.user || null;
    }

    if (!user?.email_confirmed_at && !user?.confirmed_at) {
      throw new Error('Supabase did not return a confirmed email account. Check that the confirmation link is valid and has not expired.');
    }

    // Confirmation is complete. End the temporary callback session so the
    // student must explicitly sign in from the GNC portal using their password.
    const { error: signOutError } = await client.auth.signOut({ scope: 'local' });
    if (signOutError) throw signOutError;

    clearCallbackParameters();
    title.textContent = 'Your email is now verified.';
    description.textContent = 'Your GNC student email address has been confirmed successfully. You may now log in using your registered email address and password.';
    icon.textContent = '✓';
    icon.style.background = '#e8f4e9';
    icon.style.color = '#17613d';
    button.hidden = false;
  } catch (error) {
    console.error('Email verification callback:', error);
    clearCallbackParameters();
    const message = String(error?.message || 'Verification could not be completed.');
    const lower = message.toLowerCase();
    const friendly = lower.includes('code verifier') || lower.includes('flow state')
      ? 'This confirmation was started on a different website address (often localhost). Open the live GNC website, select Resend verification email, and use the newest email from the same browser.'
      : message;
    showFailure(friendly);
  }
}

verifyCallback();
