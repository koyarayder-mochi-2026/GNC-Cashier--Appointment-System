// GNC Student Cashier Virtual Queue — Supabase browser configuration.
// Only the public publishable key belongs in browser code. Never add a service_role
// or sb_secret key here. The administrator's password is stored only by Supabase Auth.
window.GNC_SUPABASE_CONFIG = {
  url: 'https://eqcpsoekurzfbgykhydo.supabase.co',
  anonKey: 'sb_publishable_PLWxwoRwvZ_6UEtgn9CoNQ_ik9U-LCe',
  adminUsername: 'GNCICashier2026',
  // Always send Supabase email confirmations to the deployed GNC site.
  // Do not derive this from window.location.origin: local development would
  // otherwise create emails that point to localhost after the dev server stops.
  emailRedirectUrl: 'https://gnc-cashier-appointment-system.vercel.app/email-verified.html',
  // Fill this with the PUBLIC VAPID key generated for Web Push. Private key stays in Supabase Edge Function secrets.
  vapidPublicKey: ''
};
