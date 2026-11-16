import { api, supabase, configReady, subscribeToQueueChanges } from './api.js';

const $ = (id) => document.getElementById(id);
const state = { session: null, profile: null, services: [], cashiers: [], allCashiers: [], currentTicket: null, staffCurrent: null, realtime: null, refreshTimer: null, activeView: 'studentView', systemStatus: null, systemStatusLoaded: false, systemStatusError: null, notificationPreferences: { email_enabled: false, device_enabled: false }, notifiedTicketIds: new Set() };

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
async function showView(viewId) {
  if (viewId === 'staffView' && !['cashier', 'admin'].includes(state.profile?.role)) return;
  state.activeView = viewId;
  document.querySelectorAll('.view-section').forEach(s => s.classList.toggle('hidden', s.id !== viewId));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.view === viewId));
  if (viewId === 'myQueueView') await loadMyQueue();
  if (viewId === 'staffView') await loadStaffDashboard();
}

async function initialize() {
  const urlParams = new URLSearchParams(window.location.search);
  const arrivedFromEmailVerification = urlParams.get('verified') === '1';
  if (arrivedFromEmailVerification) {
    switchAuthTab('login');
    showMessage('authMessage', 'Your email is now verified. You can access your GNC student account. You may now log in.', 'success');
    // Keep the confirmation notice visible while removing the one-time query flag.
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
  }
  if (!configReady) {
    setConnection(false, 'Setup needed');
    state.systemStatusError = 'Supabase is not configured. Student access is unavailable until the project settings are added.';
    applySystemAccessUI();
    showMessage('authMessage', 'Add your Supabase Project URL and publishable/anon key in config.js, then reload this page.', 'error');
    return;
  }
  setConnection(true, 'Connected to Supabase');
  await loadQueueSystemStatus();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) console.error(error);
  await handleSession(session);
  if (arrivedFromEmailVerification && !session) {
    const destination = state.systemStatus?.student_access_enabled ? $('authPanel') : $('studentAccessPaused');
    window.setTimeout(() => destination?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }
  supabase.auth.onAuthStateChange((_event, newSession) => {
    window.setTimeout(() => handleSession(newSession), 0);
  });
  startPolling();
}

async function handleSession(session) {
  state.session = session;
  await loadQueueSystemStatus();
  if (!session) {
    state.profile = null; state.currentTicket = null;
    $('staffNav').classList.add('hidden');
    cleanupRealtime();
    $('appPanel').classList.add('hidden'); $('signOutBtn').classList.add('hidden');
    applySystemAccessUI();
    startPolling();
    return;
  }
  $('authPanel').classList.add('hidden'); $('studentAccessPaused').classList.add('hidden');
  $('appPanel').classList.remove('hidden'); $('signOutBtn').classList.remove('hidden');
  try {
    await loadProfile();
    await Promise.all([loadServices(), loadCashiers(), loadPublicQueueBoard()]);
    updateProfileUI();
    await loadNotificationSettings();
    applySystemAccessUI();
    subscribeRealtime();
    if (state.profile.role === 'cashier' || state.profile.role === 'admin') $('staffNav').classList.remove('hidden');
    else $('staffNav').classList.add('hidden');
    const requestedView = new URLSearchParams(window.location.search).get('view');
    await showView(requestedView === 'myQueueView' ? 'myQueueView' : 'studentView');
    if (requestedView !== 'myQueueView') await loadMyQueue();
    if (['cashier','admin'].includes(state.profile.role)) await loadStaffDashboard();
    startPolling();
  } catch (err) {
    console.error(err); showToast(err.message || 'Unable to load your account.', true);
  }
}

function applySystemAccessUI() {
  const ready = state.systemStatusLoaded && !state.systemStatusError;
  const enabled = ready && state.systemStatus?.student_access_enabled === true;
  const signedIn = Boolean(state.session);
  const message = ready
    ? (state.systemStatus?.status_message || 'Online student access is temporarily paused by the cashier office. Please check again later.')
    : (state.systemStatusError || 'Checking cashier system availability. Student sign-in and new queue numbers are temporarily unavailable.');

  const pausedPanel = $('studentAccessPaused');
  if (pausedPanel) {
    pausedPanel.classList.toggle('hidden', signedIn || enabled);
    $('pausedAccessTitle').textContent = ready
      ? 'Online queue access is temporarily unavailable.'
      : 'Checking online queue availability…';
    $('pausedAccessMessage').textContent = ready
      ? message + ' Existing queue records are retained and cashier staff can continue serving already-issued numbers.'
      : message + ' Student sign-in and new queue numbers remain unavailable until status can be verified.';
  }
  setConnection(ready, ready ? (enabled ? 'Connected to Supabase' : 'Student access paused') : 'Checking access status');
  const authPanel = $('authPanel');
  if (authPanel && !signedIn) authPanel.classList.toggle('hidden', !enabled);
  for (const id of ['navStudentAccess', 'headerAccess', 'heroQueueLink']) {
    const link = $(id);
    if (!link) continue;
    link.href = enabled ? (signedIn ? '#studentView' : '#authPanel') : (signedIn ? '#appSystemPaused' : '#studentAccessPaused');
    if (id === 'heroQueueLink') link.innerHTML = enabled ? (signedIn ? 'Open my queue <span>→</span>' : 'Get a queue number <span>→</span>') : 'Online queue paused <span>→</span>';
    if (id === 'navStudentAccess') link.textContent = enabled ? (signedIn ? 'My portal' : 'Student Access') : 'Access Paused';
    if (id === 'headerAccess') link.innerHTML = enabled ? (signedIn ? '<span aria-hidden="true">♙</span> My Portal' : '<span aria-hidden="true">♙</span> Access Portal') : '<span aria-hidden="true">Ⅱ</span> Access Paused';
  }
  const appPaused = $('appSystemPaused');
  if (appPaused) {
    appPaused.classList.toggle('hidden', !signedIn || enabled);
    appPaused.textContent = message + ' Your existing ticket remains available under My queue. New queue numbers are disabled.';
  }
  const queueForm = $('queueForm');
  if (queueForm) {
    queueForm.querySelectorAll('input, select, textarea, button').forEach((control) => { control.disabled = !enabled; });
  }
}

async function loadQueueSystemStatus() {
  try {
    state.systemStatus = await api.getQueueSystemStatus();
    if (!state.systemStatus) throw new Error('The cashier system status has not been initialized. Ask the GNC administrator to apply the admin panel database upgrade.');
    state.systemStatusLoaded = true;
    state.systemStatusError = null;
    applySystemAccessUI();
  } catch (error) {
    state.systemStatus = null;
    state.systemStatusLoaded = false;
    state.systemStatusError = error.message || 'Unable to verify cashier system availability.';
    applySystemAccessUI();
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

function setNotificationMessage(message, isError = false) {
  const node = $('notificationSettingsMessage');
  if (!node) return;
  node.textContent = message || '';
  node.classList.toggle('error', Boolean(isError));
  node.classList.toggle('success', Boolean(message) && !isError);
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
}

function currentStudentEmail() {
  return String(state.session?.user?.email || state.profile?.email || '').trim();
}

async function loadNotificationSettings() {
  if (!state.profile || !state.session) return;
  const studentEmail = currentStudentEmail();
  $('notificationEmailLabel').textContent = studentEmail || 'No email address is saved on your profile.';
  $('emailAlertsEnabled').disabled = !studentEmail;
  $('saveEmailAlertsBtn').disabled = !studentEmail;
  try {
    state.notificationPreferences = await api.getNotificationPreferences(state.session.user.id);
    $('emailAlertsEnabled').checked = Boolean(state.notificationPreferences.email_enabled);
  } catch (error) {
    setNotificationMessage('Notification preferences are not ready. Apply the notification SQL migration first.', true);
  }
  try {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      const registration = await navigator.serviceWorker.getRegistration('./');
      const subscription = await registration?.pushManager.getSubscription();
      const permissionGranted = 'Notification' in window && Notification.permission === 'granted';
      const deviceEnabled = Boolean(state.notificationPreferences.device_enabled);
      $('disablePushNotificationsBtn').hidden = !deviceEnabled && !subscription;
      const publicVapidConfigured = Boolean(window.GNC_SUPABASE_CONFIG?.vapidPublicKey);
      $('enablePushNotificationsBtn').textContent = subscription && deviceEnabled
        ? 'Background alerts enabled'
        : (deviceEnabled && permissionGranted && publicVapidConfigured
          ? 'Enable background alerts' : (deviceEnabled && permissionGranted
            ? 'Foreground alerts enabled' : 'Enable device alerts'));
      $('pushNotificationStatus').textContent = subscription && deviceEnabled
        ? 'Background push alerts are subscribed on this browser.'
        : (subscription && !deviceEnabled
          ? 'This browser has a saved push subscription, but alerts are turned off for your account. Enable them to resume notifications.'
          : (deviceEnabled && permissionGranted
            ? 'Foreground alerts work while the GNC portal is open. Background alerts require VAPID setup and a browser subscription.'
            : (deviceEnabled
              ? 'Device alerts are enabled on your account. Allow browser notifications on this device to receive alerts here.'
              : 'Allow notifications on this device. Works on supported browsers over HTTPS.')));
    }
  } catch (error) {
    console.warn('Unable to inspect push subscription:', error);
  }
}

async function saveEmailNotificationPreference() {
  if (!state.session || !currentStudentEmail()) {
    setNotificationMessage('Your Supabase Auth account does not have a verified email address.', true);
    return;
  }
  const button = $('saveEmailAlertsBtn');
  setBusy(button, true, 'Saving…');
  try {
    state.notificationPreferences = await api.setEmailNotifications(
      state.session.user.id,
      $('emailAlertsEnabled').checked
    );
    setNotificationMessage(state.notificationPreferences.email_enabled
      ? `Email alerts enabled for ${currentStudentEmail()}.`
      : 'Email alerts have been turned off.');
  } catch (error) {
    setNotificationMessage(error.message || 'Could not save the email preference.', true);
  } finally {
    setBusy(button, false);
  }
}

async function enableDeviceNotifications() {
  const button = $('enablePushNotificationsBtn');
  setBusy(button, true, 'Enabling…');
  try {
    if (!state.session) throw new Error('Sign in to enable device notifications.');
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      throw new Error('This browser does not support web push notifications. Try an up-to-date browser on HTTPS.');
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notification permission was not granted. Enable notifications in your browser settings.');
    const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    const vapidKey = window.GNC_SUPABASE_CONFIG?.vapidPublicKey;
    if (vapidKey) {
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      });
      await api.savePushSubscription(state.session.user.id, subscription);
    }
    state.notificationPreferences = await api.setDeviceNotifications(state.session.user.id, true);
    $('disablePushNotificationsBtn').hidden = false;
    $('enablePushNotificationsBtn').textContent = vapidKey ? 'Background alerts enabled' : 'Foreground alerts enabled';
    $('pushNotificationStatus').textContent = vapidKey
      ? 'Background push alerts are enabled on this browser.'
      : 'Foreground alerts are enabled while the GNC portal is open. Background alerts require VAPID setup by the site administrator.';
    setNotificationMessage(vapidKey
      ? 'Device push notifications are enabled on this browser.'
      : 'Device alerts are enabled while this portal is open. Background device alerts will work after the administrator configures Web Push.');
  } catch (error) {
    setNotificationMessage(error.message || 'Could not enable device notifications.', true);
  } finally {
    setBusy(button, false);
  }
}

async function disableDeviceNotifications() {
  const button = $('disablePushNotificationsBtn');
  setBusy(button, true, 'Disabling…');
  try {
    const registration = await navigator.serviceWorker.getRegistration('./');
    const subscription = await registration?.pushManager.getSubscription();
    // device_enabled is a per-account preference, so disabling it also removes
    // every saved endpoint; otherwise a different device could silently reactivate.
    await api.removeAllPushSubscriptions(state.session.user.id);
    if (subscription) await subscription.unsubscribe();
    state.notificationPreferences = await api.setDeviceNotifications(state.session.user.id, false);
    $('disablePushNotificationsBtn').hidden = true;
    $('enablePushNotificationsBtn').textContent = 'Enable device alerts';
    $('pushNotificationStatus').textContent = 'Device alerts are disabled for this account and its saved devices.';
    setNotificationMessage('Device notifications have been disabled.');
  } catch (error) {
    setNotificationMessage(error.message || 'Could not disable device notifications.', true);
  } finally {
    setBusy(button, false);
  }
}

async function notifyCalledStudent(ticketId) {
  if (!ticketId) return { push: { sent: 0 }, email: { sent: false } };
  try {
    return await api.notifyStudentTurn(ticketId);
  } catch (error) {
    console.warn('Queue notification delivery failed:', error);
    return { deliveryError: error.message || 'Notification service is not deployed.' };
  }
}

function notificationSummary(result) {
  if (result?.deliveryError) return ' Student alert delivery is not configured yet.';
  const push = Number(result?.push?.sent || 0);
  const email = Boolean(result?.email?.sent);
  if (push || email) {
    const channels = [push ? 'device' : null, email ? 'email' : null].filter(Boolean).join(' and ');
    return ` Student notified by ${channels}.`;
  }
  const skipped = [result?.push?.skipped, result?.email?.skipped]
    .filter(value => typeof value === 'string' && value.trim());
  return skipped.length
    ? ` No alert was delivered. ${skipped.join(' ' )}`
    : ' No alert was delivered; ask the student to enable device or email notifications.';
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

async function showForegroundTurnNotification(ticket) {
  // Keep an in-tab notification fallback even when a push subscription exists:
  // if the push provider rejects an expired subscription, the open page can still alert.
  if (!ticket || !state.notificationPreferences.device_enabled) return;
  if (state.notifiedTicketIds.has(ticket.id)) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const title = 'GNC Cashier — Your turn';
  const body = `Your number ${ticket.ticket_code} is now being served at ${ticket.cashier_windows?.name || 'the cashier'}. Please proceed to the counter.`;
  const notificationTag = `gnc-${ticket.id}-${ticket.called_at || ticket.id}`;
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration?.showNotification) {
      await registration.showNotification(title, {
        body,
        icon: '/assets/gnc-official-crest.png',
        badge: '/assets/gnc-official-crest.png',
        tag: notificationTag,
        renotify: false,
        requireInteraction: true,
        data: { url: '/?view=myQueueView' }
      });
    } else {
      new Notification(title, { body, icon: '/assets/gnc-official-crest.png', tag: notificationTag, renotify: false });
    }
    state.notifiedTicketIds.add(ticket.id);
  } catch (error) {
    console.warn('Foreground notification failed:', error);
  }
}

async function loadMyQueue() {
  if (!state.profile) return;
  const date = currentManilaDate();
  try { state.currentTicket = await api.getMyActiveTicket(state.session.user.id, date); }
  catch (error) { console.error(error); return; }
  // Alert on the waiting -> serving transition, or when a student opens/returns
  // to the portal after the ticket has already been called. Notification tags
  // prevent duplicate OS alerts for the same ticket/call timestamp.
  if (state.currentTicket?.status === 'serving') {
    await showForegroundTurnNotification(state.currentTicket);
  }
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
  if (!state.systemStatusLoaded || state.systemStatusError || state.systemStatus?.student_access_enabled !== true) {
    showMessage('queueFormMessage', state.systemStatus?.status_message || state.systemStatusError || 'Online queue access is temporarily paused.', 'error');
    return;
  }
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
    await loadPublicQueueBoard();
    await showView('myQueueView');
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
    const ticketId = await api.callNext(windowId);
    const notificationResult = await notifyCalledStudent(ticketId);
    showToast(`Next queue number called.${notificationSummary(notificationResult)}`);
    await Promise.all([loadStaffDashboard(), loadPublicQueueBoard()]);
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
    await loadMyQueue();
    if (state.activeView === 'staffView') await loadStaffDashboard();
  });
}
function startPolling() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  // Status and the public board refresh even when signed out, so an admin
  // pause/resume is reflected on the public landing page without a reload.
  state.refreshTimer = setInterval(async () => {
    await loadQueueSystemStatus();
    try { await loadPublicQueueBoard(); }
    catch (e) { console.warn('Public queue refresh failed:', e.message); }
    if (!state.session) return;
    if (state.activeView === 'myQueueView' || state.notificationPreferences.device_enabled) await loadMyQueue();
    if (state.activeView === 'staffView') await loadStaffDashboard();
  }, 4000);
}

// Refresh immediately when the visitor returns to the page, rather than
// waiting for the next polling tick after the admin resumes or pauses access.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && configReady) loadQueueSystemStatus();
});
window.addEventListener('focus', () => { if (configReady) loadQueueSystemStatus(); });

function getEmailVerificationRedirect() {
  const configured = String(window.GNC_SUPABASE_CONFIG?.emailRedirectUrl || '').trim();
  if (!configured) {
    throw new Error('The GNC email verification URL is not configured. Set emailRedirectUrl in config.js to the deployed /email-verified.html page.');
  }
  const target = new URL(configured);
  if (target.protocol !== 'https:' || target.hostname === 'localhost') {
    throw new Error('The GNC email verification URL must be the deployed HTTPS website, not localhost.');
  }
  return target.href;
}

async function resendStudentVerification(email, messageElementId = 'signupVerificationMessage') {
  const address = String(email || '').trim();
  if (!address) {
    if (messageElementId === 'signupVerificationMessage') showMessage(messageElementId, 'Enter your email address first.', 'error');
    else showMessage('authMessage', 'Enter your email address first.', 'error');
    return;
  }
  const button = messageElementId === 'signupVerificationMessage' ? $('resendSignupVerificationBtn') : $('resendVerificationBtn');
  setBusy(button, true, 'Sending…');
  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: address,
      options: { emailRedirectTo: getEmailVerificationRedirect() }
    });
    if (error) throw error;
    if (messageElementId === 'signupVerificationMessage') showMessage(messageElementId, 'A new verification email has been requested. Check your inbox and spam folder.', 'success');
    else showMessage('authMessage', 'A new verification email has been requested. Check your inbox and spam folder.', 'success');
  } catch (error) {
    if (messageElementId === 'signupVerificationMessage') showMessage(messageElementId, error.message || 'Could not resend the verification email.', 'error');
    else showMessage('authMessage', error.message || 'Could not resend the verification email.', 'error');
  } finally { setBusy(button, false); }
}

function returnToStudentLogin() {
  $('signupVerificationPanel')?.classList.add('hidden');
  $('authTabs')?.classList.remove('hidden');
  $('signupForm')?.classList.add('hidden');
  switchAuthTab('login');
  $('loginEmail').focus();
}

async function handleLogin(event) {
  event.preventDefault(); clearMessage('authMessage');
  $('resendVerificationBtn').classList.add('hidden');
  const btn = $('loginForm').querySelector('button[type="submit"]'); setBusy(btn, true, 'Signing in…');
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: $('loginEmail').value.trim(), password: $('loginPassword').value });
    if (error) throw error;
  } catch (err) {
    const code = String(err.code || '').toLowerCase();
    const text = String(err.message || '').toLowerCase();
    const unverified = code === 'email_not_confirmed' || text.includes('email not confirmed') || text.includes('email_not_confirmed');
    showMessage('authMessage', unverified
      ? 'Your email address is not verified yet. Open the verification link we sent to your inbox, then sign in. You can request a new link below.'
      : (err.message || 'Unable to sign in.'), 'error');
    $('resendVerificationBtn').classList.toggle('hidden', !unverified);
  }
  finally { setBusy(btn, false); }
}
async function handleSignup(event) {
  event.preventDefault(); clearMessage('authMessage');
  const btn = $('signupForm').querySelector('button[type="submit"]'); setBusy(btn, true, 'Creating account…');
  try {
    const email = $('signupEmail').value.trim();
    const { data, error } = await supabase.auth.signUp({
      email, password: $('signupPassword').value,
      options: {
        emailRedirectTo: getEmailVerificationRedirect(),
        data: {
          full_name: $('signupName').value.trim(), student_number: $('signupStudentNo').value.trim(),
          program: $('signupProgram').value.trim(), year_level: $('signupYear').value.trim()
        }
      }
    });
    if (error) throw error;
    $('signupForm').reset();
    if (!data.session) {
      $('verificationEmailAddress').textContent = email;
      $('authTabs').classList.add('hidden');
      $('signupForm').classList.add('hidden');
      $('signupVerificationPanel').classList.remove('hidden');
      clearMessage('authMessage');
    } else {
      // Projects with email confirmation disabled may return a session immediately.
      switchAuthTab('login');
      showMessage('authMessage', 'Your account is ready. You may now sign in to the GNC student portal.', 'success');
    }
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
$('resendSignupVerificationBtn')?.addEventListener('click', () => resendStudentVerification($('verificationEmailAddress').textContent));
$('backToLoginFromVerification')?.addEventListener('click', returnToStudentLogin);
$('resendVerificationBtn')?.addEventListener('click', () => resendStudentVerification($('loginEmail').value, 'authMessage'));
$('queueForm').addEventListener('submit', handleQueueRequest);
$('signOutBtn').addEventListener('click', signOut);
$('refreshQueueBtn').addEventListener('click', async () => { await Promise.all([loadMyQueue(), loadPublicQueueBoard()]); showToast('Queue status refreshed.'); });
$('refreshStaffBtn').addEventListener('click', loadStaffDashboard);
$('staffCashierSelect').addEventListener('change', loadStaffDashboard);
$('callNextBtn').addEventListener('click', callNext);
$('completeTicketBtn').addEventListener('click', () => updateCurrentTicket('completed'));
$('skipTicketBtn').addEventListener('click', () => updateCurrentTicket('no_show'));
$('saveEmailAlertsBtn').addEventListener('click', saveEmailNotificationPreference);
$('enablePushNotificationsBtn').addEventListener('click', enableDeviceNotifications);
$('disablePushNotificationsBtn').addEventListener('click', disableDeviceNotifications);

initialize().catch(err => { console.error(err); setConnection(false, 'Connection error'); showToast(err.message || 'Unable to connect to Supabase.', true); });
