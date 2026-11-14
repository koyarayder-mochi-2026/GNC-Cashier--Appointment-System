import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const config = window.GNC_SUPABASE_CONFIG || {};
export const configReady = Boolean(
  config.url && config.anonKey &&
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url) &&
  !config.anonKey.includes('YOUR_')
);

export const supabase = configReady
  ? createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce'
      },
      global: { headers: { 'X-Client-Info': 'gnc-cashier-queue-web/1.0.0' } }
    })
  : null;

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured. Add the project URL and publishable key in config.js.');
  return supabase;
}

function unwrap(result) {
  if (result.error) throw result.error;
  return result.data;
}

// All application data access goes through this API module. Reads use the
// Supabase Data API (PostgREST); state-changing operations use PostgreSQL RPCs.
export const api = {
  async getProfile(userId) {
    const client = requireClient();
    return unwrap(await client.from('profiles')
      .select('id,student_number,full_name,email,program,year_level,section,role')
      .eq('id', userId).single());
  },

  async updateMyProfile(userId, changes) {
    const allowed = ['full_name', 'phone', 'program', 'year_level', 'section'];
    const payload = Object.fromEntries(Object.entries(changes).filter(([key]) => allowed.includes(key)));
    if (Object.keys(payload).length === 0) return this.getProfile(userId);
    const client = requireClient();
    unwrap(await client.from('profiles').update(payload).eq('id', userId));
    return this.getProfile(userId);
  },

  async listServices() {
    const client = requireClient();
    return unwrap(await client.from('services')
      .select('id,code,name,description').eq('is_active', true).order('name')) || [];
  },

  async listCashierWindows(activeOnly = true) {
    const client = requireClient();
    let query = client.from('cashier_windows').select('id,code,name,location_description,is_active');
    if (activeOnly) query = query.eq('is_active', true);
    return unwrap(await query.order('code')) || [];
  },

  async getPublicQueueStatus() {
    const client = requireClient();
    return unwrap(await client.rpc('get_public_queue_status')) || [];
  },

  async getMyActiveTicket(userId, manilaDate) {
    const client = requireClient();
    const result = await client.from('queue_tickets')
      .select('id,ticket_code,queue_date,status,student_note,created_at,called_at,services(name),cashier_windows(name,code)')
      .eq('student_id', userId).eq('queue_date', manilaDate)
      .in('status', ['waiting', 'serving']).order('created_at', { ascending: false }).limit(1);
    return unwrap(result)?.[0] || null;
  },

  async getMyQueuePosition(ticketId) {
    const client = requireClient();
    return unwrap(await client.rpc('get_my_queue_position', { p_ticket_id: ticketId }));
  },

  async takeQueueNumber({ serviceId, cashierWindowId = null, studentNote = null }) {
    const client = requireClient();
    const result = unwrap(await client.rpc('take_queue_number', {
      p_service_id: serviceId,
      p_cashier_window_id: cashierWindowId || null,
      p_student_note: studentNote || null
    }));
    return Array.isArray(result) ? result[0] : result;
  },

  async cancelMyTicket(ticketId) {
    const client = requireClient();
    return unwrap(await client.rpc('cancel_my_queue_ticket', { p_ticket_id: ticketId }));
  },

  async getStaffQueue(cashierWindowId, manilaDate) {
    const client = requireClient();
    return unwrap(await client.from('queue_tickets')
      .select('id,ticket_code,status,created_at,student_note,profiles(full_name,student_number),services(name)')
      .eq('cashier_window_id', cashierWindowId).eq('queue_date', manilaDate)
      .in('status', ['waiting', 'serving']).order('created_at', { ascending: true })) || [];
  },

  async callNext(cashierWindowId) {
    const client = requireClient();
    return unwrap(await client.rpc('staff_call_next', { p_cashier_window_id: cashierWindowId }));
  },

  async updateStaffTicket({ ticketId, newStatus, staffNote = null }) {
    const client = requireClient();
    return unwrap(await client.rpc('staff_update_queue_ticket', {
      p_ticket_id: ticketId,
      p_new_status: newStatus,
      p_staff_note: staffNote
    }));
  }
};

export function subscribeToQueueChanges(onChange) {
  const client = requireClient();
  return client.channel(`gnc-queue-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_tickets' }, onChange)
    .subscribe();
}
