import { api, supabase, configReady, subscribeToQueueChanges } from './api.js';

const $ = (id) => document.getElementById(id);
const state = { session: null, profile: null, services: [], cashiers: [], allCashiers: [], currentTicket: null, staffCurrent: null, realtime: null, refreshTimer: null, activeView: 'studentView' };

function showToast(message, isError = false) {
  const toast = $('toast'); toast.textContent = message; toast.classList.toggle('error', isError); toast.classList.remove('hidden');
  window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => toast.classList.add('hidden'), 4200);
}
function showMessage(id, message, type = 'success') {
  const el = $(id); el.textContent = message; el.className = `message ${type}`; el.classList.remove('hidden');
}
function clearMessage(id) { $(id).classList.add('hidden'); }
function setBusy(button, busy, label = 'Please wait…') {
  if (!button) return;
  if (busy) { button.dataset.originalText = button.innerHTML; button.innerHTML = label; button.disabled = true; }
  else { button.innerHTML = button.dataset.originalText || button.innerHTML; button.disabled = false; }
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}
function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}
function statusLabel(status) { return ({ waiting: 'WAITING', serving: 'NOW SERVING', completed: 'COMPLETED', cancelled: 'CANCELLED', no_show: 'NO-SHOW' })[status] || status.toUpperCase(); }
function ticketStatusClass(status) { return status === 'serving' ? 'serving' : (status === 'completed' ? 'completed' : ''); }
function currentManilaDate() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }

function setConnection(online, label) {
  const el = $('connectionStatus'); el.classList.toggle('online', online); el.innerHTML = `<i></i> ${escapeHtml(label)}`;
}
function switchAuthTab(tab) {
  document.querySelectorAll('[data-auth-tab]').forEach(b => b.classList.toggle('active', b.dataset.authTab === tab));
  $('loginForm').classList.toggle('hidden', tab !== 'login'); $('signupForm').classList.toggle('hidden', tab !== 'signup'); clearMessage('authMessage');
}
function showView(viewId) {
  if (viewId === 'staffView' && !['cashier', 'admin'].includes(state.profile?.role)) return;
  state.activeView = viewId;
  document.querySelectorAll('.view-section').forEach(s => s.classList.toggle('hidden', s.id !== viewId));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.view === viewId));
  if (viewId === 'myQueueView') loadMyQueue();
  if (viewId === 'staffView') loadStaffDashboard();
}

async function initialize() {
  if (!configReady) {
    setConnection(false, 'Setup needed');
    showMessage('authMessage', 'Add your Supabase Project URL and publishable/anon key in config.js, then reload this page.', 'error');
    return;
  }
  setConnection(true, 'Connected to Supabase');
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) console.error(error);
  await handleSession(session);
  supabase.auth.onAuthStateChange((_event, newSession) => {
    window.setTimeout(() => handleSession(newSession), 0);
  });
}

async function handleSession(session) {
  state.session = session;
  if (!session) {
    state.profile = null; state.currentTicket = null;
    $('staffNav').classList.add('hidden');
    cleanupRealtime();
    $('authPanel').classList.remove('hidden'); $('appPanel').classList.add('hidden'); $('signOutBtn').classList.add('hidden');
    return;
  }
  $('authPanel').classList.add('hidden'); $('appPanel').classList.remove('hidden'); $('signOutBtn').classList.remove('hidden');
  try {
    await loadProfile();
    await Promise.all([loadServices(), loadCashiers(), loadPublicQueueBoard()]);
    updateProfileUI();
    subscribeRealtime();
    if (state.profile.role === 'cashier' || state.profile.role === 'admin') $('staffNav').classList.remove('hidden');
    else $('staffNav').classList.add('hidden');
    showView('studentView');
    await loadMyQueue();
    if (['cashier','admin'].includes(state.profile.role)) await loadStaffDashboard();
    startPolling();
  } catch (err) {
    console.error(err); showToast(err.message || 'Unable to load your account.', true);
  }
}

async function loadProfile() {
  state.profile = await api.getProfile(state.session.user.id);
}
function updateProfileUI() {
  const name = state.profile.full_name || 'Student';
  $('welcomeName').textContent = `Hello, ${name.split(' ')[0]}.`;
  $('userNameChip').textContent = name; $('userRoleChip').textContent = state.profile.role.toUpperCase();
  $('userInitials').textContent = name.split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase() || 'G';
}

async function loadServices() {
  state.services = await api.listServices();
  $('serviceSelect').innerHTML = '<option value="">Select a transaction</option>' + state.services.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
}
async function loadCashiers() {
  state.cashiers = await api.listCashierWindows(true);
  state.allCashiers = await api.listCashierWindows(false);
  const opts = '<option value="">Shortest available line (recommended)</option>' + state.cashiers.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  $('cashierSelect').innerHTML = opts;
  $('staffCashierSelect').innerHTML = state.allCashiers.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.is_active ? '' : ' (not accepting new tickets)'}</option>`).join('');
}

async function loadPublicQueueBoard() {
  const data = await api.getPublicQueueStatus();
  if (!data?.length) { $('publicQueueBoard').innerHTML = '<div class="empty-compact">No cashier counters are currently open.</div>'; return; }
  $('publicQueueBoard').innerHTML = data.map(row => `
    <div class="queue-counter">
      <div class="queue-counter-main"><span class="counter-badge">${escapeHtml(row.cashier_code.replace('CASHIER-','C'))}</span><div><strong>${escapeHtml(row.cashier_name)}</strong><small>${row.serving_ticket_code ? `Now serving ${escapeHtml(row.serving_ticket_code)}` : 'No number being served'}</small></div></div>
      <div class="counter-numbers"><strong>${Number(row.waiting_count)}</strong><small>WAITING</small></div>
    </div>`).join('');
}

async function loadMyQueue() {
  if (!state.profile) return;
  const date = currentManilaDate();
  try { state.currentTicket = await api.getMyActiveTicket(state.session.user.id, date); }
  catch (error) { console.error(error); return; }
  renderMyTicket();
}
async function renderMyTicket() {
  const area = $('myTicketArea');
  const t = state.currentTicket;
  if (!t) {
    area.innerHTML = `<div class="empty-state"><div class="empty-icon">#</div><h4>No active queue number</h4><p>Get a number first to see your place in line.</p><button class="button button-primary" data-go-view="studentView" type="button">Get a queue number</button></div>`;
    return;
  }
  let position = null;
  if (t.status === 'waiting') {
    try { position = await api.getMyQueuePosition(t.id); } catch (error) { console.error(error); }
  } else position = 0;
  const counter = t.cashier_windows?.name || 'Cashier';
  const ahead = position === null ? '—' : position === 0 ? 'Now' : Math.max(0, position - 1);
  const statusText = statusLabel(t.status);
  area.innerHTML = `<div class="ticket-detail">
    <div class="ticket-number-panel"><small>YOUR QUEUE NUMBER</small><strong>${escapeHtml(t.ticket_code)}</strong><span>${escapeHtml(counter)} · ${escapeHtml(t.services?.name || 'Cashier transaction')}</span></div>
    <div class="ticket-detail-info"><span class="status-pill ${ticketStatusClass(t.status)}">${statusText}</span><div class="metric-row"><div class="metric"><small>STUDENTS AHEAD</small><strong>${ahead}</strong></div><div class="metric"><small>QUEUE POSITION</small><strong>${position === null ? '—' : position === 0 ? 'Now' : `#${position}`}</strong></div></div><div class="detail-list"><div><small>Assigned counter</small><strong>${escapeHtml(counter)}</strong></div><div><small>Issued at</small><strong>${formatTime(t.created_at)}</strong></div><div><small>Transaction</small><strong>${escapeHtml(t.services?.name || '—')}</strong></div><div><small>Ticket date</small><strong>${escapeHtml(t.queue_date)}</strong></div></div>${t.status === 'waiting' ? `<div class="ticket-actions"><button id="cancelMyTicketBtn" class="button button-light" type="button">Cancel my number</button></div>` : '<p class="form-foot" style="margin-top:15px">Please proceed to the assigned counter when your number is called.</p>'}</div></div>`;
  $('cancelMyTicketBtn')?.addEventListener('click', cancelMyTicket);
}

async function handleQueueRequest(event) {
  event.preventDefault(); clearMessage('queueFormMessage');
  const serviceId = $('serviceSelect').value;
  if (!serviceId) { showMessage('queueFormMessage', 'Select a transaction first.', 'error'); return; }
  const button = $('getNumberBtn'); setBusy(button, true, 'Generating number…');
  try {
    const result = await api.takeQueueNumber({
      serviceId,
      cashierWindowId: $('cashierSelect').value || null,
      studentNote: $('studentNote').value.trim() || null
    });
    showMessage('queueFormMessage', `Your number is ${result.ticket_code} for ${result.cashier_window_name}. Check “My queue” to track your position.`, 'success');
    $('studentNote').value = '';
    await Promise.all([loadMyQueue(), loadPublicQueueBoard()]);
    showView('myQueueView');
    showToast(`Queue number ${result.ticket_code} issued.`);
  } catch (err) {
    showMessage('queueFormMessage', err.message || 'Could not issue a queue number.', 'error');
  } finally { setBusy(button, false); }
}
async function cancelMyTicket() {
  if (!state.currentTicket || !confirm('Cancel your queue number? You will lose your place in line.')) return;
  try {
    await api.cancelMyTicket(state.currentTicket.id);
    showToast('Your queue number was cancelled.'); await Promise.all([loadMyQueue(), loadPublicQueueBoard()]);
  } catch (err) { showToast(err.message, true); }
}

async function loadStaffDashboard() {
  if (!['cashier','admin'].includes(state.profile?.role)) return;
  const selectedWindow = $('staffCashierSelect').value || state.allCashiers[0]?.id;
  if (!selectedWindow) { $('waitingList').innerHTML = '<div class="empty-compact">No active cashier counter configured.</div>'; return; }
  $('staffCashierSelect').value = selectedWindow;
  const date = currentManilaDate();
  let rows;
  try { rows = await api.getStaffQueue(selectedWindow, date); }
  catch (error) { console.error(error); showToast(error.message, true); return; }
  state.staffCurrent = rows.find(r => r.status === 'serving') || null;
  const waiting = rows.filter(r => r.status === 'waiting');
  $('staffWaitingCount').textContent = waiting.length;
  $('staffNowServing').textContent = state.staffCurrent?.ticket_code || '—';
  $('currentTicketArea').innerHTML = state.staffCurrent
    ? `<strong>${escapeHtml(state.staffCurrent.ticket_code)}</strong><span class="current-student">${escapeHtml(state.staffCurrent.profiles?.full_name || 'Student')}</span><span>${escapeHtml(state.staffCurrent.profiles?.student_number || '')} · ${escapeHtml(state.staffCurrent.services?.name || 'Transaction')}</span>`
    : '<strong>—</strong><span>No student is being served</span>';
  $('completeTicketBtn').disabled = !state.staffCurrent;
  $('skipTicketBtn').disabled = !state.staffCurrent;
  $('callNextBtn').disabled = Boolean(state.staffCurrent) || waiting.length === 0;
  $('waitingList').innerHTML = waiting.length ? waiting.map(r => `
    <div class="waiting-row"><div class="waiting-code">${escapeHtml(r.ticket_code)}</div><div class="waiting-student"><strong>${escapeHtml(r.profiles?.full_name || 'Student')}</strong><small>${escapeHtml(r.services?.name || 'Transaction')}</small></div><div class="waiting-time">${formatTime(r.created_at)}</div></div>`).join('') : '<div class="empty-compact">No students are waiting at this counter.</div>';
}
async function callNext() {
  const windowId = $('staffCashierSelect').value; if (!windowId) return;
  const button = $('callNextBtn'); setBusy(button, true, 'Calling…');
  try {
    await api.callNext(windowId);
    showToast('Next queue number called.'); await Promise.all([loadStaffDashboard(), loadPublicQueueBoard()]);
  } catch (err) { showToast(err.message, true); }
  finally { setBusy(button, false); await loadStaffDashboard(); }
}
async function updateCurrentTicket(status) {
  if (!state.staffCurrent) return;
  const confirmText = status === 'completed' ? 'Mark this transaction as completed?' : 'Mark this student as no-show?';
  if (!confirm(confirmText)) return;
  try {
    await api.updateStaffTicket({
      ticketId: state.staffCurrent.id, newStatus: status,
      staffNote: status === 'no_show' ? 'Student did not respond when called.' : null
    });
    showToast(status === 'completed' ? 'Ticket marked completed.' : 'Ticket marked as no-show.');
    await Promise.all([loadStaffDashboard(), loadPublicQueueBoard()]);
  } catch (err) { showToast(err.message, true); }
}

function cleanupRealtime() {
  if (state.realtime) { supabase.removeChannel(state.realtime); state.realtime = null; }
  if (state.refreshTimer) { clearInterval(state.refreshTimer); state.refreshTimer = null; }
}
function subscribeRealtime() {
  cleanupRealtime();
  state.realtime = subscribeToQueueChanges(async () => {
    await loadPublicQueueBoard();
    if (state.activeView === 'myQueueView') await loadMyQueue();
    if (state.activeView === 'staffView') await loadStaffDashboard();
  });
}
function startPolling() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  // Polling is a fallback in case a browser or network drops a Realtime event.
  state.refreshTimer = setInterval(async () => {
    if (!state.session) return;
    try {
      await loadPublicQueueBoard();
      if (state.activeView === 'myQueueView') await loadMyQueue();
      if (state.activeView === 'staffView') await loadStaffDashboard();
    } catch (e) { console.warn('Queue refresh failed:', e.message); }
  }, 12000);
}

async function handleLogin(event) {
  event.preventDefault(); clearMessage('authMessage');
  const btn = $('loginForm').querySelector('button[type="submit"]'); setBusy(btn, true, 'Signing in…');
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: $('loginEmail').value.trim(), password: $('loginPassword').value });
    if (error) throw error;
  } catch (err) { showMessage('authMessage', err.message || 'Unable to sign in.', 'error'); }
  finally { setBusy(btn, false); }
}
async function handleSignup(event) {
  event.preventDefault(); clearMessage('authMessage');
  const btn = $('signupForm').querySelector('button[type="submit"]'); setBusy(btn, true, 'Creating account…');
  try {
    const email = $('signupEmail').value.trim();
    const { data, error } = await supabase.auth.signUp({
      email, password: $('signupPassword').value,
      options: { data: {
        full_name: $('signupName').value.trim(), student_number: $('signupStudentNo').value.trim(),
        program: $('signupProgram').value.trim(), year_level: $('signupYear').value.trim()
      } }
    });
    if (error) throw error;
    if (!data.session) showMessage('authMessage', 'Account created. Check your email for the verification link, then sign in.', 'success');
    else showToast('Student account created.');
    $('signupForm').reset();
  } catch (err) { showMessage('authMessage', err.message || 'Unable to create your account.', 'error'); }
  finally { setBusy(btn, false); }
}
async function signOut() { await supabase.auth.signOut(); cleanupRealtime(); state.profile = null; state.currentTicket = null; showToast('You have signed out.'); }

// Event wiring
document.querySelectorAll('[data-auth-tab]').forEach(b => b.addEventListener('click', () => switchAuthTab(b.dataset.authTab)));
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
document.addEventListener('click', (e) => { const target = e.target.closest('[data-go-view]'); if (target) showView(target.dataset.goView); });
$('loginForm').addEventListener('submit', handleLogin);
$('signupForm').addEventListener('submit', handleSignup);
$('queueForm').addEventListener('submit', handleQueueRequest);
$('signOutBtn').addEventListener('click', signOut);
$('refreshQueueBtn').addEventListener('click', async () => { await Promise.all([loadMyQueue(), loadPublicQueueBoard()]); showToast('Queue status refreshed.'); });
$('refreshStaffBtn').addEventListener('click', loadStaffDashboard);
$('staffCashierSelect').addEventListener('change', loadStaffDashboard);
$('callNextBtn').addEventListener('click', callNext);
$('completeTicketBtn').addEventListener('click', () => updateCurrentTicket('completed'));
$('skipTicketBtn').addEventListener('click', () => updateCurrentTicket('no_show'));

initialize().catch(err => { console.error(err); setConnection(false, 'Connection error'); showToast(err.message || 'Unable to connect to Supabase.', true); });
