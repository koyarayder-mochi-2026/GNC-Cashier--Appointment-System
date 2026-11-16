import { api, supabase, configReady } from './api.js';

const $ = (id) => document.getElementById(id);
const state = { session: null, profile: null, windows: [], rowsByWindow: new Map(), status: null, statusVerifiedAt: 0, busy: false, timer: null, refreshing: false };

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
}
function manilaDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
}
function setConnection(ok, text) {
  $('connection').textContent = text;
  $('connection').classList.toggle('online', ok);
}
function showMessage(id, message, kind = 'error') {
  const node = $(id);
  node.textContent = message;
  node.className = `message ${kind}`;
  node.classList.remove('hidden');
}
function hideMessage(id) { $(id).classList.add('hidden'); }
function toast(message, isError = false) {
  const node = $('toast');
  node.textContent = message;
  node.classList.toggle('error', isError);
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('show'), 3600);
}
function setBusy(busy) {
  state.busy = busy;
  document.querySelectorAll('#pauseSystemBtn, #resumeSystemBtn, #adminLoginBtn, #refreshAdminBtn').forEach(button => {
    button.disabled = busy;
  });
}
function speakTicket(ticketCode, cashierName) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(`Now serving ${ticketCode}. Please proceed to ${cashierName}.`);
  utterance.lang = 'en-PH';
  utterance.rate = 0.88;
  window.speechSynthesis.speak(utterance);
}

async function sendTurnAlert(ticketId) {
  try {
    const result = await api.notifyStudentTurn(ticketId);
    const pushSent = Number(result?.push?.sent || 0);
    const emailSent = Boolean(result?.email?.sent);
    if (pushSent || emailSent) return `Student alert sent${pushSent ? ' to device' : ''}${emailSent ? (pushSent ? ' and email' : ' by email') : ''}.`;
    const skipped = [result?.push?.skipped, result?.email?.skipped]
      .filter(value => typeof value === 'string' && value.trim());
    return skipped.length
      ? `Number called; no notification delivered. ${skipped.join(' ')}`
      : 'Number called; no student notification was delivered. Check the student alert settings.';
  } catch (error) {
    console.warn('Student turn alert failed:', error);
    return 'Number called, but notification delivery is not configured yet.';
  }
}

async function signIn(event) {
  event.preventDefault();
  hideMessage('loginMessage');
  if (!configReady) {
    showMessage('loginMessage', 'Supabase is not configured. Check the project URL and publishable key in config.js.');
    return;
  }
  const username = $('adminUsername').value.trim();
  const password = $('adminPassword').value;
  const expected = window.GNC_SUPABASE_CONFIG?.adminUsername || 'GNCICashier2026';
  if (username.toLowerCase() !== expected.toLowerCase()) {
    showMessage('loginMessage', 'Invalid administrator username or password.');
    return;
  }
  setBusy(true);
  try {
    const email = await api.getAdminAuthEmail(username);
    if (!email || typeof email !== 'string') throw new Error('The administrator account has not been configured. Complete admin_account_setup.sql after creating the Auth user.');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    state.session = data.session;
    const profile = await api.getProfile(data.user.id);
    if (profile.role !== 'admin' || profile.username !== expected) {
      await supabase.auth.signOut();
      state.session = null;
      throw new Error('This account is not authorized as the GNC administrator.');
    }
    state.profile = profile;
    showDashboard();
    await refreshDashboard();
    startPolling();
  } catch (error) {
    showMessage('loginMessage', error.message || 'Unable to sign in.');
  } finally {
    setBusy(false);
  }
}

async function restoreSession() {
  if (!configReady) {
    setConnection(false, 'SETUP REQUIRED');
    showMessage('loginMessage', 'Add the Supabase Project URL and publishable key to config.js.');
    return;
  }
  setConnection(true, 'SUPABASE CONNECTED');
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) console.error(error);
  if (!session) return;
  try {
    const profile = await api.getProfile(session.user.id);
    if (profile.role !== 'admin' || profile.username !== (window.GNC_SUPABASE_CONFIG?.adminUsername || 'GNCICashier2026')) {
      $('loginMessage').textContent = 'This signed-in account does not have GNC administrator access.';
      $('loginMessage').className = 'message error';
      $('loginMessage').classList.remove('hidden');
      await supabase.auth.signOut();
      return;
    }
    state.session = session;
    state.profile = profile;
    showDashboard();
    await refreshDashboard();
    startPolling();
  } catch (error) {
    showMessage('loginMessage', error.message || 'Unable to verify administrator permissions.');
    await supabase.auth.signOut();
  }
}

function showDashboard() {
  $('loginView').classList.add('hidden');
  $('dashboardView').classList.remove('hidden');
  $('signOutBtn').hidden = false;
  $('adminWelcomeName').textContent = `Good day, ${(state.profile.full_name || 'Administrator').split(' ')[0]}.`;
  $('adminUsernameLabel').textContent = state.profile.username || 'GNCICashier2026';
}
function showLogin() {
  $('loginView').classList.remove('hidden');
  $('dashboardView').classList.add('hidden');
  $('signOutBtn').hidden = true;
}

async function refreshDashboard() {
  if (!state.session || state.profile?.role !== 'admin' || state.refreshing) return;
  state.refreshing = true;
  hideMessage('dashboardMessage');
  let statusOk = false;
  try {
    // Read and render the global switch first. A failing queue or audit query
    // must never prevent the administrator from seeing the saved pause state.
    const status = await api.getQueueSystemStatus();
    if (!status || typeof status.student_access_enabled !== 'boolean') {
      throw new Error('Supabase returned an invalid system status. Check the database migration.');
    }
    state.status = status;
    state.statusVerifiedAt = Date.now();
    statusOk = true;
    renderSystemStatus();
  } catch (error) {
    $('systemStateTitle').textContent = 'Unable to verify student access state';
    $('systemStateDescription').textContent = error.message || 'Could not read the saved setting from Supabase.';
    $('systemStatePill').textContent = 'STATUS UNKNOWN';
    $('systemStatePill').className = 'state-pill state-checking';
    $('pauseSystemBtn').disabled = true;
    $('resumeSystemBtn').disabled = true;
    showMessage('dashboardMessage', 'Pause/resume controls are disabled until Supabase confirms the saved access state. ' + (error.message || ''), 'error');
  }

  // Auxiliary dashboard panels load independently; their failure does not
  // affect the verified system switch above.
  const [windowsResult, eventsResult] = await Promise.allSettled([
    api.listCashierWindows(false), api.getQueueSystemEvents(12)
  ]);

  if (windowsResult.status === 'fulfilled') {
    state.windows = windowsResult.value;
    const queueResults = await Promise.allSettled(state.windows.map(async windowRow => ({
      windowRow,
      rows: await api.getStaffQueue(windowRow.id, manilaDate())
    })));
    const fulfilled = queueResults.filter(result => result.status === 'fulfilled').map(result => result.value);
    state.rowsByWindow = new Map(fulfilled.map(item => [item.windowRow.id, item.rows]));
    renderCounters();
    if (fulfilled.length !== state.windows.length) {
      showMessage('dashboardMessage', 'System access status is current, but one or more cashier queues could not be loaded. Use Refresh to try again.', 'error');
    }
  } else {
    showMessage('dashboardMessage', 'System access status is current, but cashier counters could not be loaded: ' + (windowsResult.reason?.message || 'Unknown error'), 'error');
  }

  if (eventsResult.status === 'fulfilled') renderEvents(eventsResult.value);
  else {
    $('eventHistory').innerHTML = '<p class="muted">Activity history is temporarily unavailable. The global access state is still shown above.</p>';
  }

  if (statusOk) setConnection(true, 'LIVE · STATUS VERIFIED');
  else setConnection(false, 'STATUS NOT VERIFIED');
  state.refreshing = false;
}

function renderSystemStatus() {
  const enabled = state.status?.student_access_enabled === true;
  $('systemStateTitle').textContent = enabled ? 'Student queue access is open' : 'Student queue access is paused';
  $('systemStateDescription').textContent = enabled
    ? 'Students can sign in and request new queue numbers.'
    : (state.status?.status_message || 'New student sign-ins and queue number requests are unavailable. Existing tickets can still be served.');
  $('systemUpdatedAt').textContent = formatDate(state.status?.updated_at);
  $('systemStatePill').textContent = enabled ? 'ONLINE · OPEN' : 'PAUSED · CLOSED';
  $('systemStatePill').className = `state-pill ${enabled ? 'state-open' : 'state-paused'}`;
  $('pauseSystemBtn').hidden = !enabled;
  $('resumeSystemBtn').hidden = enabled;
  const statusFresh = Boolean(state.statusVerifiedAt) && (Date.now() - state.statusVerifiedAt < 15000);
  $('pauseSystemBtn').disabled = state.busy || !statusFresh;
  $('resumeSystemBtn').disabled = state.busy || !statusFresh;
  $('pauseMessage').disabled = !enabled || state.busy || !statusFresh;
}

function renderCounters() {
  const container = $('counterManagement');
  if (!state.windows.length) {
    container.innerHTML = '<div class="panel empty-row">No cashier windows are configured in Supabase.</div>';
    return;
  }
  container.innerHTML = state.windows.map(windowRow => {
    const rows = state.rowsByWindow.get(windowRow.id) || [];
    const current = rows.find(row => row.status === 'serving') || null;
    const waiting = rows.filter(row => row.status === 'waiting');
    const activeLabel = windowRow.is_active ? 'ACCEPTING NEW TICKETS' : 'CLOSED TO NEW TICKETS';
    const currentCard = current ? `
      <div class="serving-card"><small>NOW SERVING</small><div class="serving-ticket">${escapeHtml(current.ticket_code)}</div><div class="serving-student">${escapeHtml(current.profiles?.full_name || 'Student')}</div><div class="serving-sub">${escapeHtml(current.profiles?.student_number || '')} · ${escapeHtml(current.services?.name || 'Cashier transaction')}</div></div>`
      : '<div class="serving-card"><small>NOW SERVING</small><div class="serving-ticket">—</div><div class="serving-student">No student is currently being served</div></div>';
    const waitingHtml = waiting.length ? waiting.map(ticket => `
      <div class="waiting-row"><div class="ticket">${escapeHtml(ticket.ticket_code)}</div><div class="student"><strong>${escapeHtml(ticket.profiles?.full_name || 'Student')}</strong><small>${escapeHtml(ticket.profiles?.student_number || 'No student number')} · ${escapeHtml(ticket.services?.name || 'Transaction')}</small></div><button class="button button-light" type="button" data-admin-action="call-selected" data-ticket-id="${escapeHtml(ticket.id)}" data-window-name="${escapeHtml(windowRow.name)}" ${current ? 'disabled' : ''}>Call this</button></div>`).join('')
      : '<div class="empty-row">No students are waiting in this line.</div>';
    return `
      <article class="panel counter-card" data-window-id="${escapeHtml(windowRow.id)}">
        <div class="counter-head"><h4>${escapeHtml(windowRow.name)}</h4><span class="counter-code">${escapeHtml(windowRow.code)} · ${activeLabel}</span></div>
        <div class="counter-stat-row"><div class="counter-stat"><small>WAITING</small><strong>${waiting.length}</strong></div><div class="counter-stat"><small>COUNTER STATUS</small><strong>${windowRow.is_active ? 'OPEN' : 'CLOSING'}</strong></div></div>
        ${currentCard}
        <div class="counter-actions">
          <button class="button button-primary" type="button" data-admin-action="next" data-window-id="${escapeHtml(windowRow.id)}" ${current || !waiting.length ? 'disabled' : ''}>Call next number →</button>
          <button class="button button-light" type="button" data-admin-action="repeat" data-ticket-code="${escapeHtml(current?.ticket_code || '')}" data-window-name="${escapeHtml(windowRow.name)}" ${!current ? 'disabled' : ''}>Repeat call</button>
          <button class="button button-success" type="button" data-admin-action="complete" data-ticket-id="${escapeHtml(current?.id || '')}" ${!current ? 'disabled' : ''}>Complete</button>
          <button class="button button-light" type="button" data-admin-action="no-show" data-ticket-id="${escapeHtml(current?.id || '')}" ${!current ? 'disabled' : ''}>No-show</button>
        </div>
        <div class="waiting-title"><strong>Waiting students</strong><span>${waiting.length} in line</span></div>
        <div class="waiting-list">${waitingHtml}</div>
      </article>`;
  }).join('');
}

function renderEvents(events) {
  const target = $('eventHistory');
  if (!events?.length) {
    target.innerHTML = '<p class="muted">No pause or resume actions have been recorded yet.</p>';
    return;
  }
  target.innerHTML = events.map(event => `
    <div class="event-row"><span class="event-date">${formatDate(event.created_at)}</span><div class="event-copy"><strong>${event.student_access_enabled ? 'Student access resumed' : 'Student access paused'}</strong><small>${escapeHtml(event.status_message)}</small></div></div>`).join('');
}

async function runAction(action, details) {
  if (state.busy) return;
  setBusy(true);
  hideMessage('dashboardMessage');
  try {
    if (action === 'pause') {
      const message = $('pauseMessage').value.trim();
      const saved = await api.adminSetQueueAccess(false, message || null);
      state.status = saved;
      state.statusVerifiedAt = Date.now();
      renderSystemStatus();
      toast('CONFIRMED: online student access is PAUSED. Existing tickets remain saved and staff can continue serving.');
      $('pauseMessage').value = '';
    } else if (action === 'resume') {
      const saved = await api.adminSetQueueAccess(true, null);
      state.status = saved;
      state.statusVerifiedAt = Date.now();
      renderSystemStatus();
      toast('CONFIRMED: student access is OPEN. Students can sign in and request new queue numbers.');
    } else if (action === 'next') {
      const ticketId = await api.callNext(details.windowId);
      const alertStatus = await sendTurnAlert(ticketId);
      toast(`Next queue number called. ${alertStatus}`);
    } else if (action === 'call-selected') {
      const result = await api.adminCallTicket(details.ticketId);
      const alertStatus = await sendTurnAlert(result?.ticket_id);
      toast(`${result?.ticket_code || 'Queue number'} called at ${result?.cashier_window_name || details.windowName}. ${alertStatus}`);
      if (result?.ticket_code) speakTicket(result.ticket_code, result.cashier_window_name || details.windowName);
    } else if (action === 'complete' || action === 'no-show') {
      await api.updateStaffTicket({
        ticketId: details.ticketId,
        newStatus: action === 'complete' ? 'completed' : 'no_show',
        staffNote: action === 'no-show' ? 'Student did not respond when called by the administrator.' : null
      });
      toast(action === 'complete' ? 'Transaction marked completed.' : 'Ticket marked as no-show.');
    } else if (action === 'repeat') {
      speakTicket(details.ticketCode, details.windowName);
      toast(`Repeating ${details.ticketCode}.`);
    }
    await refreshDashboard();
    if (action === 'next') {
      const calledWindow = state.windows.find(item => item.id === details.windowId);
      const current = (state.rowsByWindow.get(details.windowId) || []).find(ticket => ticket.status === 'serving');
      if (current && calledWindow) speakTicket(current.ticket_code, calledWindow.name);
    }
  } catch (error) {
    showMessage('dashboardMessage', error.message || 'The action could not be completed.');
  } finally {
    setBusy(false);
    if (state.status) renderSystemStatus();
  }
}

async function signOut() {
  if (state.timer) clearInterval(state.timer);
  await supabase.auth.signOut();
  state.session = null;
  state.profile = null;
  state.status = null;
  showLogin();
  $('adminPassword').value = '';
  toast('Administrator signed out.');
}
function startPolling() {
  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(() => refreshDashboard(), 5000);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.session) refreshDashboard();
});
window.addEventListener('focus', () => { if (state.session) refreshDashboard(); });

$('adminLoginForm').addEventListener('submit', signIn);
$('signOutBtn').addEventListener('click', signOut);
$('pauseSystemBtn').addEventListener('click', () => {
  if (confirm('Pause new student sign-ins and queue number requests? Existing queue tickets will remain saved and staff can continue serving them.')) runAction('pause', {});
});
$('resumeSystemBtn').addEventListener('click', () => {
  if (confirm('Reopen student sign-ins and allow new queue numbers?')) runAction('resume', {});
});
$('refreshAdminBtn').addEventListener('click', refreshDashboard);
$('counterManagement').addEventListener('click', event => {
  const button = event.target.closest('[data-admin-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.adminAction;
  runAction(action, {
    windowId: button.dataset.windowId,
    ticketId: button.dataset.ticketId,
    ticketCode: button.dataset.ticketCode,
    windowName: button.dataset.windowName
  });
});

if (configReady) {
  restoreSession().catch(error => showMessage('loginMessage', error.message || 'Unable to initialize admin portal.'));
  supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      state.session = null;
      if (state.timer) clearInterval(state.timer);
      showLogin();
    }
  });
} else {
  setConnection(false, 'SETUP REQUIRED');
  showMessage('loginMessage', 'Add the Supabase project URL and publishable key in config.js.');
}
