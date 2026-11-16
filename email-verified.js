import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const config = window.GNC_SUPABASE_CONFIG || {};
const title = document.getElementById('verificationTitle');
const description = document.getElementById('verificationDescription');
const button = document.getElementById('continueLoginLink');
const errorBox = document.getElementById('verificationError');
const icon = document.getElementById('verificationIcon');

function showFailure(message) {
  title.textContent = 'We could not confirm your email yet.';
  description.textContent = 'The verification link may have expired or already been used. Return to the GNC portal and request another verification email.';
  icon.textContent = '!';
  icon.style.background = '#fff0ed';
  icon.style.color = '#a23f35';
  errorBox.textContent = message;
  errorBox.hidden = false;
}

async function verifyCallback() {
  if (!config.url || !config.anonKey || String(config.anonKey).includes('YOUR_')) {
    showFailure('The GNC Supabase project configuration is missing.');
    return;
  }
  try {
    const client = createClient(config.url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
    });
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    const type = params.get('type');
    if (tokenHash && type) {
      const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error) throw error;
    }
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    let user = sessionData.session?.user || null;
    if (user) {
      const { data, error } = await client.auth.getUser();
      if (error) throw error;
      user = data.user;
    }
    const confirmed = Boolean(user?.email_confirmed_at || user?.confirmed_at);
    if (!confirmed) {
      const providerError = params.get('error_description') || params.get('error');
      throw new Error(providerError ? providerError : 'No confirmed Supabase session was returned.');
    }
    // Supabase may establish a session during the confirmation callback. Sign
    // out here so the student is explicitly returned to the login form as requested.
    const { error: signOutError } = await client.auth.signOut({ scope: 'local' });
    if (signOutError) throw signOutError;
    title.textContent = 'Your email is now verified.';
    description.textContent = 'You can now access your GNC student account. Your email address has been confirmed successfully. You may now log in using your registered email and password.';
    button.hidden = false;
  } catch (error) {
    console.error('Email verification callback:', error);
    showFailure(error.message || 'Verification could not be completed.');
  }
}

verifyCallback();
