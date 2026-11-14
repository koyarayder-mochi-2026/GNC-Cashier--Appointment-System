import { api, configReady } from './api.js';

const $ = (id) => document.getElementById(id);
let soundEnabled = false;
let firstSuccessfulLoad = true;
let previousServing = new Map();
let refreshInProgress = false;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function speak(text) {
  if (!soundEnabled || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-PH';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}
function render(rows) {
  const grid = $('counterGrid');
  if (!rows.length) {
    grid.innerHTML = '<article class="counter-card loading"><p>No cashier counters are currently open.</p></article>';
    return;
  }
  grid.innerHTML = rows.map(row => {
    const serving = row.serving_ticket_code;
    const count = Number(row.waiting_count || 0);
    return `<article class="counter-card">
      <div class="counter-top"><span class="counter-title">${escapeHtml(row.cashier_name).toUpperCase()}</span><span class="open-label">${row.is_active ? '● OPEN' : '● FINISHING QUEUE'}</span></div>
      <div class="now-label">NOW SERVING</div>
      <div class="ticket-number ${serving ? '' : 'not-serving'}">${serving ? escapeHtml(serving) : '—'}</div>
      <div class="queue-meta"><div><strong>${count}</strong><span>WAITING</span></div><div><strong>${serving ? 'Proceed' : 'Please wait'}</strong><span>QUEUE STATUS</span></div></div>
    </article>`;
  }).join('');
}
async function refresh() {
  if (refreshInProgress) return;
  refreshInProgress = true;
  try {
    const rows = await api.getPublicQueueStatus();
    render(rows);
    $('connection').textContent = 'LIVE';
    $('connection').classList.add('online');
    $('errorBanner').hidden = true;
    $('lastUpdated').textContent = new Date().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    if (!firstSuccessfulLoad) {
      for (const row of rows) {
        const oldCode = previousServing.get(row.cashier_window_id) || null;
        const newCode = row.serving_ticket_code || null;
        if (newCode && newCode !== oldCode) speak(`Now serving ${newCode} at ${row.cashier_name}.`);
      }
    }
    previousServing = new Map(rows.map(row => [row.cashier_window_id, row.serving_ticket_code || null]));
    firstSuccessfulLoad = false;
  } catch (error) {
    $('connection').textContent = 'OFFLINE';
    $('connection').classList.remove('online');
    $('errorBanner').hidden = false;
    $('errorBanner').textContent = error.message || 'Unable to retrieve the queue. Check the Supabase configuration.';
  } finally {
    refreshInProgress = false;
  }
}
$('soundToggle').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  $('soundToggle').setAttribute('aria-pressed', String(soundEnabled));
  $('soundToggle').textContent = soundEnabled ? 'Voice announcements enabled' : 'Enable voice announcements';
  if (soundEnabled) speak('Voice announcements enabled.');
});
function updateClock() {
  $('manilaClock').textContent = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit'
  }).format(new Date());
}
if (!configReady) {
  $('connection').textContent = 'SETUP REQUIRED';
  $('errorBanner').hidden = false;
  $('errorBanner').textContent = 'Add your Supabase Project URL and publishable key to config.js, then reload this page.';
} else {
  refresh();
  window.setInterval(refresh, 5000);
}
updateClock();
window.setInterval(updateClock, 1000);
