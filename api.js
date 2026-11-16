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
      .select('id,student_number,full_name,email,program,year_level,section,role,username')
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

  async getQueueSystemStatus() {
    const client = requireClient();
    const data = unwrap(await client.rpc('get_queue_system_status')) || [];
    return Array.isArray(data) ? (data[0] || null) : data;
  },

  async getAdminAuthEmail(username) {
    const client = requireClient();
    return unwrap(await client.rpc('get_admin_auth_email', { p_username: String(username || '').trim() }));
  },

  async adminSetQueueAccess(enabled, message = null) {
    const client = requireClient();
    const desired = Boolean(enabled);
    unwrap(await client.rpc('admin_set_queue_access', {
      p_enabled: desired,
      p_message: message || null
    }));

    // The SQL RPC intentionally returns void for compatibility. Read the
    // persisted row back before the UI reports that the switch changed.
    const saved = await this.getQueueSystemStatus();
    if (!saved || saved.student_access_enabled !== desired) {
      throw new Error('Supabase did not confirm the requested access state. Refresh the dashboard and check the saved status.');
    }
    return saved;
  },

  async getQueueSystemEvents(limit = 12) {
    const client = requireClient();
    return unwrap(await client.from('queue_system_events')
      .select('id,student_access_enabled,status_message,created_at')
      .order('created_at', { ascending: false }).limit(limit)) || [];
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
    const response = unwrap(await client.rpc('take_queue_number', {
      p_service_id: serviceId,
      p_cashier_window_id: cashierWindowId || null,
      p_student_note: studentNote || null
    }));
    const row = Array.isArray(response) ? response[0] : response;
    if (!row) return row;
    // Keep the UI contract stable while the SQL uses collision-proof result_* names.
    return {
      ticket_id: row.result_ticket_id,
      ticket_code: row.result_ticket_code,
      cashier_window_id: row.result_cashier_window_id,
      cashier_window_name: row.result_cashier_window_name,
      queue_date: row.result_queue_date
    };
  },

  async cancelMyTicket(ticketId) {
    const client = requireClient();
    return unwrap(await client.rpc('cancel_my_queue_ticket', { p_ticket_id: ticketId }));
  },

  async getStaffQueue(cashierWindowId, manilaDate) {
    const client = requireClient();
    return unwrap(await client.from('queue_tickets')
      .select('id,ticket_code,status,created_at,student_note,profiles!queue_tickets_student_id_fkey(full_name,student_number),services(name)')
      .eq('cashier_window_id', cashierWindowId).eq('queue_date', manilaDate)
      .in('status', ['waiting', 'serving']).order('created_at', { ascending: true })) || [];
  },

  async callNext(cashierWindowId) {
    const client = requireClient();
    return unwrap(await client.rpc('staff_call_next', { p_cashier_window_id: cashierWindowId }));
  },

  async adminCallTicket(ticketId) {
    const client = requireClient();
    return unwrap(await client.rpc('admin_call_queue_ticket', { p_ticket_id: ticketId }));
  },

  async updateStaffTicket({ ticketId, newStatus, staffNote = null }) {
    const client = requireClient();
    return unwrap(await client.rpc('staff_update_queue_ticket', {
      p_ticket_id: ticketId,
      p_new_status: newStatus,
      p_staff_note: staffNote
    }));
  },

  async getNotificationPreferences(userId) {
    const client = requireClient();
    const result = await client.from('queue_notification_preferences')
      .select('user_id,email_enabled,device_enabled').eq('user_id', userId).maybeSingle();
    return unwrap(result) || { user_id: userId, email_enabled: false, device_enabled: false };
  },

  async setEmailNotifications(userId, enabled) {
    const client = requireClient();
    return unwrap(await client.from('queue_notification_preferences').upsert({
      user_id: userId,
      email_enabled: Boolean(enabled)
    }, { onConflict: 'user_id' }).select('user_id,email_enabled,device_enabled').single());
  },

  async setDeviceNotifications(userId, enabled) {
    const client = requireClient();
    return unwrap(await client.from('queue_notification_preferences').upsert({
      user_id: userId,
      device_enabled: Boolean(enabled)
    }, { onConflict: 'user_id' }).select('user_id,email_enabled,device_enabled').single());
  },

  async savePushSubscription(userId, subscription) {
    const client = requireClient();
    const serialized = subscription?.toJSON ? subscription.toJSON() : subscription;
    if (!serialized?.endpoint || !serialized?.keys?.p256dh || !serialized?.keys?.auth) {
      throw new Error('The browser did not provide a valid push subscription.');
    }
    return unwrap(await client.from('queue_push_subscriptions').upsert({
      user_id: userId,
      endpoint: serialized.endpoint,
      p256dh: serialized.keys.p256dh,
      auth: serialized.keys.auth,
      user_agent: navigator.userAgent,
      is_active: true
    }, { onConflict: 'endpoint' }).select('id').single());
  },

  async removeAllPushSubscriptions(userId) {
    const client = requireClient();
    return unwrap(await client.from('queue_push_subscriptions').delete().eq('user_id', userId));
  },

  async notifyStudentTurn(ticketId) {
    const client = requireClient();
    if (!ticketId) throw new Error('The called ticket ID is missing.');
    const result = await client.functions.invoke('notify-student-turn', {
      body: { ticket_id: ticketId }
    });
    if (result.error) throw result.error;
    return result.data || {};
  }
};

export function subscribeToQueueChanges(onChange) {
  const client = requireClient();
  return client.channel(`gnc-queue-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_tickets' }, onChange)
    .subscribe();
}
